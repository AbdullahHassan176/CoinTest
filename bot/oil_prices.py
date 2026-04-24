"""
oil_prices.py — Fetches live WTI and Brent crude prices and posts a daily
morning update to the channel.

Data source: Yahoo Finance via yfinance (free, no API key).
  CL=F  — WTI Crude Futures (US benchmark)
  BZ=F  — Brent Crude Futures (global benchmark)
  NG=F  — Natural Gas Futures (bonus context)

Posts at 07:00 UTC every day — before European markets open, useful timing
for people who trade or follow energy markets.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


async def fetch_prices() -> Optional[dict]:
    """
    Fetch current WTI, Brent, and Natural Gas prices.
    Returns dict with price data or None on failure.
    """
    try:
        import yfinance as yf

        loop = asyncio.get_event_loop()

        def _fetch():
            tickers = yf.Tickers("CL=F BZ=F NG=F")
            result = {}
            for symbol, name in [("CL=F", "WTI"), ("BZ=F", "Brent"), ("NG=F", "NatGas")]:
                try:
                    t = tickers.tickers[symbol]
                    info = t.fast_info
                    price = info.last_price
                    prev_close = info.previous_close
                    if price and prev_close:
                        change = price - prev_close
                        pct = (change / prev_close) * 100
                        result[name] = {
                            "price": round(price, 2),
                            "change": round(change, 2),
                            "pct": round(pct, 2),
                        }
                except Exception as e:
                    logger.debug("Price fetch failed for %s: %s", symbol, e)
            return result

        data = await loop.run_in_executor(None, _fetch)
        return data if data else None

    except ImportError:
        logger.warning("yfinance not installed — run: pip install yfinance")
    except Exception as e:
        logger.error("Price fetch error: %s", e)
    return None


def _arrow(change: float) -> str:
    if change > 0:
        return "+"
    return ""


def format_price_post(data: dict) -> str:
    """Format oil price data as a Telegram message."""
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%a %d %b %Y")

    lines = [f"Oil Market Open — {date_str}", ""]

    wti = data.get("WTI")
    brent = data.get("Brent")
    gas = data.get("NatGas")

    if wti:
        lines.append(
            f"WTI Crude:    ${wti['price']} "
            f"({_arrow(wti['change'])}{wti['change']}, "
            f"{_arrow(wti['pct'])}{wti['pct']}%)"
        )
    if brent:
        lines.append(
            f"Brent Crude:  ${brent['price']} "
            f"({_arrow(brent['change'])}{brent['change']}, "
            f"{_arrow(brent['pct'])}{brent['pct']}%)"
        )
    if gas:
        lines.append(
            f"Natural Gas:  ${gas['price']} "
            f"({_arrow(gas['change'])}{gas['change']}, "
            f"{_arrow(gas['pct'])}{gas['pct']}%)"
        )

    lines.append("")
    lines.append(
        "The Strait of Hormuz carries 20% of global oil supply. "
        "Any incident there moves these numbers within the hour."
    )
    lines.append("")
    lines.append("@StateOfHormuz | $HORMUZ on Solana")

    return "\n".join(lines)


async def daily_price_loop(post_fn) -> None:
    """
    Waits until 07:00 UTC, posts oil prices, then repeats every 24 hours.
    post_fn is the bot's post_message coroutine.
    """
    logger.info("Oil price loop started — will post daily at 07:00 UTC")

    while True:
        now = datetime.now(timezone.utc)
        target = now.replace(hour=7, minute=0, second=0, microsecond=0)
        if now >= target:
            target += timedelta(days=1)

        wait_s = (target - now).total_seconds()
        logger.info("Next oil price post in %.0fh %.0fm", wait_s // 3600, (wait_s % 3600) // 60)
        await asyncio.sleep(wait_s)

        data = await fetch_prices()
        if data:
            msg = format_price_post(data)
            success = await post_fn(msg)
            if success:
                logger.info("Daily oil price posted")
        else:
            logger.warning("Oil price fetch failed — skipping today's post")
