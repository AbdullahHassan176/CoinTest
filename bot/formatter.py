"""
formatter.py — Formats RSS entries for posting to the HORMUZ channel.

Uses HTML parse mode (Telegram HTML subset) which is simpler and more robust
than Markdown — no escaping needed for common punctuation in news text.
"""

import html as html_lib

from config import HASHTAGS, MAX_MESSAGE_LENGTH


def format_post(
    text: str,
    source_name: str,
    source_username: str,
    url: str = "",
    media_caption: bool = False,
) -> str:
    """
    Formats a message for the HORMUZ channel using Telegram HTML.

    Args:
        text:             The original message text (plain, no HTML).
        source_name:      Display name of the source channel.
        source_username:  @username of the source channel.
        url:              Link to the original post (optional).
        media_caption:    If True, keep text shorter.

    Returns:
        HTML-formatted string ready to post with ParseMode.HTML.
    """
    # Escape any HTML special chars in user-supplied fields
    safe_text = html_lib.escape(text)
    safe_name = html_lib.escape(source_name)

    if url:
        attribution = f'📡 via <a href="{url}">{safe_name}</a>'
    else:
        attribution = f'📡 via <a href="https://t.me/{source_username}">{safe_name}</a>'

    footer = f'\n\n{HASHTAGS}\n🪙 <a href="https://t.me/HORMUZCoin">@HORMUZCoin</a>'

    # Reserve space for attribution + footer (rough byte count)
    overhead = len(attribution) + len(footer) + 4
    max_text = (800 if media_caption else MAX_MESSAGE_LENGTH) - overhead

    if len(safe_text) > max_text:
        safe_text = safe_text[:max_text].rstrip() + "…"

    return f"{attribution}\n\n{safe_text}{footer}"
