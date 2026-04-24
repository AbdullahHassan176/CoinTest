"""
polls.py — Rotating Telegram polls for community engagement.

Telegram's native poll feature is one of the highest-engagement post types —
they show up prominently in feeds and people instinctively tap them.

Polls fire every POLL_INTERVAL seconds (default 6 hours), separate from
the marketing message loop so they don't crowd out news content.

All polls are anonymous so people answer honestly.
"""

import asyncio
import itertools
import logging
import os
import random

from telegram import Bot
from telegram.error import TelegramError

logger = logging.getLogger(__name__)

POLL_INTERVAL: int = int(os.getenv("POLL_INTERVAL_HOURS", "8")) * 3600


# ── Poll bank ─────────────────────────────────────────────────────────────────
# Format: {"question": str, "options": list[str], "type": "regular"|"quiz",
#          "correct_option_id": int (quiz only)}

POLLS = [
    # Market sentiment
    {
        "question": "Where do you think WTI crude oil will be in 30 days?",
        "options": ["Below $70", "$70–$80", "$80–$90", "$90–$100", "Above $100"],
        "type": "regular",
    },
    {
        "question": "How likely is a significant Strait of Hormuz disruption in the next 6 months?",
        "options": ["Very likely", "Somewhat likely", "Unlikely", "Very unlikely"],
        "type": "regular",
    },
    {
        "question": "What is the biggest near-term risk to global oil supply?",
        "options": [
            "Strait of Hormuz closure",
            "OPEC+ production cuts",
            "US sanctions on Iran",
            "Red Sea shipping disruption",
            "Demand slowdown",
        ],
        "type": "regular",
    },
    {
        "question": "Which region poses the biggest geopolitical risk to oil markets right now?",
        "options": ["Persian Gulf / Iran", "Red Sea / Yemen", "Russia / Ukraine", "Libya", "Venezuela"],
        "type": "regular",
    },
    {
        "question": "How do you primarily follow oil market and geopolitics news?",
        "options": ["Telegram channels", "Twitter/X", "News websites", "Bloomberg/Reuters", "Reddit"],
        "type": "regular",
    },
    # Geopolitics
    {
        "question": "Will Iran and the US reach a new nuclear deal within 12 months?",
        "options": ["Yes", "No", "Partial deal only", "Too early to say"],
        "type": "regular",
    },
    {
        "question": "If the Strait of Hormuz were fully closed for 1 week, where would Brent crude go?",
        "options": ["$100–$120", "$120–$150", "$150–$200", "Above $200"],
        "type": "regular",
    },
    # Knowledge / quiz style (builds credibility for the channel)
    {
        "question": "What percentage of global oil supply passes through the Strait of Hormuz daily?",
        "options": ["About 5%", "About 10%", "About 20%", "About 35%"],
        "type": "quiz",
        "correct_option_id": 2,
        "explanation": "Roughly 20% of global oil supply — around 20 million barrels per day — transits the Strait of Hormuz. It's the world's most critical energy chokepoint.",
    },
    {
        "question": "At its narrowest point, how wide is the Strait of Hormuz?",
        "options": ["6 miles", "21 miles", "50 miles", "100 miles"],
        "type": "quiz",
        "correct_option_id": 1,
        "explanation": "The Strait is only 21 miles wide at its narrowest navigable point — two shipping lanes of 2 miles each, separated by a 2-mile median. Iran controls the northern shore.",
    },
    {
        "question": "Which country controls the northern shore of the Strait of Hormuz?",
        "options": ["Saudi Arabia", "UAE", "Oman", "Iran"],
        "type": "quiz",
        "correct_option_id": 3,
        "explanation": "Iran controls the entire northern shore of the Strait. The southern shore is shared between Oman and the UAE.",
    },
    # $HORMUZ community
    {
        "question": "What drew you to the HORMUZ channel?",
        "options": [
            "Following oil markets",
            "Geopolitics interest",
            "Interested in $HORMUZ token",
            "Crypto / Solana community",
            "Just browsing",
        ],
        "type": "regular",
    },
    {
        "question": "What content would you like to see more of in this channel?",
        "options": [
            "More breaking news",
            "Deeper analysis",
            "Oil price data",
            "Token/DeFi updates",
            "Ship tracking data",
        ],
        "type": "regular",
    },
]


async def send_poll(bot: Bot, chat_id: str, poll: dict) -> bool:
    """Send a single poll to the channel."""
    try:
        kwargs = {
            "chat_id": chat_id,
            "question": poll["question"],
            "options": poll["options"],
            "is_anonymous": True,
        }

        if poll.get("type") == "quiz":
            kwargs["type"] = "quiz"
            kwargs["correct_option_id"] = poll["correct_option_id"]
            if poll.get("explanation"):
                kwargs["explanation"] = poll["explanation"]

        await bot.send_poll(**kwargs)
        logger.info("Poll sent: %s", poll["question"][:60])
        return True

    except TelegramError as e:
        logger.error("Poll send failed: %s", e)
        return False


async def poll_loop(bot: Bot, chat_id: str) -> None:
    """
    Sends a rotating poll every POLL_INTERVAL seconds.
    Shuffles the order so it's not always the same sequence.
    """
    logger.info(
        "Poll loop started — posting every %dh (%d polls in rotation)",
        POLL_INTERVAL // 3600,
        len(POLLS),
    )

    shuffled = POLLS.copy()
    random.shuffle(shuffled)
    cycle = itertools.cycle(shuffled)

    # Stagger first poll so it doesn't fire at startup alongside everything else
    await asyncio.sleep(POLL_INTERVAL)

    while True:
        poll = next(cycle)
        await send_poll(bot, chat_id, poll)
        await asyncio.sleep(POLL_INTERVAL)
