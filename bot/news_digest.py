"""
news_digest.py — Generates a 4-hour intelligence briefing for the Strait of Hormuz channel.

Every DIGEST_INTERVAL seconds:
  1. Fetches news from broader RSS feeds (Reuters, BBC, Al Jazeera, etc.)
  2. Filters for US/Iran/military/oil keywords from the past 24 hours
  3. Pulls live vessel traffic from aisstream.io
  4. Sends everything to Ollama to write a factual intelligence briefing
  5. Posts it to the Telegram channel

Falls back gracefully at each stage — if Ollama is down, posts raw bullet-point
summary. If AIS is unavailable, posts briefing without ship data.
"""

import asyncio
import logging
import re
import time
from datetime import datetime, timezone, timedelta

import aiohttp
import feedparser

from ollama_client import chat as ollama_chat, is_running as ollama_running
from ship_tracker import get_strait_traffic, format_traffic_block

logger = logging.getLogger(__name__)

# ── Additional news sources for the digest ────────────────────────────────────
# These are broader than the main bot sources — focused on US/Iran/military news

DIGEST_FEEDS = {
    "Reuters World":       "https://feeds.reuters.com/reuters/worldNews",
    "BBC Middle East":     "http://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
    "Al Jazeera":          "https://www.aljazeera.com/xml/rss/all.xml",
    "Middle East Eye":     "https://www.middleeasteye.net/rss",
    "The Guardian ME":     "https://www.theguardian.com/world/iran/rss",
    "Defense News":        "https://www.defensenews.com/arc/outboundfeeds/rss/",
}

DIGEST_KEYWORDS = [
    "iran", "irgc", "nuclear", "tehran", "khamenei", "rouhani", "raisi",
    "us military", "pentagon", "centcom", "carrier strike", "uss ",
    "strait of hormuz", "hormuz", "persian gulf", "gulf of oman",
    "tanker", "seizure", "boarding", "mine", "torpedo",
    "sanctions", "oil embargo", "crude", "opec",
    "missile", "drone attack", "airstrike", "proxy",
    "hezbollah", "houthi", "hamas", "red sea",
    "war", "conflict", "escalation", "ceasefire",
]

LOOKAHEAD_HOURS = 24  # How far back to look for news items

# ── System prompt for Ollama ──────────────────────────────────────────────────

_DIGEST_SYSTEM = """You write concise intelligence briefings for a Telegram channel that tracks the Strait of Hormuz and US/Iran tensions.

Your tone is that of a well-read analyst — factual, direct, no sensationalism. You write for an audience that follows geopolitics and oil markets.

Rules:
- 300-400 words maximum
- Plain prose, no bullet points, no headers
- No emojis
- No phrases like "In conclusion", "It is worth noting", "As we can see"
- Never start a sentence with "It is important to"
- Reference specific events, dates, and names from the news provided
- If the situation is genuinely quiet, say so plainly and explain what calm means for oil supply
- End with one sentence on what to watch in the next 24-48 hours
- Do not editorialize beyond the facts provided"""

_DIGEST_USER = """Here are news items from the past 24 hours relevant to US/Iran tensions and the Strait of Hormuz:

{news_block}

Current vessel traffic in the Strait of Hormuz:
{ship_block}

Write an intelligence briefing covering:
1. The current state of US/Iran relations and any notable military or diplomatic developments
2. Any activity in or near the Strait — naval movements, tanker incidents, shipping disruptions
3. Oil market context if relevant (only if mentioned in the news above)
4. What to watch over the next 24-48 hours

Do not fabricate any details. If the news is sparse, say the picture is quiet and explain what that means."""

_QUIET_USER = """No significant news has come through in the past 24 hours related to US/Iran tensions or the Strait of Hormuz.

Current vessel traffic in the Strait of Hormuz:
{ship_block}

Write a brief intelligence briefing (150-200 words) noting:
- That it has been a quiet period
- What "quiet" means in context of the Strait (baseline traffic, oil flows)
- What could change the picture and what signals to watch

Do not fabricate news. Keep it honest and grounded."""


# ── News fetcher ──────────────────────────────────────────────────────────────

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; HormuzBot/1.0; news aggregator)"
}


async def _fetch_feed_text(session: aiohttp.ClientSession, url: str) -> str | None:
    try:
        async with session.get(
            url, headers=_HEADERS, timeout=aiohttp.ClientTimeout(total=15)
        ) as resp:
            if resp.status == 200:
                return await resp.text()
    except Exception as e:
        logger.debug("Digest feed fetch failed %s: %s", url, e)
    return None


