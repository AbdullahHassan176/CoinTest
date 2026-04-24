"""
templates.py — Email templates by category.

Rules:
- Max 4 short paragraphs
- Reference something specific about them (shows it's not bulk mail)
- Clear ask at the end — one thing, not five
- No crypto jargon to non-crypto people
- No exclamation marks
- Sign as a human, not a brand
"""

TEMPLATES = {

    "energy_journalist": {
        "subject_options": [
            "Free real-time Strait of Hormuz monitoring tool",
            "Built something you might find useful — Hormuz intel feed",
            "Hormuz monitoring channel — thought you'd want to know it exists",
        ],
        "body": """Hi {name},

I've been following {specific_reference} — you cover Hormuz risk more closely than most people in this space, so I thought you'd want to know this exists.

I built a free Telegram channel that aggregates 8 live Middle East intelligence sources — Geopolitics Watch, The Cradle, Iran War Updates, and others — and filters everything for Strait of Hormuz activity, tanker movements, IRGC naval developments, and crude market news. It posts matching content as it comes in, and drops a 4-hour AI briefing summarising the past 24 hours of developments with live AIS vessel tracking data from the Strait bounding box.

No sign-up, free to read: https://t.me/StateOfHormuz

There's also a Solana token behind it ($HORMUZ) but that's secondary — the channel is the main thing and it's genuinely useful regardless of whether you care about the token.

Worth knowing about next time something happens in the Gulf.

{sender_name}
""",
    },

    "iran_analyst": {
        "subject_options": [
            "Free Telegram feed monitoring Strait of Hormuz and IRGC naval activity",
            "Hormuz intel aggregator — might be useful for your work",
            "Built a real-time Hormuz monitoring tool — free",
        ],
        "body": """Hi {name},

I've been reading {specific_reference} — it's one of the clearer takes on the naval dimension of the Iran situation.

I built a free Telegram channel that pulls from 8 Middle East monitoring sources continuously and filters for anything related to the Strait, IRGC activity, tanker incidents, and Gulf naval movements. It posts matching content as it comes in and does a 4-hour AI summary of the past 24 hours.

It's free to read and doesn't require an account: https://t.me/StateOfHormuz

There's a Solana crypto token behind the project ($HORMUZ) but the channel works as a standalone intel tool regardless. Thought it might be useful for your work or at least worth bookmarking before the next escalation.

{sender_name}
""",
    },

    "crypto_influencer": {
        "subject_options": [
            "$HORMUZ — Solana token backed by a real geopolitical thesis",
            "New Solana project worth looking at — $HORMUZ / Strait of Hormuz",
            "$HORMUZ: geopolitics-backed Solana token, live intel channel already running",
        ],
        "body": """Hi {name},

Quick pitch — $HORMUZ is a Solana token built around the Strait of Hormuz, the 21-mile passage that carries 20% of the world's daily oil supply.

The project isn't just a narrative token. There's a live Telegram intelligence channel (https://t.me/StateOfHormuz) that monitors 8 Middle East sources 24/7 and posts real-time alerts on Strait activity, tanker movements, IRGC naval incidents, and oil market developments. It drops a 4-hour AI briefing with live AIS ship tracking data. The channel is already active and posting.

Token: 100B fixed supply, burned mint authority, 1% burn on staking, 40% APY max, DAO governance. Built on Solana.

No DEX listing yet — still pre-launch. Happy to send over the full tokenomics doc or set up a call if it's worth 20 minutes of your time.

{sender_name}
""",
    },

    "telegram_channel": {
        "subject_options": [
            "We built an aggregator that features your channel — worth a mention",
            "Cross-promo idea — Hormuz intel channel aggregates your content",
            "Your channel is one of 8 sources in a free Hormuz monitoring tool",
        ],
        "body": """Hi,

I built a free Telegram channel that aggregates 8 Middle East intelligence sources — and yours is one of them: https://t.me/StateOfHormuz

The bot monitors your channel along with 7 others, filters for Strait of Hormuz, oil market, and IRGC-related content, and posts matching items with attribution back to the source. So your content gets shared to a new audience with a link back to your channel every time.

There's also a Solana token behind the project ($HORMUZ) that funds development.

If you'd be open to mentioning the aggregator to your audience, I'd be happy to run a promotional post about your channel in return, or allocate some $HORMUZ tokens once we launch.

No pressure either way — the channel already benefits from your content and you get attribution either way.

{sender_name}
""",
    },

}


def get_template(category: str, name: str, specific_reference: str, sender_name: str) -> dict:
    """
    Returns a dict with 'subject' and 'body' for a given contact category.
    Fills in the personalisation fields.
    """
    import random
    t = TEMPLATES.get(category, TEMPLATES["energy_journalist"])
    subject = random.choice(t["subject_options"])
    body = t["body"].format(
        name=name,
        specific_reference=specific_reference,
        sender_name=sender_name,
    )
    return {"subject": subject, "body": body.strip()}
