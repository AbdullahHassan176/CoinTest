"""
main.py — HORMUZ RSS Aggregator Bot.

Loops running concurrently:
  - RSS poller          every 60s    — forwards relevant intel to Telegram
  - Marketing loop      every 5 min  — rotating promo posts (LLM or static)
  - Intelligence digest every 4h     — Ollama briefing + AIS ship tracking
  - Oil price post      daily 07:00  — WTI / Brent / NatGas morning update
  - Poll loop           every 8h     — rotating Telegram polls for engagement
  - Weekly roundup      Sundays      — 7-day summary via Ollama
  - Bluesky scheduler   every 1h     — promo posts + news mirrors
  - Mastodon scheduler  every 90min  — promo posts + news mirrors
  - Discord scheduler   every 2h     — embed posts to webhook servers
  - Twitter scheduler   hourly       — disabled unless credits added to X account
  - On-chain watcher    every 60s    — stake/proposal/burn alerts to Telegram
  - Market watcher      every 90s    — prediction market create/resolve/cancel alerts
  - Command handler     always       — /stats /airdrop /strait /price /leaderboard /markets /monitor
  - Pre-launch daily    optional     — rotated TG + drafts (PRELAUNCH_DAILY_ENABLED)
"""

import asyncio
import collections
import logging
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from telegram import Bot
from telegram.constants import ParseMode
from telegram.error import TelegramError, RetryAfter

