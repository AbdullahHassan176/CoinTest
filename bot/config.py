"""
config.py — Central configuration for the HORMUZ RSS aggregator bot.
Edit SOURCE_CHANNELS and KEYWORDS here to customise behaviour.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Credentials ───────────────────────────────────────────────────────────────

BOT_TOKEN: str = os.environ["BOT_TOKEN"]
TARGET_CHANNEL: str = os.environ["TARGET_CHANNEL"]
POLL_INTERVAL: int = int(os.getenv("POLL_INTERVAL", "300"))       # seconds
MIN_POST_INTERVAL: int = int(os.getenv("MIN_POST_INTERVAL", "30")) # seconds

# ── Source Channels (RSS via RSSHub) ──────────────────────────────────────────
# Format: { "display_name": "telegram_username" }
# RSSHub feed URL pattern: https://rsshub.app/telegram/channel/{username}
#
# If RSSHub is blocked or slow, alternative RSS proxy:
#   https://tg.i-c-a.su/rss/{username}

SOURCE_CHANNELS: dict[str, str] = {
    "The Cradle":                           "TheCradleMedia",
    "Geopolitics Watch":                    "GeopoliticsWatch",
    "Monitor The Situation":                "monitor_the_situation",
    "Iran War Updates":                     "IranWarUpdates",
    "Fotros Resistance":                    "FotrosResistance",
    "Rerum Novarum Intel":                  "RerumNovarum",
    "WarfareAnalysis News":                 "WarfareAnalysis",
    "Middle East Spectator":                "MiddleEastSpectator",
}

# RSS feed URL templates (tried in order until one works)
RSS_TEMPLATES: list[str] = [
    "https://tg.i-c-a.su/rss/{username}",
    "https://rsshub.app/telegram/channel/{username}",
    "https://rss.eyre.io/tg/{username}",
]

# ── Keyword Filter ────────────────────────────────────────────────────────────
# Post must match at least one PRIMARY keyword to be forwarded.

PRIMARY_KEYWORDS: list[str] = [
    # Strait & geography
    "hormuz",
    "strait",
    "persian gulf",
    "gulf of oman",
    "red sea",
    # Oil & energy
    "oil",
    "crude",
    "petroleum",
    "opec",
    "oil price",
    "refinery",
    "pipeline",
    # Shipping
    "tanker",
    "supertanker",
    "shipping lane",
    "vessel",
    "cargo ship",
    # Military / threat actors
    "irgc",
    "naval",
    "houthi",
    "blockade",
    "missile strike",
    "drone attack",
    # Iran (core to every Strait story)
    "iran",
    "iranian",
]

BOOST_KEYWORDS: list[str] = [
    "sanction",
    "energy",
    "chokepoint",
    "ship",
    "cargo",
    "export",
    "barrel",
    "nuclear",
    "drone",
    "missile",
    "navy",
    "military",
    "attack",
    "seized",
    "seized tanker",
    "gulf",
    "war",
    "explosion",
]

MIN_RELEVANCE_SCORE: int = 2

# ── Digest ────────────────────────────────────────────────────────────────────

DIGEST_INTERVAL: int = int(os.getenv("DIGEST_INTERVAL", "14400"))  # 4 hours in seconds

# ── Formatting ────────────────────────────────────────────────────────────────

HASHTAGS: str = "#Hormuz #OilWatch #MiddleEast #HORMUZ"
MAX_MESSAGE_LENGTH: int = 4000

# ── Marketing ─────────────────────────────────────────────────────────────────
# Rotated in order, one every MARKETING_INTERVAL seconds.

MARKETING_INTERVAL: int = 5400  # seconds between promo posts (90 min)

MARKETING_MESSAGES: list[str] = [
    (
        "🌊 *What is $HORMUZ?*\n\n"
        "The coin of the world's most critical oil chokepoint.\n"
        "20% of global oil supply flows through the Strait of Hormuz every day.\n\n"
        "🪙 100B supply · 1% burn · Staking up to 40% APY · DAO governance\n"
        "⚡ Powered by Solana\n\n"
        "#HORMUZ #Solana #OilWatch"
    ),
    (
        "⛽ *Why the Strait of Hormuz matters*\n\n"
        "• 20% of world oil passes through it daily\n"
        "• Any disruption = global energy crisis\n"
        "• IRGC naval activity is monitored 24/7 here\n\n"
        "$HORMUZ is the coin built around this chokepoint.\n"
        "This channel is your live intel feed.\n\n"
        "#Hormuz #CrudeOil #HORMUZ"
    ),
    (
        "🔥 *$HORMUZ Tokenomics*\n\n"
        "✅ 100,000,000,000 total supply — fixed forever\n"
        "✅ Mint authority burned — no new tokens ever\n"
        "✅ 1% burn on every stake transaction\n"
        "✅ Staking: 10% / 20% / 40% APY (30/90/180 days)\n"
        "✅ DAO governance — stakers vote on treasury\n\n"
        "⚡ Built on Solana · Coming to Raydium\n\n"
        "#HORMUZ #DeFi #Solana"
    ),
    (
        "📡 *HORMUZ Intel — How this channel works*\n\n"
        "We monitor 8 Middle East intelligence channels 24/7 "
        "and surface every post mentioning:\n\n"
        "⛽ Oil markets · WTI · Brent crude\n"
        "🚢 Tankers · Shipping lanes · Supertankers\n"
        "🌊 Strait of Hormuz incidents\n"
        "🇮🇷 IRGC naval activity\n"
        "🛢 OPEC · Sanctions · Pipelines\n\n"
        "Powered by [$HORMUZ](https://t.me/StateOfHormuz)\n\n"
        "#OilWatch #MiddleEast #HORMUZ"
    ),
    (
        "🪙 *$HORMUZ — Control the Strait. Hold the Coin.*\n\n"
        "The Strait of Hormuz is the world's most important "
        "energy chokepoint — and $HORMUZ is the token built around it.\n\n"
        "🔔 Follow this channel for live Strait intelligence\n"
        "📈 Staking portal coming soon\n"
        "🏛 DAO governance for token holders\n\n"
        "Built on Solana ⚡\n\n"
        "#HORMUZ #Solana #Crypto"
    ),
]
