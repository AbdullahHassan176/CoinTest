"""
rss_poller.py — Polls Telegram channels for new posts and returns new entries.

Strategy (tried in order per channel):
  1. tg.i-c-a.su RSS proxy
  2. RSSHub RSS proxy
  3. Direct t.me/s/{username} HTML scrape (Telegram's own web preview — most reliable)
"""

import asyncio
import html
import logging
import re
import time
from dataclasses import dataclass, field

import aiohttp
import feedparser

from config import SOURCE_CHANNELS, RSS_TEMPLATES, POLL_INTERVAL

logger = logging.getLogger(__name__)

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}


@dataclass
class FeedEntry:
    title: str
    text: str
    url: str
    source_name: str
    source_username: str
    published_ts: float = field(default_factory=time.time)


def _clean_text(raw: str) -> str:
    """
    Strip HTML tags, decode HTML entities, remove Telegram channel handles
    and source attribution lines appended by channels to their own posts.
    """
    # Strip HTML tags
    text = re.sub(r"<[^>]+>", "", raw)
    # Decode HTML entities: &#39; → '  &amp; → &  &lt; → <  etc.
    text = html.unescape(text)
    # Remove trailing @Handle✅ signatures
    text = re.sub(r"\s*@\w+\s*✅?\s*$", "", text, flags=re.MULTILINE)
    # Remove inline source-attribution lines channels append to their posts:
    #   e.g. "📡 @OsinttechnicalView on Monitor The Situation"
    #        "View on Monitor The Situation"
    #        "@OsinttechnicalView"
    text = re.sub(r"📡\s*@\w+.*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"^View on .+$", "", text, flags=re.MULTILINE)
    # Collapse multiple spaces/newlines left by removals
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


class RSSPoller:
    def __init__(self) -> None:
        self._last_seen: dict[str, float] = {}
        # URL-based deduplication — prevents same entry replaying when timestamps are unreliable
        self._seen_urls: set[str] = set()
        self._seen_urls_ordered: list[str] = []  # For capped eviction
        self._SEEN_URL_LIMIT = 1000

    # ── RSS path ──────────────────────────────────────────────────────────────

    async def _fetch_url(self, session: aiohttp.ClientSession, url: str) -> str | None:
        try:
            async with session.get(
                url,
                headers=_HEADERS,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status == 200:
                    return await resp.text()
        except Exception as e:
            logger.debug("Fetch failed for %s: %s", url, e)
        return None

    async def _get_feed_via_rss(
        self, session: aiohttp.ClientSession, username: str
    ) -> list[FeedEntry] | None:
        """Try RSS proxy templates. Returns entries or None."""
        for template in RSS_TEMPLATES:
            url = template.format(username=username)
            raw = await self._fetch_url(session, url)
            if not raw:
                continue
            feed = feedparser.parse(raw)
            if not feed.entries:
                continue
            logger.debug("RSS OK for @%s via %s (%d entries)", username, url, len(feed.entries))
            entries = []
            for e in feed.entries:
                text = self._rss_entry_text(e)
                if not text:
                    continue
                entries.append(FeedEntry(
                    title=getattr(e, "title", ""),
                    text=text,
                    url=getattr(e, "link", ""),
                    source_name="",
                    source_username=username,
                    published_ts=self._rss_entry_ts(e),
                ))
            return entries
        return None

    def _rss_entry_ts(self, entry) -> float:
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            return time.mktime(entry.published_parsed)
        if hasattr(entry, "updated_parsed") and entry.updated_parsed:
            return time.mktime(entry.updated_parsed)
        return time.time()

    def _rss_entry_text(self, entry) -> str:
        raw = ""
        if hasattr(entry, "summary") and entry.summary:
            raw = entry.summary
        elif hasattr(entry, "title") and entry.title:
            raw = entry.title
        return _clean_text(raw)

    # ── Direct t.me/s scrape path ─────────────────────────────────────────────

    async def _get_feed_via_scrape(
        self, session: aiohttp.ClientSession, username: str
    ) -> list[FeedEntry] | None:
        """
        Scrape t.me/s/{username} — Telegram's public web preview.
        Parses post text and timestamps directly from the HTML.
        """
        url = f"https://t.me/s/{username}"
        html = await self._fetch_url(session, url)
        if not html:
            return None

        # Extract message blocks: each post is inside tgme_widget_message_wrap
        # Text is in <div class="tgme_widget_message_text ...">
        # Timestamp is in <time datetime="2024-01-01T12:00:00+00:00">
        # Post link is in <a class="tgme_widget_message_date" href="...">

        entries: list[FeedEntry] = []

        # Find all message blocks
        blocks = re.findall(
            r'<div class="tgme_widget_message_wrap[^"]*">(.*?)</div>\s*</div>\s*</div>',
            html,
            re.DOTALL,
        )

        if not blocks:
            # Simpler fallback: just grab all message texts
            texts = re.findall(
                r'<div class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>',
                html,
                re.DOTALL,
            )
            times = re.findall(r'<time datetime="([^"]+)"', html)
            links = re.findall(
                r'href="(https://t\.me/' + re.escape(username) + r'/\d+)"',
                html,
            )

            for i, raw_text in enumerate(texts):
                text = _clean_text(raw_text)
                if not text:
                    continue
                ts = self._parse_iso_time(times[i]) if i < len(times) else time.time()
                post_url = links[i] if i < len(links) else f"https://t.me/{username}"
                entries.append(FeedEntry(
                    title="",
                    text=text,
                    url=post_url,
                    source_name="",
                    source_username=username,
                    published_ts=ts,
                ))
        else:
            for block in blocks:
                raw_text = ""
                text_match = re.search(
                    r'class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>',
                    block,
                    re.DOTALL,
                )
                if text_match:
                    raw_text = text_match.group(1)

                text = _clean_text(raw_text)
                if not text:
                    continue

                time_match = re.search(r'<time datetime="([^"]+)"', block)
                ts = self._parse_iso_time(time_match.group(1)) if time_match else time.time()

                link_match = re.search(
                    r'href="(https://t\.me/' + re.escape(username) + r'/\d+)"',
                    block,
                )
                post_url = link_match.group(1) if link_match else f"https://t.me/{username}"

                entries.append(FeedEntry(
                    title="",
                    text=text,
                    url=post_url,
                    source_name="",
                    source_username=username,
                    published_ts=ts,
                ))

        if entries:
            logger.debug("Scrape OK for @%s (%d entries)", username, len(entries))
            return entries

        logger.debug("Scrape returned no entries for @%s", username)
        return None

    def _parse_iso_time(self, iso: str) -> float:
        """Parse ISO 8601 datetime string to Unix timestamp."""
        try:
            from datetime import datetime, timezone
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return dt.timestamp()
        except Exception:
            return time.time()

    # ── Combined fetch ────────────────────────────────────────────────────────

    async def _get_entries(
        self, session: aiohttp.ClientSession, name: str, username: str
    ) -> list[FeedEntry]:
        """Try RSS proxies first, then direct scrape. Returns stamped entries."""
        entries = await self._get_feed_via_rss(session, username)

        if entries is None:
            entries = await self._get_feed_via_scrape(session, username)

        if entries is None:
            logger.warning("All sources failed for @%s", username)
            return []

        # Stamp source name (not available inside sub-methods)
        for e in entries:
            e.source_name = name

        return entries

    # ── Poll cycle ────────────────────────────────────────────────────────────

    async def poll_once(self) -> list[FeedEntry]:
        """Poll all channels once. Returns new entries since last poll."""
        new_entries: list[FeedEntry] = []

        async with aiohttp.ClientSession() as session:
            results = await asyncio.gather(
                *[
                    self._get_entries(session, name, username)
                    for name, username in SOURCE_CHANNELS.items()
                ],
                return_exceptions=True,
            )

        for (name, username), result in zip(SOURCE_CHANNELS.items(), results):
            if isinstance(result, Exception):
                logger.error("Error fetching @%s: %s", username, result)
                continue

            entries: list[FeedEntry] = result  # type: ignore
            last_ts = self._last_seen.get(username, 0.0)

            channel_new = []
            batch_urls: set[str] = set()  # deduplicate within this poll cycle too
            for e in entries:
                if not e.text:
                    continue
                # Primary dedup: URL — check both the persistent set and within-batch
                if e.url and (e.url in self._seen_urls or e.url in batch_urls):
                    continue
                # Secondary: timestamp (catches entries without URLs)
                if e.published_ts <= last_ts:
                    continue
                channel_new.append(e)
                if e.url:
                    batch_urls.add(e.url)

            if channel_new:
                self._last_seen[username] = max(e.published_ts for e in channel_new)
                for e in channel_new:
                    if e.url:
                        self._seen_urls.add(e.url)
                        self._seen_urls_ordered.append(e.url)
                # Evict oldest URLs when limit exceeded
                while len(self._seen_urls_ordered) > self._SEEN_URL_LIMIT:
                    old = self._seen_urls_ordered.pop(0)
                    self._seen_urls.discard(old)
                new_entries.extend(channel_new)
                logger.info("@%s: %d new entries", username, len(channel_new))

        new_entries.sort(key=lambda e: e.published_ts)
        return new_entries

    async def run(self, on_entry) -> None:
        """Continuously poll every POLL_INTERVAL seconds."""
        logger.info(
            "RSS poller started — checking %d channels every %ds",
            len(SOURCE_CHANNELS),
            POLL_INTERVAL,
        )

        # Seed last_seen to current time so old posts aren't replayed on startup.
        # Also do one silent poll to populate _seen_urls before we start forwarding.
        now = time.time()
        for username in SOURCE_CHANNELS.values():
            self._last_seen[username] = now
        logger.info("Seeding seen-URL cache — fetching current posts to suppress replay...")
        async with aiohttp.ClientSession() as session:
            seed_results = await asyncio.gather(
                *[
                    self._get_entries(session, name, username)
                    for name, username in SOURCE_CHANNELS.items()
                ],
                return_exceptions=True,
            )
        for result in seed_results:
            if isinstance(result, list):
                for e in result:
                    if e.url:
                        self._seen_urls.add(e.url)
                        self._seen_urls_ordered.append(e.url)
        logger.info("Seeded %d known URLs — only new posts will be forwarded", len(self._seen_urls))

        while True:
            try:
                new_entries = await self.poll_once()
                for entry in new_entries:
                    await on_entry(entry)
            except Exception as e:
                logger.error("Polling error: %s", e)

            await asyncio.sleep(POLL_INTERVAL)
