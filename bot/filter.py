"""
filter.py — Keyword relevance filtering for incoming Telegram messages.
"""

from config import PRIMARY_KEYWORDS, BOOST_KEYWORDS, MIN_RELEVANCE_SCORE


def relevance_score(text: str) -> int:
    """
    Returns a relevance score for the given message text.
    Primary keyword match = 2 points each.
    Boost keyword match   = 1 point each.
    Returns 0 if no primary keyword matches at all.
    """
    lowered = text.lower()

    primary_hits = sum(1 for kw in PRIMARY_KEYWORDS if kw in lowered)
    if primary_hits == 0:
        return 0  # Must have at least one primary keyword

    boost_hits = sum(1 for kw in BOOST_KEYWORDS if kw in lowered)
    return (primary_hits * 2) + boost_hits


def is_relevant(text: str) -> bool:
    """Returns True if the message meets the minimum relevance threshold."""
    if not text or not text.strip():
        return False
    return relevance_score(text) >= MIN_RELEVANCE_SCORE


def matched_keywords(text: str) -> list[str]:
    """Returns list of matched keywords (useful for logging)."""
    lowered = text.lower()
    return [kw for kw in PRIMARY_KEYWORDS + BOOST_KEYWORDS if kw in lowered]
