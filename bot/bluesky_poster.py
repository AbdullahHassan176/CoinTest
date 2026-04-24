"""
bluesky_poster.py — Posts to Bluesky (bsky.app) for free.

Bluesky uses the AT Protocol — completely free API, no credits, no payment.
Create an account at bsky.app, then generate an App Password (not your main password):
  bsky.app → Settings → Privacy and Security → App Passwords → Add App Password

Two behaviours:
  1. Scheduled promo posts  — every BLUESKY_POST_INTERVAL seconds
  2. News mirror posts      — when a relevant item is forwarded to Telegram,
                              also post a short summary to Bluesky

Bluesky post limit: 300 characters.
"""

import asyncio
import logging
import os

from varied_messages import make_tweet, random_delay, is_good_posting_time

logger = logging.getLogger(__name__)

BLUESKY_HANDLE: str = os.getenv("BLUESKY_HANDLE", "")
BLUESKY_APP_PASSWORD: str = os.getenv("BLUESKY_APP_PASSWORD", "")
BLUESKY_POST_INTERVAL: int = int(os.getenv("BLUESKY_POST_INTERVAL", "3600"))

BLUESKY_ENABLED: bool = bool(BLUESKY_HANDLE and BLUESKY_APP_PASSWORD)

# Persist the session token here so we login at most once per process restart,
# well within Bluesky's 10-logins-per-day rate limit.
_SESSION_FILE = os.path.join(os.path.dirname(__file__), ".bluesky_session")

_client = None


async def _get_client():
    """
    Return an authenticated atproto AsyncClient.
    Tries to resume a saved session first; only does a full login when the
    session file is missing or expired.  This keeps us well under Bluesky's
    10-login-per-day rate limit.
    """
    global _client
    if _client is not None:
        return _client
    try:
        from atproto import AsyncClient
        c = AsyncClient()

        # ── Try resuming a saved session ────────────────────────────────────
        if os.path.exists(_SESSION_FILE):
            try:
                with open(_SESSION_FILE) as f:
                    saved = f.read().strip()
                await c.resume_session(saved)
                _client = c
                logger.info("Bluesky session resumed (no new login needed)")
                return _client
            except Exception:
                logger.info("Bluesky saved session expired — doing fresh login")
                os.remove(_SESSION_FILE)
                c = AsyncClient()

        # ── Full login ───────────────────────────────────────────────────────
        handle = BLUESKY_HANDLE.lstrip("@")
        await c.login(handle, BLUESKY_APP_PASSWORD)
        # Persist session so future restarts skip the login
        with open(_SESSION_FILE, "w") as f:
            f.write(c.export_session_string())
        _client = c
        logger.info("Bluesky logged in as %s (session saved)", BLUESKY_HANDLE)
        return _client
    except ImportError:
        logger.warning("atproto not installed — run: pip install atproto")
    except Exception as e:
        logger.error("Bluesky login failed: %s", e)
    return None


async def post_to_bluesky(text: str) -> bool:
    """Post text to Bluesky. Returns True on success."""
    if not BLUESKY_ENABLED:
        return False

    client = await _get_client()
    if not client:
        return False

    # Bluesky hard limit is 300 grapheme chars
    if len(text) > 300:
        text = text[:297] + "..."

    try:
        await client.send_post(text=text)
        logger.info("Bluesky post sent (%d chars)", len(text))
        return True
    except Exception as e:
        logger.error("Bluesky post failed: %s", e)
        err = str(e).lower()
        # Only drop the session on auth errors — network blips don't need a re-login
        if any(k in err for k in ("unauthorized", "expired", "invalid", "authentication")):
            global _client
            _client = None
            if os.path.exists(_SESSION_FILE):
                os.remove(_SESSION_FILE)
                logger.info("Bluesky session cleared — will re-login next attempt")
        return False


async def post_news_to_bluesky(text: str, source_name: str) -> bool:
    """
    Post a short news summary to Bluesky when a relevant item is forwarded.
    Stays under 300 chars with channel attribution.
    """
    if not BLUESKY_ENABLED:
        return False

    suffix = f"\n\nvia {source_name} | t.me/StateOfHormuz\n#HORMUZ #OilWatch"
    max_text = 300 - len(suffix)
    snippet = text[:max_text].rstrip()
    if len(text) > max_text:
        snippet = snippet[:max_text - 3].rstrip() + "..."

    return await post_to_bluesky(snippet + suffix)


async def scheduled_bluesky_loop() -> None:
    """
    Posts a rotating promo to Bluesky every BLUESKY_POST_INTERVAL seconds.
    Only posts during human hours (8am–11pm UTC) with random jitter.
    """
    if not BLUESKY_ENABLED:
        logger.info(
            "Bluesky disabled — add BLUESKY_HANDLE + BLUESKY_APP_PASSWORD to .env"
        )
        return

    logger.info(
        "Bluesky scheduler started — posting every ~%ds as %s",
        BLUESKY_POST_INTERVAL, BLUESKY_HANDLE,
    )

    post_count = 0

    while True:
        sleep_time = random_delay(
            int(BLUESKY_POST_INTERVAL * 0.9),
            int(BLUESKY_POST_INTERVAL * 1.1),
        )
        await asyncio.sleep(sleep_time)

        if not is_good_posting_time():
            logger.debug("Outside posting hours — skipping Bluesky post")
            continue

        # Reuse tweet-length copy (fits in 300 chars)
        text = make_tweet(include_coin=(post_count % 3 != 0))
        success = await post_to_bluesky(text)
        if success:
            post_count += 1
            logger.info("Bluesky scheduled post #%d sent", post_count)
