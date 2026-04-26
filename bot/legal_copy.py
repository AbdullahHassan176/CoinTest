"""
Canonical legal / positioning copy for HORMUZ.

Used by: Telegram channel posts (via main.post_message), /help, and any
command that discusses the token or airdrop. Keep in sync with
docs/launch_playbook_hormuz.md Phase 0.4.
"""

import html as html_lib

DISCLAIMER = (
    "HORMUZ is a community meme/utility token on Solana. It is not a security, fund, or investment product.\n"
    "Crypto is high risk. You can lose 100% of any amount you use. This is not financial, legal, or tax advice.\n"
    'Nothing here promises profit, "passive income," or exposure to oil markets. DYOR.'
)

WHAT_IT_IS = (
    'HORMUZ ties a fixed-supply, deflationary token (1% burn on stake) to a public Strait of Hormuz "intel" '
    "channel: curated news + (where we ship) on-chain staking, DAO budget votes, and transparent locks "
    "(mint revoked, LP locked, team tokens vested).\n"
    "The token rewards community and narrative participation — not oil performance."
)

WHAT_IT_IS_NOT = (
    "Not a hedge against oil or war. Not a substitute for real analysis or for institutional research.\n"
    "Not a product from your day-job employer. Not advice to buy or hold any asset."
)

_MARK = "\n\n────────\n\n"


def plain_legal_footer() -> str:
    """All three blocks, plain text — for Telegram plain posts and command replies."""
    return _MARK + DISCLAIMER + "\n\n" + WHAT_IT_IS + "\n\n" + WHAT_IT_IS_NOT


def html_legal_footer() -> str:
    """All three blocks, HTML-escaped — append to ParseMode.HTML messages."""
    return (
        _MARK
        + html_lib.escape(DISCLAIMER)
        + "\n\n"
        + html_lib.escape(WHAT_IT_IS)
        + "\n\n"
        + html_lib.escape(WHAT_IT_IS_NOT)
    )


def merge_channel_message(body: str, *, html: bool, max_len: int = 4096) -> str:
    """
    Append legal footer; if over max_len, truncate body (never the footer).
    """
    footer = html_legal_footer() if html else plain_legal_footer()
    room = max_len - len(footer) - 3
    if room < 200:
        room = 200
    if len(body) > room:
        body = body[: room - 1].rstrip() + "…"
    return body + footer
