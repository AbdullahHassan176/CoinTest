"""
varied_messages.py — Static fallback promo messages used when the LLM is unavailable.

Rules these follow (so they don't read as AI-generated):
  - One sentence per idea. No compound sentences joined with em-dashes.
  - One emoji max, only where it feels natural.
  - No buzzwords: no "leverage", "crucial", "vital", "revolutionary", "powered by".
  - No fake urgency. No exclamation marks.
  - Channel mention at the end, not a "call to action" headline.
"""

import random
from datetime import datetime


STATIC_PROMOS = [
    # --- Geography & scale ---
    (
        "The Strait of Hormuz is 21 miles wide at its narrowest point.\n\n"
        "That gap handles roughly 20% of all the oil traded globally, every single day.\n\n"
        "There is no pipeline alternative that comes close to replacing it.\n\n"
        "@StateOfHormuz monitors it live — 8 sources, filtered for signal.\n\n"
        "$HORMUZ — Solana, 100B fixed supply, 1% burn on stake, up to 40% APY."
    ),
    # --- Historical: 1988 tanker war ---
    (
        "In 1988, the US Navy and Iran fought a one-day naval battle in the Persian Gulf — Operation Praying Mantis.\n\n"
        "Iran lost half its surface fleet. It was the largest US naval engagement since WWII.\n\n"
        "The Strait of Hormuz has been a flashpoint for decades. It hasn't stopped being one.\n\n"
        "@StateOfHormuz | $HORMUZ on Solana."
    ),
    # --- Historical: tanker seizures ---
    (
        "In 2019, Iran seized a British-flagged tanker in the Strait of Hormuz.\n\n"
        "Brent crude jumped 2% the same afternoon.\n\n"
        "These things move fast. @StateOfHormuz watches 8 live sources so you get it as it breaks.\n\n"
        "$HORMUZ — Solana token built around this chokepoint."
    ),
    # --- IRGC / naval angle ---
    (
        "The IRGC Navy operates patrol boats, mini-submarines, and anti-ship missile batteries along the Iranian coast of the Strait.\n\n"
        "They've practiced closing it in military exercises more than once.\n\n"
        "Whether they could actually do it is debated. That they'd try isn't.\n\n"
        "@StateOfHormuz tracks this. $HORMUZ on Solana."
    ),
    # --- Oil market angle ---
    (
        "WTI and Brent both react to Strait of Hormuz news faster than almost any other geopolitical event.\n\n"
        "Traders know: if something happens there, it's in the price before it's on Bloomberg.\n\n"
        "@StateOfHormuz pulls from 8 Middle East intel sources and posts matches automatically.\n\n"
        "$HORMUZ — Solana, deflationary, DAO-governed."
    ),
    # --- OPEC angle ---
    (
        "Most of OPEC's output — Saudi Arabia, Iraq, UAE, Kuwait — exits through the Strait of Hormuz.\n\n"
        "When OPEC cuts production, everyone talks about it. When the Strait is threatened, crude moves more.\n\n"
        "The channel: @StateOfHormuz. The token: $HORMUZ on Solana."
    ),
    # --- Chokepoint comparison ---
    (
        "There are a handful of critical maritime chokepoints: Suez, Malacca, Bab-el-Mandeb, Hormuz.\n\n"
        "Hormuz is the one that makes energy markets sweat. No other passage carries this volume of crude with this level of political risk.\n\n"
        "Live intel at @StateOfHormuz. $HORMUZ on Solana."
    ),
    # --- What the channel does ---
    (
        "Most oil market news gets covered hours after it matters.\n\n"
        "The Strait is where the story usually starts — IRGC activity, tanker seizures, shipping lane closures.\n\n"
        "@StateOfHormuz pulls from 8 live sources and posts anything related to the Strait as it comes in.\n\n"
        "$HORMUZ — the Solana token built around this chokepoint. Deflationary, stakeable."
    ),
    # --- Casual / conversational ---
    (
        "If you follow oil markets or Middle East geopolitics, @StateOfHormuz is worth having in your feed.\n\n"
        "8 monitoring channels, filtered for anything touching the Strait, tankers, IRGC, OPEC, crude.\n\n"
        "Free. No noise. Just the relevant stuff.\n\n"
        "$HORMUZ is the Solana token behind it — 100B fixed supply, DAO governance, staking."
    ),
    # --- Mining / closure threat ---
    (
        "Iran mined the Strait of Hormuz during the Iran-Iraq War, damaging several tankers and hitting a US frigate.\n\n"
        "They still have the capability. The US Fifth Fleet is based in Bahrain partly because of this.\n\n"
        "The tension never fully went away. @StateOfHormuz | $HORMUZ on Solana."
    ),
    # --- Crypto angle ---
    (
        "Commodities and crypto are increasingly correlated — oil shocks hit risk assets hard.\n\n"
        "$HORMUZ is a Solana token directly themed around the world's most volatile oil chokepoint.\n\n"
        "100B fixed supply. Mint authority burned. 1% burn on stake transactions. Up to 40% APY.\n\n"
        "Intel channel: @StateOfHormuz"
    ),
    # --- Brief / punchy ---
    (
        "20 million barrels of oil. Every day. Through a 21-mile gap.\n\n"
        "That's the Strait of Hormuz.\n\n"
        "@StateOfHormuz monitors it live. $HORMUZ on Solana."
    ),
    # --- Stakes ---
    (
        "A full closure of the Strait of Hormuz has never happened.\n\n"
        "Every serious energy security analyst treats it as a when, not an if.\n\n"
        "@StateOfHormuz runs so you're watching when it matters.\n\n"
        "$HORMUZ — Solana, deflationary, staking up to 40% APY."
    ),
    # --- Tanker traffic ---
    (
        "On any given day, between 15 and 20 fully loaded supertankers pass through the Strait of Hormuz.\n\n"
        "Each one carries around 2 million barrels. The traffic never really stops.\n\n"
        "@StateOfHormuz tracks disruptions to that flow from 8 live sources.\n\n"
        "$HORMUZ on Solana."
    ),
    # --- US-Iran tension ---
    (
        "The US and Iran have been in a low-level naval standoff in the Gulf for years.\n\n"
        "Harassment of commercial ships, drone incidents, proxy conflicts — it flares up constantly.\n\n"
        "@StateOfHormuz monitors it all. $HORMUZ is the Solana token built around this dynamic."
    ),
]

