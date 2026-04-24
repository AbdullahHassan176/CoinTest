"""
onchain_watcher.py — Watches the HORMUZ program for on-chain activity and
posts alerts to the Telegram channel.

Events detected:
  - Someone stakes HORMUZ        → "X staked Y HORMUZ for Z days"
  - Someone unstakes             → "X claimed Y HORMUZ + rewards"
  - DAO proposal created         → "New proposal: <title>"
  - DAO proposal passed/executed → "Proposal passed / executed"

Uses Solana's `getSignaturesForAddress` polling (no websocket needed).
Checks every 60 seconds. Stores last-seen signature to avoid re-posting.
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
DECIMALS   = 6
POLL_SECS  = 60

# File to persist the last seen signature across restarts
_CURSOR_FILE = ".onchain_cursor"

PostFn = Callable[[str], Coroutine]


def _fmt_amount(raw: int) -> str:
    n = raw / 10**DECIMALS
    if n >= 1_000_000_000:
        return f"{n/1_000_000_000:.2f}B"
    if n >= 1_000_000:
        return f"{n/1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}K"
    return f"{n:,.0f}"


def _short(pubkey: str) -> str:
    return f"{pubkey[:4]}...{pubkey[-4:]}"


async def _rpc(method: str, params: list) -> Optional[dict]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(RPC_URL, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as r:
                return (await r.json()).get("result")
    except Exception as e:
        logger.debug("RPC error: %s", e)
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
    """Returns list of new signatures, newest first, stopping at last_sig."""
    params: list = [PROGRAM_ID, {"limit": 20, "commitment": "confirmed"}]
    if last_sig:
        params[1]["until"] = last_sig
    result = await _rpc("getSignaturesForAddress", params)
    if not result:
        return []
    return [r["signature"] for r in result if not r.get("err")]


async def _parse_tx(sig: str) -> Optional[str]:
    """
    Parse a transaction and return a human-readable alert string, or None
    if it's not a notable event.
    """
    result = await _rpc("getTransaction", [
        sig,
        {"encoding": "jsonParsed", "commitment": "confirmed", "maxSupportedTransactionVersion": 0}
    ])
    if not result:
        return None

    try:
        meta     = result.get("meta", {})
        tx       = result.get("transaction", {})
        message  = tx.get("message", {})
        accounts = message.get("accountKeys", [])

        # Get account address list
        account_addrs = [
            (a["pubkey"] if isinstance(a, dict) else a)
            for a in accounts
        ]

        # Look at log messages to identify the instruction
        logs: list[str] = meta.get("logMessages") or []
        log_str = " ".join(logs)

        # Identify the fee payer (first signer = the user)
        fee_payer = account_addrs[0] if account_addrs else "unknown"
        short = _short(fee_payer)
        explorer = f"https://explorer.solana.com/tx/{sig}{'?cluster=devnet' if CLUSTER != 'mainnet-beta' else ''}"

        # ── Stake event ──────────────────────────────────────────────────────
        if "Instruction: Stake" in log_str or "stake" in log_str.lower():
            # Try to extract token transfer amount from postTokenBalances delta
            pre  = {b["accountIndex"]: int(b["uiTokenAmount"]["amount"])
                    for b in (meta.get("preTokenBalances") or [])}
            post = {b["accountIndex"]: int(b["uiTokenAmount"]["amount"])
                    for b in (meta.get("postTokenBalances") or [])}

            # Find the account whose balance decreased the most (= user staked)
            staked_raw = 0
            for idx in pre:
                if idx in post:
                    delta = pre[idx] - post[idx]
                    if delta > staked_raw:
                        staked_raw = delta

            amount_str = _fmt_amount(staked_raw) if staked_raw > 0 else "some"
            return (
                f"New stake — {short} locked {amount_str} HORMUZ\n\n"
                f"Staking is live. Join at stateofhormuz.org\n"
                f"{explorer}"
            )

        # ── Unstake event ────────────────────────────────────────────────────
        if "Instruction: Unstake" in log_str or "unstake" in log_str.lower():
            return (
                f"Unstake — {short} claimed their HORMUZ + rewards\n\n"
                f"Stake at stateofhormuz.org — up to 40% APY\n"
                f"{explorer}"
            )

        # ── Proposal created ─────────────────────────────────────────────────
        if "Instruction: CreateProposal" in log_str or "create_proposal" in log_str.lower():
            return (
                f"New DAO Proposal from {short}\n\n"
                f"Vote at stateofhormuz.org → DAO Gov tab\n"
                f"(Must be staked to vote)\n"
                f"{explorer}"
            )

        # ── Vote cast ────────────────────────────────────────────────────────
        if "Instruction: Vote" in log_str:
            return None  # Too noisy — skip individual votes

        # ── Proposal executed ────────────────────────────────────────────────
        if "Instruction: ExecuteProposal" in log_str or "execute_proposal" in log_str.lower():
            return (
                f"DAO Proposal Executed — treasury funds released\n\n"
                f"Community governance in action. stateofhormuz.org\n"
                f"{explorer}"
            )

        return None  # Unrecognised instruction — skip

    except Exception as e:
        logger.debug("TX parse error %s: %s", sig, e)
        return None


async def onchain_watcher_loop(post_fn: PostFn) -> None:
    """
    Main loop. Polls the program every POLL_SECS seconds, parses new
    transactions, and calls post_fn(message) for notable events.
    """
    logger.info("On-chain watcher started — polling %s every %ds", PROGRAM_ID[:8], POLL_SECS)
    last_sig = _load_cursor()
    if last_sig:
        logger.info("Resuming from cursor: %s", last_sig[:16])

    while True:
        try:
            new_sigs = await _get_new_signatures(last_sig)

            if new_sigs:
                # Process oldest first (reverse order)
                for sig in reversed(new_sigs):
                    alert = await _parse_tx(sig)
                    if alert:
                        try:
                            await post_fn(alert)
                            logger.info("On-chain alert posted for tx %s", sig[:16])
                        except Exception as e:
                            logger.error("Failed to post on-chain alert: %s", e)
                    await asyncio.sleep(0.5)  # avoid RPC hammering

                # Update cursor to newest signature
                _save_cursor(new_sigs[0])
                last_sig = new_sigs[0]

        except Exception as e:
            logger.error("Watcher loop error: %s", e)

        await asyncio.sleep(POLL_SECS)
