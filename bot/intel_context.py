"""
intel_context.py — Derives short context strings from the rolling news buffer.

Used to tie each Telegram post and digest to what the monitor feed has been
emphasizing, without extra LLM calls.
"""

import html as html_lib

from config import BOOST_KEYWORDS, PRIMARY_KEYWORDS


def feed_keyword_themes(recent_lines: list[str], limit: int = 4) -> list[str]:
    """Return the top keyword phrases by crude frequency in recent forwarded text."""
    if not recent_lines:
        return []
    blob = " ".join(recent_lines).lower()
    scored: list[tuple[int, int, str]] = []
    for kw in PRIMARY_KEYWORDS + BOOST_KEYWORDS:
        if kw in blob:
            scored.append((blob.count(kw), len(kw), kw))
    scored.sort(reverse=True)
    seen: set[str] = set()
    out: list[str] = []
    for _, _, kw in scored:
        if kw not in seen:
            seen.add(kw)
            out.append(kw)
        if len(out) >= limit:
            break
    return out


def _pretty_theme(s: str) -> str:
    return " ".join(w[:1].upper() + w[1:] if w else w for w in s.split())


def themes_plain_line(recent_lines: list[str], matched_keywords: list[str]) -> str:
    """One plain-text line for breaking alerts (no HTML)."""
    themes = feed_keyword_themes(recent_lines, limit=5)
    if len(themes) < 2:
        for m in matched_keywords:
            if m not in themes:
                themes.append(m)
            if len(themes) >= 4:
                break
    if not themes:
        return ""
    return "Monitor themes (recent feed): " + ", ".join(themes[:5])


def intel_strip_html(recent_lines: list[str], matched_keywords: list[str]) -> str:
    """
    Short italic HTML line for normal posts, or empty string if nothing to add.
    `recent_lines` should be the buffer *before* appending the current item.
    """
    themes = feed_keyword_themes(recent_lines, limit=4)
    if len(themes) < 2:
        for m in matched_keywords:
            if m not in themes:
                themes.append(m)
            if len(themes) >= 4:
                break
    if not themes:
        return ""
    pretty = " · ".join(_pretty_theme(t) for t in themes[:4])
    return f"<i>📊 Feed context: {html_lib.escape(pretty)}</i>"