STATIC_TWEETS = [
    "20% of the world's oil goes through a 21-mile strait every day. One incident there moves crude globally.\n\n@StateOfHormuz monitors it live from 8 sources.\n\n$HORMUZ — Solana, deflationary, 40% APY staking\n\n#OilMarkets #HORMUZ",
    "The Strait of Hormuz is the single most important chokepoint in global energy.\n\nBuilt a free channel that watches it 24/7: @StateOfHormuz\n\n$HORMUZ token live on Solana\n\n#Solana #OilWatch #HORMUZ",
    "Most people find out about Strait of Hormuz incidents hours after they happen.\n\n@StateOfHormuz gets it from 8 live sources as it breaks.\n\n$HORMUZ — Solana\n\n#HORMUZ #MiddleEast #CrudeOil",
    "Iran has seized tankers in the Strait of Hormuz before. Could happen again.\n\nIf you want to know first: t.me/StateOfHormuz\n\n$HORMUZ on Solana — 100B supply, 1% burn\n\n#OilMarkets #Hormuz #Solana",
    "The Strait of Hormuz is 21 miles wide. 20M barrels of oil per day.\n\nWatching it live: @StateOfHormuz\n\n$HORMUZ — Solana\n\n#HORMUZ #Oil #Geopolitics",
]


def make_telegram_group_post() -> str:
    return random.choice(STATIC_PROMOS)


def make_tweet(include_coin: bool = True) -> str:
    tweet = random.choice(STATIC_TWEETS)
    if len(tweet) > 280:
        tweet = tweet[:277] + "..."
    return tweet


def make_reddit_post() -> dict[str, str]:
    titles = [
        "Built a free Telegram channel that monitors the Strait of Hormuz in real time",
        "Launching $HORMUZ on Solana — tracking the world's most critical oil chokepoint",
        "Free live intel channel for the Strait of Hormuz — aggregates 8 Middle East sources",
        "The Strait of Hormuz controls 20% of global oil supply. Here's a free alert channel.",
        "Strait of Hormuz monitoring channel + $HORMUZ token on Solana",
    ]
    body = (
        "The Strait of Hormuz is a 21-mile passage that carries about 20% of the world's oil. "
        "Any incident there — tanker seizure, mine, naval standoff — hits crude prices within minutes.\n\n"
        "I built @StateOfHormuz to monitor it. The channel pulls from 8 live Middle East intelligence sources "
        "and forwards anything relevant to the Strait, tankers, IRGC activity, and crude markets. "
        "No curation, no delay, just the raw feed filtered for relevance.\n\n"
        "**Channel:** t.me/StateOfHormuz\n\n"
        "**The token:** $HORMUZ is a Solana-based token built around this theme. "
        "100B fixed supply, mint burned, 1% burn on stake interactions, staking up to 40% APY, DAO governance. "
        "Still early.\n\n"
        "*Not financial advice. DYOR.*"
    )
    return {"title": random.choice(titles), "body": body}


def random_delay(min_s: int, max_s: int) -> float:
    import random
    base = random.uniform(min_s, max_s)
    jitter = random.gauss(0, base * 0.05)
    return max(float(min_s), base + jitter)


def is_good_posting_time() -> bool:
    hour = datetime.utcnow().hour
    return 8 <= hour <= 23
