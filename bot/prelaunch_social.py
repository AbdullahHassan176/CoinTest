"""
Pre-launch social rotation — automates the "where to be" + 3 post types table.

- Telegram @StateOfHormuz: 1×/day rotated copy (news / build / meme) + optional
  one-line hook from recent channel intel. Uses main.post_message (legal footer applied).
- Bluesky: optional short mirror (≤300 chars) same day — set PRELAUNCH_MIRROR_BLUESKY=1.
- X + Reddit: appends drafts to outreach/social_drafts/ for you to post manually
  (Reddit rules + spam risk make auto-post unsafe).

Env (see .env.example):
  PRELAUNCH_DAILY_ENABLED=1
  PRELAUNCH_DAILY_HOUR=12          # UTC hour 0–23 for the daily tick
  PRELAUNCH_MIRROR_BLUESKY=0
  PRELAUNCH_WRITE_DRAFTS=1
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

SITE_URL = os.getenv("SITE_URL", "https://stateofhormuz.org")
TG_INTEL = "https://t.me/StateOfHormuz"
BSKY_PROFILE = os.getenv("BLUESKY_PROFILE_URL", "https://bsky.app/profile/makingtheworldmove.bsky.social")

_ENABLED = os.getenv("PRELAUNCH_DAILY_ENABLED", "0").strip().lower() in ("1", "true", "yes")
_MIRROR_BSKY = os.getenv("PRELAUNCH_MIRROR_BLUESKY", "0").strip().lower() in ("1", "true", "yes")
_WRITE_DRAFTS = os.getenv("PRELAUNCH_WRITE_DRAFTS", "1").strip().lower() in ("1", "true", "yes")
_DAILY_HOUR = int(os.getenv("PRELAUNCH_DAILY_HOUR", "12"))

_ROTATION_FILE = Path(__file__).parent / ".prelaunch_rotation_idx"
_DRAFT_DIR = Path(__file__).parent.parent / "outreach" / "social_drafts"


def _next_kind() -> str:
    """Rotate 'news' → 'build' → 'meme' → ..."""
    idx = 0
    if _ROTATION_FILE.exists():
        try:
            idx = int(_ROTATION_FILE.read_text().strip()) % 3
        except ValueError:
            idx = 0
    kinds = ("news", "build", "meme")
    kind = kinds[idx]
    _ROTATION_FILE.write_text(str((idx + 1) % 3))
    return kind


def _news_hook(recent_news: list[str]) -> str:
    if not recent_news:
        return "Follow the live feed for Gulf / Hormuz–linked updates as they break."
    line = recent_news[-1].replace("\n", " ").strip()
    if len(line) > 220:
        line = line[:217] + "…"
    return f"Recent intel line: {line}"


def build_telegram_post(kind: str, news_hook: str) -> str:
    if kind == "news":
        return (
            f"{news_hook}\n\n"
            "One narrow strait still moves a big share of traded crude; when headlines hit, "
            "liquidity reprices fast.\n\n"
            f"Free intel channel: {TG_INTEL}\n"
            f"Official links + airdrop: {SITE_URL}\n"
            "$HORMUZ on Solana — community / narrative token; not financial advice."
        )
    if kind == "build":
        return (
            "Build / proof (check the site for the live tx links): staking, DAO votes, "
            "LP lock, team vesting — we publish what we can verify on-chain.\n\n"
            f"{SITE_URL}\n"
            f"Intel feed: {TG_INTEL}\n"
            "$HORMUZ — DYOR; no return promises."
        )
    # meme — tasteful, no war profiteering
    return (
        "Map check: the Strait of Hormuz is tiny on a globe and huge in energy plumbing. "
        "If you like that geography-meets-markets rabbit hole, the feed is free.\n\n"
        f"{TG_INTEL}\n{SITE_URL}\n"
        "$HORMUZ on Solana — meme/utility community token; not financial advice."
    )


def _bluesky_short(telegram_body: str) -> str:
    """One-liner + links; stay under 300 chars; no huge legal block."""
    base = (
        f"HORMUZ — Strait of Hormuz intel + Solana community token. "
        f"Feed: {TG_INTEL} · Links: {SITE_URL} · Not financial advice."
    )
    if len(base) <= 300:
        return base
    return base[:297] + "..."


def _write_drafts(kind: str, news_hook: str) -> None:
    if not _WRITE_DRAFTS:
        return
    _DRAFT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # X / Twitter — 3-tweet style draft (you split on ---)
    x_path = _DRAFT_DIR / "x_thread_queue.txt"
    if kind == "news":
        t1 = "Strait fact: most seaborne oil for several Gulf producers still routes through Hormuz-adjacent lanes — one incident reprices Brent/WTI fast."
        t2 = "$HORMUZ is a Solana community token tied to that narrative + a public intel channel — not oil exposure, not advice."
        t3 = f"Channel {TG_INTEL} · Hub {SITE_URL}"
    elif kind == "build":
        t1 = "What we publish on-chain for HORMUZ: staking, DAO, locks / vesting — links on the site, verify yourself."
        t2 = "Devnet vs mainnet is spelled on stateofhormuz.org — don’t trust screenshots from random DMs."
        t3 = f"{SITE_URL} · {TG_INTEL}"
    else:
        t1 = "Geography joke that’s also risk: the strait is a short sail and a long story in commodity markets."
        t2 = "Free feed if you like that intersection: Hormuz + shipping + headlines."
        t3 = f"{TG_INTEL} · {SITE_URL} · $HORMUZ DYOR"

    x_block = f"\n### {stamp} [{kind}]\n{t1}\n---\n{t2}\n---\n{t3}\n\n"
    x_path.open("a", encoding="utf-8").write(x_block)

    # Reddit — lead with intel; light token touch (post manually; read sub rules first)
    r_path = _DRAFT_DIR / "reddit_queue.md"
    r_body = (
        f"## Draft {stamp} ({kind})\n\n"
        "**Suggested title:** Strait of Hormuz — free Telegram intel feed (+ Solana community project)\n\n"
        "**Body (edit for sub rules):**\n\n"
        f"I run a free aggregated feed for Gulf / Hormuz–linked shipping and energy headlines: {TG_INTEL}. "
        f"Project hub with disclosures: {SITE_URL}. "
        "There is also a community Solana token ($HORMUZ) — not financial advice, not a fund. "
        "Happy to take questions in comments.\n\n"
        f"_Raw hook for context:_ {news_hook}\n\n"
        "---\n\n"
    )
    r_path.open("a", encoding="utf-8").write(r_body)

    # Short video script (optional weekly human record)
    if kind == "meme":  # attach script once per cycle when kind is meme
        v_path = _DRAFT_DIR / "short_video_scripts.md"
        script = (
            f"\n## {stamp} — 30–60s talking head / B-roll\n\n"
            "Hook: “This strait moves oil — here’s the free feed and where the token lives.”\n"
            f"- Show map / strait graphic\n- Mention {TG_INTEL} + {SITE_URL}\n"
            "- Close: DYOR, community token, not advice.\n\n---\n"
        )
        v_path.open("a", encoding="utf-8").write(script)


async def prelaunch_daily_loop(
    post_message,
    recent_news_fn: Callable[[], list[str]],
) -> None:
    """
    Once per day at _DAILY_HOUR UTC: rotated Telegram post + optional Bluesky + drafts.
    """
    if not _ENABLED:
        logger.info(
            "Pre-launch daily rotation disabled — set PRELAUNCH_DAILY_ENABLED=1 in .env"
        )
        return

    logger.info(
        "Pre-launch daily rotation enabled — Telegram 1×/day at %02d:00 UTC; drafts=%s; BSky mirror=%s",
        _DAILY_HOUR,
        _WRITE_DRAFTS,
        _MIRROR_BSKY,
    )

    while True:
        now = datetime.now(timezone.utc)
        target = now.replace(hour=_DAILY_HOUR, minute=0, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)
        wait_s = (target - now).total_seconds()
        logger.info("Pre-launch daily post in %.1fh", wait_s / 3600)
        await asyncio.sleep(wait_s)

        kind = _next_kind()
        news_hook = _news_hook(recent_news_fn())
        body = build_telegram_post(kind, news_hook)
        try:
            if await post_message(body):
                logger.info("Pre-launch daily Telegram posted (%s)", kind)
        except Exception as e:
            logger.error("Pre-launch daily Telegram failed: %s", e)

        if _MIRROR_BSKY:
            try:
                from bluesky_poster import post_to_bluesky, BLUESKY_ENABLED

                if BLUESKY_ENABLED:
                    await post_to_bluesky(_bluesky_short(body))
            except Exception as e:
                logger.warning("Pre-launch Bluesky mirror skipped: %s", e)

        try:
            _write_drafts(kind, news_hook)
        except Exception as e:
            logger.warning("Pre-launch draft write failed: %s", e)
