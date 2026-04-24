"""
discord_webhook.py — Posts to Discord channels via webhooks.

No bot token needed. Server admins create a webhook URL and give it to you.
Each webhook posts to one specific channel in one specific server.

How to get webhook URLs:
  1. Join the target Discord server
  2. Ask the server admin to create a webhook in a relevant channel
     (or if you're admin: Channel Settings → Integrations → Webhooks → New Webhook)
  3. Copy the webhook URL — it looks like:
     https://discord.com/api/webhooks/1234567890/XXXXXXXXXXXX
  4. Add it to .env as DISCORD_WEBHOOKS (comma-separated for multiple)

Target servers to request webhooks from:
  - Solana official Discord (discord.gg/solana)
  - MonkeDAO / Solana NFT communities
  - Solana Traders
  - Oil & Gas industry Discords
  - Geopolitics-focused Discords

Discord message limit: 2000 characters.
Embeds look much more professional — use format_embed() for news items.
"""

import asyncio
import logging
import os
import time
from typing import Optional

import aiohttp

from varied_messages import random_delay, is_good_posting_time

logger = logging.getLogger(__name__)

# Comma-separated list of webhook URLs
_WEBHOOK_ENV = os.getenv("DISCORD_WEBHOOKS", "")
DISCORD_WEBHOOKS: list[str] = [
    w.strip() for w in _WEBHOOK_ENV.split(",") if w.strip()
]

DISCORD_POST_INTERVAL: int = int(os.getenv("DISCORD_POST_INTERVAL", "7200"))  # 2h
DISCORD_ENABLED: bool = bool(DISCORD_WEBHOOKS)

HORMUZ_BLUE = 0x1a3a5c  # Dark navy — matches the HORMUZ brand


async def _send_webhook(webhook_url: str, payload: dict) -> bool:
    """POST a payload to a single webhook URL."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                webhook_url,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status in (200, 204):
                    return True
                body = await resp.text()
                logger.warning("Discord webhook %d: %s", resp.status, body[:100])
    except Exception as e:
        logger.error("Discord webhook error: %s", e)
    return False


async def post_to_discord(content: str) -> bool:
    """Send a plain text message to all configured webhooks."""
    if not DISCORD_ENABLED:
        return False

    if len(content) > 2000:
        content = content[:1997] + "..."

    results = await asyncio.gather(
        *[_send_webhook(url, {"content": content}) for url in DISCORD_WEBHOOKS],
        return_exceptions=True,
    )
    successes = sum(1 for r in results if r is True)
    logger.info("Discord: sent to %d/%d webhooks", successes, len(DISCORD_WEBHOOKS))
    return successes > 0


async def post_news_embed(
    text: str,
    source_name: str,
    url: str = "",
    keywords: Optional[list[str]] = None,
) -> bool:
    """
    Post a news item as a Discord embed — looks professional, not like a bot paste.
    """
    if not DISCORD_ENABLED:
        return False

    snippet = text[:350].rstrip()
    if len(text) > 350:
        snippet += "..."

    embed = {
        "title": f"Strait of Hormuz — Live Intel",
        "description": snippet,
        "color": HORMUZ_BLUE,
        "footer": {
            "text": f"via {source_name} | t.me/StateOfHormuz | $HORMUZ on Solana"
        },
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    if url:
        embed["url"] = url

    if keywords:
        embed["fields"] = [{
            "name": "Keywords",
            "value": " · ".join(keywords[:6]),
            "inline": True,
        }]

    payload = {
        "username": "HORMUZ Intel",
        "avatar_url": "https://t.me/i/userpic/320/StateOfHormuz.jpg",
        "embeds": [embed],
    }

    results = await asyncio.gather(
        *[_send_webhook(url_hook, payload) for url_hook in DISCORD_WEBHOOKS],
        return_exceptions=True,
    )
    successes = sum(1 for r in results if r is True)
    return successes > 0


_DISCORD_PROMOS = [
    {
        "content": None,
        "embeds": [{
            "title": "HORMUZ Intel — Free Telegram Channel",
            "description": (
                "Monitors the Strait of Hormuz 24/7 from 8 live Middle East intelligence sources.\n\n"
                "Posts real-time alerts on tanker movements, IRGC activity, oil market news, "
                "and Strait incidents. Drops a 4-hour AI briefing with live AIS ship tracking data.\n\n"
                "**Free. No account needed.** t.me/StateOfHormuz"
            ),
            "color": HORMUZ_BLUE,
            "fields": [
                {"name": "Token", "value": "$HORMUZ on Solana", "inline": True},
                {"name": "Supply", "value": "100B fixed, mint burned", "inline": True},
                {"name": "Staking", "value": "Up to 40% APY", "inline": True},
            ],
            "footer": {"text": "Pre-launch | t.me/StateOfHormuz"},
        }],
        "username": "HORMUZ Intel",
    },
    {
        "content": (
            "The Strait of Hormuz carries 20% of global oil through a 21-mile passage every day.\n\n"
            "**t.me/StateOfHormuz** — free live intel channel monitoring the Strait 24/7. "
            "8 sources, real-time alerts, 4-hour AI briefings, AIS ship tracking.\n\n"
            "$HORMUZ on Solana — pre-launch. #HORMUZ #OilWatch"
        ),
        "username": "HORMUZ Intel",
    },
]


async def scheduled_discord_loop() -> None:
    """Posts to all Discord webhooks every DISCORD_POST_INTERVAL seconds."""
    if not DISCORD_ENABLED:
        logger.info(
            "Discord webhooks disabled — add DISCORD_WEBHOOKS to .env "
            "(comma-separated webhook URLs)"
        )
        return

    logger.info(
        "Discord scheduler started — posting to %d webhook(s) every ~%dh",
        len(DISCORD_WEBHOOKS),
        DISCORD_POST_INTERVAL // 3600,
    )

    import itertools
    cycle = itertools.cycle(_DISCORD_PROMOS)
    count = 0

    while True:
        sleep_time = random_delay(
            int(DISCORD_POST_INTERVAL * 0.9),
            int(DISCORD_POST_INTERVAL * 1.1),
        )
        await asyncio.sleep(sleep_time)

        if not is_good_posting_time():
            continue

        payload = next(cycle)
        results = await asyncio.gather(
            *[_send_webhook(url, payload) for url in DISCORD_WEBHOOKS],
            return_exceptions=True,
        )
        successes = sum(1 for r in results if r is True)
        if successes:
            count += 1
            logger.info("Discord scheduled post #%d → %d webhooks", count, successes)
