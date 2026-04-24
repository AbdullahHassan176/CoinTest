"""
twitter_poster.py — Posts to Twitter/X automatically.

Two modes:
  1. Scheduled promo tweets  — rotate marketing messages every TWEET_INTERVAL seconds
  2. News mirror tweets       — when the Telegram bot forwards a relevant post,
                                also tweet a summary with a link back to the channel

Requires a Twitter developer account (free tier works).
Get credentials at: https://developer.twitter.com/en/portal/dashboard
"""

import asyncio
import logging
import os
import time

from varied_messages import make_tweet, random_delay, is_good_posting_time

logger = logging.getLogger(__name__)

# ── Credentials (loaded from .env) ───────────────────────────────────────────

TWITTER_ENABLED: bool = all([
    os.getenv("TWITTER_API_KEY"),
    os.getenv("TWITTER_API_SECRET"),
    os.getenv("TWITTER_ACCESS_TOKEN"),
    os.getenv("TWITTER_ACCESS_SECRET"),
])

TWEET_INTERVAL: int = int(os.getenv("TWEET_INTERVAL", "3600"))   # 1 hour default
TWEET_NEWS_ENABLED: bool = os.getenv("TWEET_NEWS", "true").lower() == "true"

_client = None


def _get_client():
    """Lazy-load the Tweepy client."""
    global _client
    if _client is not None:
        return _client
    try:
        import tweepy
        _client = tweepy.Client(
            consumer_key=os.getenv("TWITTER_API_KEY"),
            consumer_secret=os.getenv("TWITTER_API_SECRET"),
            access_token=os.getenv("TWITTER_ACCESS_TOKEN"),
            access_token_secret=os.getenv("TWITTER_ACCESS_SECRET"),
        )
        logger.info("Twitter client initialised")
        return _client
    except ImportError:
        logger.warning("tweepy not installed — run: pip install tweepy")
        return None
    except Exception as e:
        logger.error("Twitter client init failed: %s", e)
        return None


async def post_tweet(text: str) -> bool:
    """Post a single tweet. Returns True on success."""
    if not TWITTER_ENABLED:
        return False

    client = _get_client()
    if not client:
        return False

    try:
        # Run blocking tweepy call in a thread so we don't block the event loop
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: client.create_tweet(text=text)
        )
        tweet_id = response.data["id"]
        logger.info("Tweet posted: https://twitter.com/i/web/status/%s", tweet_id)
        return True
    except Exception as e:
        logger.error("Tweet failed: %s", e)
        return False


async def tweet_news_item(text: str, source_name: str, url: str) -> bool:
    """
    Tweet a summary of a forwarded news item.
    Keeps it short and links back to the Telegram channel.
    """
    if not TWITTER_ENABLED or not TWEET_NEWS_ENABLED:
        return False

    # Truncate the original text to leave room for attribution
    max_text = 200
    snippet = text[:max_text].rstrip()
    if len(text) > max_text:
        snippet += "…"

    tweet = (
        f"🌊 {snippet}\n\n"
        f"📡 via {source_name}\n"
        f"Full feed: t.me/StateOfHormuz\n\n"
        f"#HORMUZ #OilWatch #MiddleEast"
    )

    if len(tweet) > 280:
        # Trim snippet further if needed
        overflow = len(tweet) - 280
        snippet = snippet[:max_text - overflow - 3].rstrip() + "…"
        tweet = (
            f"🌊 {snippet}\n\n"
            f"📡 via {source_name}\n"
            f"Full feed: t.me/StateOfHormuz\n\n"
            f"#HORMUZ #OilWatch #MiddleEast"
        )

    return await post_tweet(tweet)


async def scheduled_tweet_loop() -> None:
    """
    Posts a rotating marketing tweet every TWEET_INTERVAL seconds.
    Respects human posting hours (8am–11pm UTC) and adds random delays
    so tweets never arrive at the exact same time each day.
    """
    if not TWITTER_ENABLED:
        logger.info("Twitter disabled — set TWITTER_API_KEY etc. in .env to enable")
        return

    logger.info(
        "Twitter scheduler started — tweeting every ~%ds during 08:00–23:00 UTC",
        TWEET_INTERVAL,
    )

    tweet_count = 0

    while True:
        # Add up to ±10% random offset so posts don't land at clock-exact intervals
        sleep_time = random_delay(
            int(TWEET_INTERVAL * 0.9),
            int(TWEET_INTERVAL * 1.1),
        )
        await asyncio.sleep(sleep_time)

        if not is_good_posting_time():
            logger.debug("Outside posting hours — skipping tweet")
            continue

        # Alternate between coin-focused and channel-focused tweets
        include_coin = (tweet_count % 3 != 0)  # 2 in 3 tweets mention the coin
        text = make_tweet(include_coin=include_coin)

        success = await post_tweet(text)
        if success:
            tweet_count += 1
            logger.info("Scheduled tweet #%d sent", tweet_count)