def _entry_is_recent(entry, hours: int = LOOKAHEAD_HOURS) -> bool:
    """Return True if the entry was published within the last `hours` hours."""
    cutoff = time.time() - (hours * 3600)
    for attr in ("published_parsed", "updated_parsed"):
        parsed = getattr(entry, attr, None)
        if parsed:
            return time.mktime(parsed) >= cutoff
    return True  # If no timestamp, include it


def _entry_is_relevant(entry) -> bool:
    """Return True if the entry text mentions any digest keyword."""
    text = " ".join([
        getattr(entry, "title", ""),
        getattr(entry, "summary", ""),
    ]).lower()
    return any(kw in text for kw in DIGEST_KEYWORDS)


def _entry_text(entry) -> str:
    title = getattr(entry, "title", "").strip()
    summary = re.sub(r"<[^>]+>", "", getattr(entry, "summary", "")).strip()
    summary = re.sub(r"\s+", " ", summary)
    if summary and len(summary) > 20:
        # Truncate to 300 chars to keep the context manageable
        return f"{title} — {summary[:300]}"
    return title


async def fetch_digest_news() -> list[str]:
    """
    Fetch and filter news from digest RSS feeds.
    Returns a list of headline+summary strings from the past 24 hours.
    """
    items: list[str] = []

    async with aiohttp.ClientSession() as session:
        tasks = {
            name: _fetch_feed_text(session, url)
            for name, url in DIGEST_FEEDS.items()
        }
        results = await asyncio.gather(*tasks.values(), return_exceptions=True)

    for (name, _), result in zip(DIGEST_FEEDS.items(), results):
        if isinstance(result, Exception) or result is None:
            logger.debug("Digest feed unavailable: %s", name)
            continue

        feed = feedparser.parse(result)
        count = 0
        for entry in feed.entries:
            if _entry_is_recent(entry) and _entry_is_relevant(entry):
                text = _entry_text(entry)
                if text:
                    items.append(f"[{name}] {text}")
                    count += 1
                    if count >= 6:  # Cap per source to avoid one dominating
                        break

        if count:
            logger.debug("Digest: %d items from %s", count, name)

    logger.info("Digest: %d total relevant items from past 24h", len(items))
    return items


# ── Digest generator ──────────────────────────────────────────────────────────

async def generate_digest(channel_news: list[str]) -> str:
    """
    Generate the full 4-hour intelligence briefing.

    Args:
        channel_news: Recent items already forwarded by the main bot (for context).

    Returns:
        A formatted Telegram message ready to post.
    """
    # Gather data concurrently
    feed_news_task = asyncio.create_task(fetch_digest_news())
    ship_task = asyncio.create_task(get_strait_traffic())

    feed_news, ship_snapshot = await asyncio.gather(feed_news_task, ship_task)

    # Combine channel news (already filtered for relevance) with broader feed news
    all_news = list(channel_news[-10:]) + feed_news  # Channel news first (most filtered)

    ship_block = format_traffic_block(ship_snapshot)
    now_utc = datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC")

    # Generate the briefing via Ollama
    briefing = None
    if await ollama_running():
        if all_news:
            news_block = "\n".join(f"• {item}" for item in all_news[:25])
            user_prompt = _DIGEST_USER.format(
                news_block=news_block,
                ship_block=ship_block,
            )
        else:
            user_prompt = _QUIET_USER.format(ship_block=ship_block)

        briefing = await ollama_chat(
            system=_DIGEST_SYSTEM,
            user=user_prompt,
            max_tokens=500,
            temperature=0.5,  # Lower = more factual/consistent
        )
    else:
        logger.warning("Ollama not running — falling back to raw news summary for digest")

    # Format the final post
    lines = [f"HORMUZ INTEL — {now_utc}", ""]

    if briefing:
        lines.append(briefing)
    else:
        # Fallback: plain text summary if Ollama is unavailable
        lines.append("Situation summary (Ollama offline — install from ollama.com for AI briefings):")
        lines.append("")
        if all_news:
            for item in all_news[:8]:
                lines.append(f"— {item}")
        else:
            lines.append("No significant developments in the past 24 hours.")

    lines.append("")
    lines.append("---")
    lines.append(ship_block)
    lines.append("")
    lines.append(f"@StateOfHormuz | $HORMUZ on Solana")

    return "\n".join(lines)
