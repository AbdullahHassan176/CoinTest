"""
llm_promo.py — Generates context-aware promo messages using OpenAI.

Reads the last N forwarded news items, asks GPT to summarise what's been
happening, then write a short human-sounding post that promotes the channel
based on actual recent events — not generic marketing copy.

Falls back to static messages from varied_messages.py if:
  - OPENAI_API_KEY is not set
  - The API call fails
  - No recent news items are available
"""

import logging
import os
import random
from typing import Optional

from varied_messages import make_telegram_group_post, make_tweet

logger = logging.getLogger(__name__)

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# ── Prompts ───────────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You write short Telegram channel posts for a geopolitics/oil markets channel called @StateOfHormuz.

The channel monitors the Strait of Hormuz and broader Middle East energy news. It also promotes a Solana token called $HORMUZ.

Rules you must follow without exception:
- Write like a human who follows geopolitics, not like a marketer
- Maximum 2 sentences of news summary. Then 1-2 sentences promoting the channel/token.
- No bullet points. No headers. Plain prose only.
- No exclamation marks.
- Maximum one emoji per message, and only if it fits naturally. Often zero is better.
- Never use these words: crucial, vital, significant, leverage, revolutionary, exciting, thrilled, proud, comprehensive, robust, seamless, cutting-edge, game-changer, streamline, utilize
- Never start a sentence with "This" referring to the channel or token
- Keep the total post under 200 words
- End with a plain channel mention: @StateOfHormuz or t.me/StateOfHormuz
- Mention $HORMUZ on Solana briefly but don't oversell it
- If there's nothing specific happening in the news, write something honest like "quiet week on the Strait" rather than pretending otherwise"""

_TELEGRAM_USER_PROMPT = """Here are the most recent news items forwarded by the channel:

{news_items}

Write a short Telegram post that:
1. Briefly captures what's been happening (1-2 sentences, specific to the news above)
2. Naturally leads into a mention of @StateOfHormuz as the place to follow for this
3. Mentions $HORMUZ on Solana in one short line at the end

Do not use any formatting markup. Plain text only."""

_TWEET_USER_PROMPT = """Here are the most recent news items the channel has been tracking:

{news_items}

Write a tweet (under 240 chars) that:
1. References one specific development from the news above
2. Mentions @StateOfHormuz and $HORMUZ

Plain text, no hashtag spam — one or two hashtags max at the end if they fit naturally."""

_QUIET_TELEGRAM_PROMPT = """Nothing significant has come through the Strait of Hormuz monitoring feed today.

Write a short Telegram post that:
1. Acknowledges it's been quiet (briefly — one sentence)
2. Explains why that matters for oil markets
3. Mentions @StateOfHormuz as the place to watch
4. Mentions $HORMUZ on Solana briefly

Under 150 words. Plain text, no bullet points, max one emoji."""


# ── Main generator ────────────────────────────────────────────────────────────

async def generate_promo(
    recent_news: list[str],
    mode: str = "telegram",
) -> str:
    """
    Generate a context-aware promo post.

    Args:
        recent_news: List of recent forwarded news texts (most recent last).
        mode:        "telegram" or "tweet"

    Returns:
        A human-sounding promo string. Falls back to static message on any error.
    """
    if not OPENAI_API_KEY:
        logger.debug("No OPENAI_API_KEY — using static promo")
        return make_telegram_group_post() if mode == "telegram" else make_tweet()

    try:
        import openai
        client = openai.AsyncOpenAI(api_key=OPENAI_API_KEY)

        if recent_news:
            # Deduplicate and take last 8 items, truncate each to 300 chars
            seen: set[str] = set()
            unique_news: list[str] = []
            for item in reversed(recent_news):
                key = item[:80]
                if key not in seen:
                    seen.add(key)
                    unique_news.append(item[:300] + ("…" if len(item) > 300 else ""))
                if len(unique_news) >= 8:
                    break
            unique_news.reverse()

            numbered = "\n\n".join(
                f"{i+1}. {text}" for i, text in enumerate(unique_news)
            )
            user_prompt = (
                _TWEET_USER_PROMPT if mode == "tweet"
                else _TELEGRAM_USER_PROMPT
            ).format(news_items=numbered)
        else:
            # Nothing to summarise — honest quiet-period message
            user_prompt = _QUIET_TELEGRAM_PROMPT

        response = await client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=300,
            temperature=0.85,  # High enough for variation, low enough to stay on-topic
        )

        text = response.choices[0].message.content.strip()

        # Sanity check — if it's empty or suspiciously short, fall back
        if len(text) < 40:
            raise ValueError(f"LLM returned suspiciously short response: {text!r}")

        logger.info("LLM promo generated (%d chars, %d news items as context)", len(text), len(recent_news))
        return text

    except ImportError:
        logger.warning("openai package not installed — run: pip install openai")
    except Exception as e:
        logger.warning("LLM promo failed (%s) — falling back to static message", e)

    return make_telegram_group_post() if mode == "telegram" else make_tweet()
