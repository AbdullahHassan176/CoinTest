"""
mastodon_poster.py — Posts to Mastodon automatically.

Mastodon is a federated social network with strong geopolitics, infosec,
and tech communities. Completely free API. Strong organic reach for niche content.

Best instances for this project:
  mastodon.social    — largest general instance, 1M+ users
  infosec.exchange   — geopolitics/security community
  fosstodon.org      — tech-focused
  mastodon.online    — large general

Setup:
  1. Create an account on any instance (mastodon.social recommended)
  2. Settings → Development → New Application
     - Name: HORMUZBot
     - Scopes: read + write
  3. Copy the Access Token into .env

Posts are 500 chars on most instances (vs 300 on Bluesky).
"""

import asyncio
import logging
import os
import re

from varied_messages import random_delay, is_good_posting_time

logger = logging.getLogger(__name__)

MASTODON_ACCESS_TOKEN: str = os.getenv("MASTODON_ACCESS_TOKEN", "")
MASTODON_API_BASE: str = os.getenv("MASTODON_API_BASE", "https://mastodon.social")
MASTODON_POST_INTERVAL: int = int(os.getenv("MASTODON_POST_INTERVAL", "5400"))  # 90 min default

MASTODON_ENABLED: bool = bool(MASTODON_ACCESS_TOKEN)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    try:
        from mastodon import Mastodon
        _client = Mastodon(
            access_token=MASTODON_ACCESS_TOKEN,
            api_base_url=MASTODON_API_BASE,
        )
        logger.info("Mastodon client initialised at %s", MASTODON_API_BASE)
        return _client
    except ImportError:
        logger.warning("Mastodon.py not installed — run: pip install Mastodon.py")
    except Exception as e:
        logger.error("Mastodon init failed: %s", e)
    return None


async def post_to_mastodon(text: str, visibility: str = "public") -> bool:
    """Post a toot. Returns True on success. visibility: public/unlisted/private."""
    if not MASTODON_ENABLED:
        return False

    client = _get_client()
    if not client:
        return False

    if len(text) > 500:
        text = text[:497] + "..."

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: client.status_post(text, visibility=visibility),
        )
        logger.info("Mastodon post sent (%d chars)", len(text))
        return True
    except Exception as e:
        logger.error("Mastodon post failed: %s", e)
        global _client
        _client = None
        return False


async def post_news_to_mastodon(text: str, source_name: str, url: str = "") -> bool:
    """Post a news item to Mastodon with attribution and relevant hashtags."""
    if not MASTODON_ENABLED:
        return False

    # Mastodon has 500 chars — more room than Bluesky
    suffix = (
        f"\n\nvia {source_name}"
        f"{' — ' + url if url else ''}"
        f"\n\nt.me/StateOfHormuz\n\n#HORMUZ #OilWatch #MiddleEast #StraitOfHormuz"
    )
    max_text = 500 - len(suffix)
    snippet = text[:max_text].rstrip()
    if len(text) > max_text:
        snippet = snippet[:-3].rstrip() + "..."

    return await post_to_mastodon(snippet + suffix)


# Static Mastodon-optimised posts (longer format, hashtag at end for discovery)
_MASTODON_PROMOS = [
    (
        "The Strait of Hormuz is 21 miles wide at its narrowest point. "
        "20% of global oil passes through it every day.\n\n"
        "I built a free Telegram channel that monitors it continuously — "
        "pulling from 8 live Middle East intelligence sources and forwarding "
        "anything related to tanker movements, IRGC naval activity, oil market "
        "developments, and Strait incidents as they happen.\n\n"
        "Every 4 hours it posts an AI-generated briefing with live AIS ship "
        "tracking data from the Strait bounding box.\n\n"
        "t.me/StateOfHormuz — free, no account needed to read.\n\n"
        "#OilMarkets #MiddleEast #Geopolitics #StraitOfHormuz #HORMUZ"
    ),
    (
        "Quick one for people who follow oil markets or Middle East geopolitics:\n\n"
        "t.me/StateOfHormuz monitors the Strait of Hormuz 24/7 using 8 live "
        "intelligence sources. It filters for Strait activity, tanker incidents, "
        "IRGC movements, crude price news, and OPEC developments.\n\n"
        "When something happens in the Gulf, it's usually there before "
        "mainstream news picks it up.\n\n"
        "Free channel, no sign-up required.\n\n"
        "#OilWatch #PersianGulf #Iran #EnergySecurity #Geopolitics"
    ),
    (
        "Iran has seized tankers in the Strait of Hormuz before. "
        "Mined it. Threatened to close it. "
        "The US Fifth Fleet sits on the other side.\n\n"
        "This is the world's most fragile energy chokepoint — "
        "and most people only find out something happened there hours after it matters.\n\n"
        "t.me/StateOfHormuz is a free Telegram channel that watches it in real time.\n\n"
        "There's also a Solana token behind the project — $HORMUZ — "
        "deflationary, stakeable, DAO-governed. Still pre-launch.\n\n"
        "#Hormuz #CrudeOil #Solana #Geopolitics #MiddleEast"
    ),
    (
        "Breakdown of what the @StateOfHormuz channel actually does:\n\n"
        "— Monitors 8 live Telegram intelligence channels (The Cradle, "
        "Geopolitics Watch, Iran War Updates, and others)\n"
        "— Filters posts for Strait of Hormuz, tanker, IRGC, oil, "
        "and shipping keyword relevance\n"
        "— Forwards matching content with attribution in real time\n"
        "— Every 4 hours: AI briefing using Ollama (runs locally, no API costs) "
        "summarising the past 24h\n"
        "— AIS vessel tracking in the Strait bounding box included in each digest\n\n"
        "All free. t.me/StateOfHormuz\n\n"
        "#OpenSource #MiddleEast #OilWatch #HORMUZ #Telegram"
    ),
]


async def scheduled_mastodon_loop() -> None:
    """Posts to Mastodon every MASTODON_POST_INTERVAL seconds during human hours."""
    if not MASTODON_ENABLED:
        logger.info("Mastodon disabled — add MASTODON_ACCESS_TOKEN to .env")
        return

    logger.info(
        "Mastodon scheduler started — posting every ~%dm on %s",
        MASTODON_POST_INTERVAL // 60,
        MASTODON_API_BASE,
    )

    import itertools
    post_cycle = itertools.cycle(_MASTODON_PROMOS)
    post_count = 0

    while True:
        sleep_time = random_delay(
            int(MASTODON_POST_INTERVAL * 0.85),
            int(MASTODON_POST_INTERVAL * 1.15),
        )
        await asyncio.sleep(sleep_time)

        if not is_good_posting_time():
            continue

        text = next(post_cycle)
        success = await post_to_mastodon(text)
        if success:
            post_count += 1
            logger.info("Mastodon scheduled post #%d", post_count)
