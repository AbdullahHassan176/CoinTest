"""
market_watcher.py — Watches the HORMUZ program for prediction market events
and posts alerts to the Telegram channel.

Events detected:
  - New market created  → "New prediction market: <question>"
  - Market resolved     → "Market resolved: <outcome> — winners can claim"
  - Market cancelled    → "Market cancelled: <question>"

Uses the same getSignaturesForAddress polling pattern as onchain_watcher.py.
Checks every 90 seconds (offset from onchain_watcher to avoid RPC collision).
"""

import asyncio
import base64
import logging
import os
import struct
from typing import Callable, Coroutine, Optional

import aiohttp

logger = logging.getLogger(__name__)

CLUSTER    = os.getenv("CLUSTER", "devnet")
RPC_URL    = os.getenv("ANCHOR_PROVIDER_URL",
               "https://api.mainnet-beta.solana.com" if CLUSTER == "mainnet-beta"
               else "https://api.devnet.solana.com")
PROGRAM_ID = os.getenv("PROGRAM_ID", "5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv")
SITE_URL   = os.getenv("SITE_URL",   "https://stateofhormuz.org")
DECIMALS   = 6
POLL_SECS  = 90

_CURSOR_FILE = ".market_cursor"
PostFn = Callable[[str], Coroutine]


def _short(pubkey: str) -> str:
    return f"{pubkey[:4]}...{pubkey[-4:]}"


async def _rpc(method: str, params: list) -> Optional[dict]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(RPC_URL, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as r:
                return (await r.json()).get("result")
    except Exception as e:
        logger.debug("Market watcher RPC error: %s", e)
        return None


def _load_cursor() -> Optional[str]:
    try:
        return open(_CURSOR_FILE).read().strip() or None
    except FileNotFoundError:
        return None


def _save_cursor(sig: str) -> None:
    with open(_CURSOR_FILE, "w") as f:
        f.write(sig)


async def _get_new_signatures(last_sig: Optional[str]) -> list[str]:
    params: list = [PROGRAM_ID, {"limit": 20, "commitment": "confirmed"}]
    if last_sig:
        params[1]["until"] = last_sig
    result = await _rpc("getSignaturesForAddress", params)
    if not result:
        return []
    return [r["signature"] for r in result if not r.get("err")]


async def _parse_market_tx(sig: str) -> Optional[str]:
    """
    Parse a transaction for prediction market events.
    Returns a human-readable alert string or None.
    """
    result = await _rpc("getTransaction", [
        sig,
        {"encoding": "jsonParsed", "commitment": "confirmed", "maxSupportedTransactionVersion": 0}
    ])
    if not result:
        return None

    try:
        meta    = result.get("meta", {})
        tx      = result.get("transaction", {})
        message = tx.get("message", {})
        accounts = message.get("accountKeys", [])

        account_addrs = [
            (a["pubkey"] if isinstance(a, dict) else a)
            for a in accounts
        ]
        logs: list[str] = meta.get("logMessages") or []
        log_str = " ".join(logs)

        fee_payer = account_addrs[0] if account_addrs else "unknown"
        short = _short(fee_payer)
        explorer = (
            f"https://explorer.solana.com/tx/{sig}"
            f"{'?cluster=devnet' if CLUSTER != 'mainnet-beta' else ''}"
        )
        markets_url = f"{SITE_URL}/markets"

        # ── CreateMarket ─────────────────────────────────────────────────────
        if "Instruction: CreateMarket" in log_str or "create_market" in log_str.lower():
            return (
                f"New Prediction Market\n\n"
                f"A staker just opened a new market on the Strait of Hormuz.\n"
                f"Stake HORMUZ to participate.\n\n"
                f"Vote YES or NO: {markets_url}\n"
                f"{explorer}"
            )

        # ── ResolveMarket ────────────────────────────────────────────────────
        if "Instruction: ResolveMarket" in log_str or "resolve_market" in log_str.lower():
            return (
                f"Market Resolved\n\n"
                f"A prediction market has been settled on-chain.\n"
                f"Winners: claim your HORMUZ at {markets_url}\n"
                f"2% of the pool has been burned.\n\n"
                f"{explorer}"
            )

        # ── CancelMarket ─────────────────────────────────────────────────────
        if "Instruction: CancelMarket" in log_str or "cancel_market" in log_str.lower():
            return (
                f"Market Cancelled\n\n"
                f"A prediction market was cancelled. All bettors can reclaim their HORMUZ.\n"
                f"Refund at: {markets_url}\n\n"
                f"{explorer}"
            )

        # ── PlaceBet ─────────────────────────────────────────────────────────
        if "Instruction: PlaceBet" in log_str or "place_bet" in log_str.lower():
            # Extract amount from token balance delta
            pre  = {b["accountIndex"]: int(b["uiTokenAmount"]["amount"])
                    for b in (meta.get("preTokenBalances") or [])}
            post = {b["accountIndex"]: int(b["uiTokenAmount"]["amount"])
                    for b in (meta.get("postTokenBalances") or [])}
            bet_raw = 0
            for idx in pre:
                if idx in post:
                    delta = pre[idx] - post[idx]
                    if delta > bet_raw:
                        bet_raw = delta

            if bet_raw >= 1_000 * 10**DECIMALS:  # Only post for bets >= 1K HRMZ
                amount_str = f"{bet_raw / 10**DECIMALS:,.0f}"
                return (
                    f"Large Bet Placed\n\n"
                    f"{short} just bet {amount_str} HORMUZ on a market outcome.\n"
                    f"Join the action: {markets_url}\n\n"
                    f"{explorer}"
                )
            return None  # Small bets — skip to avoid noise

        return None

    except Exception as e:
        logger.debug("Market TX parse error %s: %s", sig, e)
        return None


async def market_watcher_loop(post_fn: PostFn) -> None:
    """
    Main loop. Polls the program every POLL_SECS seconds for market events
    and calls post_fn(message) for notable events.
    """
    logger.info("Market watcher started — polling %s every %ds", PROGRAM_ID[:8], POLL_SECS)
    # Initial delay to offset from onchain_watcher (avoid simultaneous RPC bursts)
    await asyncio.sleep(45)

    last_sig = _load_cursor()
    if last_sig:
        logger.info("Market watcher resuming from cursor: %s", last_sig[:16])

    while True:
        try:
            new_sigs = await _get_new_signatures(last_sig)

            if new_sigs:
                for sig in reversed(new_sigs):
                    alert = await _parse_market_tx(sig)
                    if alert:
                        try:
                            await post_fn(alert)
                            logger.info("Market alert posted for tx %s", sig[:16])
                        except Exception as e:
                            logger.error("Failed to post market alert: %s", e)
                    await asyncio.sleep(0.5)

                _save_cursor(new_sigs[0])
                last_sig = new_sigs[0]

        except Exception as e:
            logger.error("Market watcher loop error: %s", e)

        await asyncio.sleep(POLL_SECS)