from config import BOT_TOKEN, TARGET_CHANNEL, MIN_POST_INTERVAL, MARKETING_INTERVAL, DIGEST_INTERVAL
from legal_copy import merge_channel_message
from filter import is_relevant, matched_keywords, relevance_score
from formatter import format_post
from llm_promo import generate_promo, OPENAI_API_KEY
from news_digest import generate_digest
from oil_prices import daily_price_loop, fetch_prices, format_price_post
from polls import poll_loop
from rss_poller import RSSPoller, FeedEntry
from bluesky_poster import post_news_to_bluesky, scheduled_bluesky_loop, BLUESKY_ENABLED, BLUESKY_HANDLE
from discord_webhook import post_news_embed, scheduled_discord_loop, DISCORD_ENABLED, DISCORD_WEBHOOKS
from mastodon_poster import post_news_to_mastodon, scheduled_mastodon_loop, MASTODON_ENABLED, MASTODON_API_BASE
from twitter_poster import tweet_news_item, scheduled_tweet_loop, TWITTER_ENABLED
from ollama_client import chat as ollama_chat, is_running as ollama_running
from commands import register_commands, set_recent_news
from onchain_watcher import onchain_watcher_loop
from market_watcher import market_watcher_loop
from prelaunch_social import prelaunch_daily_loop

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(open(sys.stdout.fileno(), mode='w', encoding='utf-8', closefd=False)),
        logging.FileHandler("hormuz_bot.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger(__name__)

# ── Bot & shared state ────────────────────────────────────────────────────────

# ── PID lock — prevents multiple instances ────────────────────────────────────

_PID_FILE = Path(__file__).parent / "bot.pid"


def _acquire_lock() -> None:
    """Exit immediately if another instance is already running."""
    if _PID_FILE.exists():
        try:
            existing_pid = int(_PID_FILE.read_text().strip())
            # Check if that PID is still alive
            import psutil
            if psutil.pid_exists(existing_pid):
                proc = psutil.Process(existing_pid)
                if any("main.py" in " ".join(p) for p in [proc.cmdline()]):
                    print(f"ERROR: Bot already running as PID {existing_pid}. Exiting.")
                    sys.exit(1)
        except Exception:
            pass  # Stale lock file — overwrite below
    _PID_FILE.write_text(str(os.getpid()))


def _release_lock() -> None:
    try:
        _PID_FILE.unlink(missing_ok=True)
    except Exception:
        pass


# ── Bot & shared state ────────────────────────────────────────────────────────

bot = Bot(token=BOT_TOKEN)
_last_post_time: float = 0.0

# Rolling buffer of recent news — used by marketing loop and weekly roundup
_recent_news: collections.deque[str] = collections.deque(maxlen=50)

# Full 7-day news history for weekly roundup
_weekly_news: collections.deque[str] = collections.deque(maxlen=200)

BREAKING_THRESHOLD = 8  # Relevance score above this triggers a breaking alert


async def post_message(text: str, parse_mode: str | None = None) -> bool:
    """Post a message to the HORMUZ channel with rate limiting.

    Appends the three permanent legal texts (Phase 0.4) to every channel post.

    Args:
        text:        The text to send.
        parse_mode:  ParseMode.HTML for formatted posts, None for plain text.
    """
    global _last_post_time
    elapsed = time.monotonic() - _last_post_time
    if elapsed < MIN_POST_INTERVAL:
        await asyncio.sleep(MIN_POST_INTERVAL - elapsed)

    is_html = parse_mode == ParseMode.HTML
    text = merge_channel_message(text, html=is_html, max_len=4096)

    try:
        await bot.send_message(
            chat_id=TARGET_CHANNEL,
            text=text,
            parse_mode=parse_mode,
            disable_web_page_preview=False,
        )
        _last_post_time = time.monotonic()
        return True
    except RetryAfter as e:
        logger.warning("Telegram rate limit — sleeping %ss", e.retry_after)
        await asyncio.sleep(e.retry_after)
        return await post_message(text)
    except TelegramError as e:
        logger.error("Failed to post: %s", e)
        return False


# ── Entry handler ─────────────────────────────────────────────────────────────

async def handle_entry(entry: FeedEntry) -> None:
    """Called for each new RSS entry — filter, format, and distribute."""
    if not is_relevant(entry.text):
        return

    keywords = matched_keywords(entry.text)
    score = relevance_score(entry.text)
    logger.info(
        "MATCH from %s | score: %d | keywords: %s | %.80s",
        entry.source_name, score, keywords,
        entry.text.replace("\n", " "),
    )

    # Breaking alert for very high relevance items
    if score >= BREAKING_THRESHOLD:
        alert = (
            f"🚨 BREAKING — Strait of Hormuz\n\n"
            f"{entry.text[:600]}\n\n"
            f"via {entry.source_name}\n"
            f"@StateOfHormuz | $HORMUZ"
        )
        await post_message(alert)  # plain text — no parse mode needed
        logger.info("Breaking alert posted (score: %d)", score)
    else:
        formatted = format_post(
            text=entry.text,
            source_name=entry.source_name,
            source_username=entry.source_username,
            url=entry.url,
        )
        await post_message(formatted, parse_mode=ParseMode.HTML)

    logger.info("Posted to %s", TARGET_CHANNEL)
    _recent_news.append(entry.text)
    _weekly_news.append(entry.text)
    set_recent_news(list(_recent_news))  # sync to commands module

    # Mirror to all social platforms concurrently
    await asyncio.gather(
        tweet_news_item(text=entry.text, source_name=entry.source_name, url=entry.url),
        post_news_to_bluesky(text=entry.text, source_name=entry.source_name),
        post_news_to_mastodon(text=entry.text, source_name=entry.source_name, url=entry.url),
        post_news_embed(text=entry.text, source_name=entry.source_name, url=entry.url, keywords=keywords),
    )


# ── Intelligence digest loop ──────────────────────────────────────────────────

async def digest_loop() -> None:
    """Posts a US/Iran + ship traffic briefing every DIGEST_INTERVAL seconds."""
    logger.info("Digest loop started — every %dh", DIGEST_INTERVAL // 3600)
    await asyncio.sleep(DIGEST_INTERVAL)
    count = 0
    while True:
        try:
            msg = await generate_digest(recent_news=list(_recent_news))
            if await post_message(msg):
                count += 1
                logger.info("Digest #%d posted", count)
        except Exception as e:
            logger.error("Digest loop error: %s", e)
        await asyncio.sleep(DIGEST_INTERVAL)


# ── Marketing loop ────────────────────────────────────────────────────────────

async def marketing_loop() -> None:
    """Posts a rotating promo every MARKETING_INTERVAL seconds."""
    status = "LLM (gpt-4o-mini)" if OPENAI_API_KEY else "static (add OPENAI_API_KEY to enable LLM)"
    logger.info("Marketing loop started — every %ds | %s", MARKETING_INTERVAL, status)
    count = 0
    while True:
        await asyncio.sleep(MARKETING_INTERVAL)
        msg = await generate_promo(recent_news=list(_recent_news), mode="telegram")
        if await post_message(msg):
            count += 1
            logger.info("Promo #%d posted", count)


# ── Weekly roundup ────────────────────────────────────────────────────────────

_WEEKLY_SYSTEM = """You write a weekly intelligence roundup for a Telegram channel monitoring the Strait of Hormuz.

Tone: direct, like a well-read analyst summing up the week. No bullet points. No headers. Plain prose.
Length: 350–500 words.
No emojis, no exclamation marks, no AI buzzwords.
End with: what to watch next week."""

async def weekly_roundup_loop() -> None:
    """Posts a Sunday morning weekly roundup at 09:00 UTC."""
    logger.info("Weekly roundup loop started — posts Sundays at 09:00 UTC")

    while True:
        now = datetime.now(timezone.utc)
        # Next Sunday at 09:00
        days_until_sunday = (6 - now.weekday()) % 7
        if days_until_sunday == 0 and now.hour >= 9:
            days_until_sunday = 7
        next_sunday = (now + timedelta(days=days_until_sunday)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )
        wait_s = (next_sunday - now).total_seconds()
        logger.info("Weekly roundup in %.0fh", wait_s / 3600)
        await asyncio.sleep(wait_s)

        try:
            now_str = datetime.now(timezone.utc).strftime("%d %b %Y")
            news_block = "\n".join(f"- {t[:200]}" for t in list(_weekly_news)[-40:])

            briefing = None
            if await ollama_running() and news_block:
                briefing = await ollama_chat(
                    system=_WEEKLY_SYSTEM,
                    user=f"Here are the news items from the past 7 days:\n\n{news_block}\n\nWrite the weekly roundup.",
                    max_tokens=600,
                    temperature=0.5,
                )

            if briefing:
                msg = f"HORMUZ WEEKLY — Week ending {now_str}\n\n{briefing}\n\n@StateOfHormuz | $HORMUZ on Solana"
            else:
                # Plain summary fallback
                items = list(_weekly_news)[-10:]
                msg = (
                    f"HORMUZ WEEKLY — Week ending {now_str}\n\n"
                    f"Top developments this week:\n\n" +
                    "\n\n".join(f"— {t[:150]}" for t in items) +
                    "\n\n@StateOfHormuz | $HORMUZ on Solana"
                )

            if await post_message(msg):
                logger.info("Weekly roundup posted")
            _weekly_news.clear()

        except Exception as e:
            logger.error("Weekly roundup error: %s", e)


# ── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    logger.info("===========================================")
    logger.info("  HORMUZ RSS Aggregator Bot - Starting Up  ")
    logger.info("===========================================")

    try:
        me = await bot.get_me()
        logger.info("Bot authenticated: @%s", me.username)
    except Exception as e:
        logger.critical("Bot token invalid: %s", e)
        sys.exit(1)

    try:
        chat = await bot.get_chat(TARGET_CHANNEL)
        logger.info("Target channel: %s", chat.title or TARGET_CHANNEL)
    except Exception as e:
        logger.critical(
            "Cannot access channel '%s': %s — make sure @StateOfHormuzBot is admin.",
            TARGET_CHANNEL, e,
        )
        sys.exit(1)

    logger.info(
        "Bluesky: %s | Mastodon: %s | Discord: %s webhooks | Twitter: %s",
        BLUESKY_HANDLE if BLUESKY_ENABLED else "off",
        MASTODON_API_BASE if MASTODON_ENABLED else "off",
        len(DISCORD_WEBHOOKS) if DISCORD_ENABLED else "0",
        "on" if TWITTER_ENABLED else "off",
    )

    # Build the Application for command handling (runs alongside the bot)
    from telegram.ext import Application
    app = Application.builder().token(BOT_TOKEN).build()
    register_commands(app)

    poller = RSSPoller()
    await asyncio.gather(
        poller.run(on_entry=handle_entry),
        marketing_loop(),
        digest_loop(),
        daily_price_loop(post_message),
        poll_loop(bot, TARGET_CHANNEL),
        weekly_roundup_loop(),
        prelaunch_daily_loop(post_message, lambda: list(_recent_news)),
        scheduled_tweet_loop(),
        scheduled_bluesky_loop(),
        scheduled_mastodon_loop(),
        scheduled_discord_loop(),
        onchain_watcher_loop(post_message),
        market_watcher_loop(post_message),
        app.run_polling(close_loop=False),
    )


if __name__ == "__main__":
    _acquire_lock()
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Bot stopped.")
    finally:
        _release_lock()
