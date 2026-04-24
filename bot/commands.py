"""
commands.py — Interactive Telegram bot commands for @StateOfHormuzBot.

Commands (register with @BotFather → /setcommands):
  /stats      — live on-chain stats (supply, staked, burned, treasury)
  /airdrop    — signup link + current registration count
  /leaderboard— top 5 stakers by amount
  /strait     — latest Hormuz intel summary (last 5 forwarded items)
  /price      — HORMUZ price from Raydium (mainnet only)
  /help       — command list

Usage: imported and wired into main.py via Application (python-telegram-bot v20+).
"""

import logging
import os
from typing import Optional

import aiohttp
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes
from telegram.constants import ParseMode

from config import BOT_TOKEN

logger = logging.getLogger(__name__)

CLUSTER        = os.getenv("CLUSTER", "devnet")
RPC_URL        = os.getenv("ANCHOR_PROVIDER_URL",
                   "https://api.mainnet-beta.solana.com" if CLUSTER == "mainnet-beta"
                   else "https://api.devnet.solana.com")

PROGRAM_ID     = os.getenv("PROGRAM_ID",     "5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv")
HORMUZ_MINT    = os.getenv("HORMUZ_MINT",    "D6i3vdtzYWuTxEVBobSYegqHane3u6kzvBYXDTHxvLN2")
SITE_URL       = os.getenv("SITE_URL",       "https://stateofhormuz.org")
DECIMALS       = 6
TOTAL_SUPPLY   = 100_000_000_000  # 100B

# Shared reference to recent news items — injected by main.py
_recent_news: list[str] = []


def set_recent_news(news: list[str]) -> None:
    global _recent_news
    _recent_news = news


# ── RPC helpers ───────────────────────────────────────────────────────────────

async def _rpc(method: str, params: list) -> Optional[dict]:
    payload = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(RPC_URL, json=payload, timeout=aiohttp.ClientTimeout(total=8)) as r:
                data = await r.json()
                return data.get("result")
    except Exception as e:
        logger.warning("RPC error: %s", e)
        return None


async def _token_balance(account: str) -> Optional[float]:
    result = await _rpc("getTokenAccountBalance", [account, {"commitment": "confirmed"}])
    if result and "value" in result:
        return float(result["value"].get("uiAmount", 0) or 0)
    return None


async def _get_program_state() -> Optional[dict]:
    """Fetch and decode the ProgramState PDA account."""
    import base64, struct
    from solders.pubkey import Pubkey  # type: ignore

    try:
        # Derive PDA: seeds = [b"program-state"], program = PROGRAM_ID
        program_pub = Pubkey.from_string(PROGRAM_ID)
        pda, _ = Pubkey.find_program_address([b"program-state"], program_pub)

        result = await _rpc("getAccountInfo", [
            str(pda),
            {"encoding": "base64", "commitment": "confirmed"}
        ])
        if not result or not result.get("value"):
            return None

        data = base64.b64decode(result["value"]["data"][0])
        # Skip 8-byte discriminator
        # Layout: authority(32) + hormuz_mint(32) + staking_vault(32) +
        #         rewards_treasury(32) + dao_treasury(32) +
        #         total_staked(8) + total_burned(8) + proposal_count(8) + bump(1)
        offset = 8 + 32 + 32 + 32 + 32 + 32  # skip pubkeys
        total_staked, total_burned, proposal_count = struct.unpack_from("<QQQ", data, offset)
        return {
            "total_staked":    total_staked / 10**DECIMALS,
            "total_burned":    total_burned / 10**DECIMALS,
            "proposal_count":  proposal_count,
        }
    except Exception as e:
        logger.warning("ProgramState decode error: %s", e)
        return None


def _fmt(n: float) -> str:
    """Format large numbers compactly: 1234567 → 1.23M"""
    if n >= 1_000_000_000:
        return f"{n/1_000_000_000:.2f}B"
    if n >= 1_000_000:
        return f"{n/1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}K"
    return f"{n:,.0f}"


# ── KV airdrop count ──────────────────────────────────────────────────────────

async def _airdrop_count() -> Optional[int]:
    kv_url   = os.getenv("KV_REST_API_URL")
    kv_token = os.getenv("KV_REST_API_TOKEN")
    if not kv_url or not kv_token:
        return None
    try:
        async with aiohttp.ClientSession() as s:
            async with s.post(
                kv_url,
                json=["SCARD", "airdrop:addresses"],
                headers={"Authorization": f"Bearer {kv_token}"},
                timeout=aiohttp.ClientTimeout(total=5),
            ) as r:
                data = await r.json()
                return int(data.get("result", 0))
    except Exception as e:
        logger.warning("KV SCARD error: %s", e)
        return None


# ── Command handlers ──────────────────────────────────────────────────────────

async def cmd_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = (
        "HORMUZ Bot — Commands\n\n"
        "/stats — live on-chain metrics\n"
        "/airdrop — join the airdrop\n"
        "/leaderboard — coming soon\n"
        "/strait — latest Hormuz intel\n"
        "/price — HORMUZ price (mainnet)\n"
        "/help — this message"
    )
    await update.message.reply_text(text)


async def cmd_stats(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("Fetching chain data...")

    state = await _get_program_state()

    if not state:
        await update.message.reply_text(
            "HORMUZ — Live Stats\n\n"
            f"Total supply: 100,000,000,000\n"
            f"Mint authority: Revoked\n"
            f"Network: {'Mainnet' if CLUSTER == 'mainnet-beta' else 'Devnet'}\n\n"
            f"Verify: solscan.io/token/{HORMUZ_MINT}{'?cluster=devnet' if CLUSTER == 'devnet' else ''}"
        )
        return

    circulating = TOTAL_SUPPLY - state["total_burned"]
    text = (
        f"HORMUZ — Live Stats\n\n"
        f"Total supply:    {_fmt(TOTAL_SUPPLY)}\n"
        f"Circulating:     {_fmt(circulating)}\n"
        f"Total burned:    {_fmt(state['total_burned'])}\n"
        f"Currently staked:{_fmt(state['total_staked'])}\n"
        f"DAO proposals:   {state['proposal_count']}\n"
        f"Network:         {'Mainnet' if CLUSTER == 'mainnet-beta' else 'Devnet'}\n\n"
        f"Stake at {SITE_URL}"
    )
    await update.message.reply_text(text)


async def cmd_airdrop(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    count = await _airdrop_count()
    count_str = f"{count:,} wallets registered" if count is not None else "registration open"

    text = (
        f"HORMUZ Airdrop — 5,000,000,000 tokens\n\n"
        f"50,000 HORMUZ per wallet.\n"
        f"Currently: {count_str}\n\n"
        f"Three tasks to qualify:\n"
        f"1. Join this channel\n"
        f"2. Follow on Bluesky\n"
        f"3. Share with one person\n\n"
        f"Register: {SITE_URL}"
    )
    await update.message.reply_text(text)


async def cmd_strait(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _recent_news:
        await update.message.reply_text(
            "No recent Strait activity in the buffer yet. "
            "Check the channel for live updates."
        )
        return

    items = _recent_news[-5:]
    lines = "\n\n".join(f"— {t[:200]}" for t in reversed(items))
    text = f"Latest Hormuz Intel\n\n{lines}\n\nFull feed: t.me/StateOfHormuz"
    # Trim to Telegram limit
    if len(text) > 4000:
        text = text[:3997] + "..."
    await update.message.reply_text(text)


async def cmd_price(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if CLUSTER != "mainnet-beta":
        await update.message.reply_text(
            "Price data is available after mainnet launch.\n"
            f"Airdrop open at {SITE_URL}"
        )
        return

    # Once mainnet: fetch from Jupiter price API
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(
                f"https://price.jup.ag/v6/price?ids={HORMUZ_MINT}",
                timeout=aiohttp.ClientTimeout(total=5),
            ) as r:
                data = await r.json()
                price = data["data"][HORMUZ_MINT]["price"]
                mc    = price * TOTAL_SUPPLY
                text = (
                    f"HORMUZ Price\n\n"
                    f"Price:     ${price:.8f}\n"
                    f"Market cap: ${_fmt(mc)}\n\n"
                    f"Trade: raydium.io/swap"
                )
    except Exception:
        text = "Price data temporarily unavailable. Check raydium.io/swap"

    await update.message.reply_text(text)


async def cmd_leaderboard(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Leaderboard launches with mainnet staking.\n\n"
        f"Stake at {SITE_URL} to secure your position."
    )


async def cmd_markets(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Fetch active prediction markets from on-chain and summarise them."""
    import base64

    try:
        from solders.pubkey import Pubkey  # type: ignore
        program_pub = Pubkey.from_string(PROGRAM_ID)

        # Derive market-config PDA to get market_count
        config_pda, _ = Pubkey.find_program_address([b"market-config"], program_pub)
        result = await _rpc("getAccountInfo", [
            str(config_pda),
            {"encoding": "base64", "commitment": "confirmed"}
        ])

        if not result or not result.get("value"):
            await update.message.reply_text(
                f"No prediction markets found yet.\n"
                f"Create one at {SITE_URL}/markets"
            )
            return

        data = base64.b64decode(result["value"]["data"][0])
        # MarketConfig layout: 8 discriminator + 8 market_count + 1 bump
        market_count = struct.unpack_from("<Q", data, 8)[0]

        if market_count == 0:
            await update.message.reply_text(
                f"No prediction markets yet.\n"
                f"Stake HORMUZ and create one at {SITE_URL}/markets"
            )
            return

        # Fetch last 5 markets (newest first)
        lines = []
        for market_id in range(min(market_count, 5) - 1, -1, -1):
            id_bytes = market_id.to_bytes(8, "little")
            market_pda, _ = Pubkey.find_program_address(
                [b"market", id_bytes], program_pub
            )
            m_result = await _rpc("getAccountInfo", [
                str(market_pda),
                {"encoding": "base64", "commitment": "confirmed"}
            ])
            if not m_result or not m_result.get("value"):
                continue

            m_data = base64.b64decode(m_result["value"]["data"][0])
            # Market layout after 8-byte discriminator:
            # creator(32) + market_id(8) + question(4+len) + resolution_end(8) +
            # status(1) + yes_pool(8) + no_pool(8) + outcome(1) + bump(1)
            offset = 8 + 32 + 8
            q_len = struct.unpack_from("<I", m_data, offset)[0]
            offset += 4
            question = m_data[offset:offset + q_len].decode("utf-8", errors="replace")
            offset += q_len
            resolution_end = struct.unpack_from("<q", m_data, offset)[0]
            offset += 8
            status_byte = m_data[offset]
            offset += 1
            yes_pool, no_pool = struct.unpack_from("<QQ", m_data, offset)
            offset += 16
            outcome = m_data[offset]

            status_names = {0: "Active", 1: "Resolved", 2: "Cancelled"}
            status = status_names.get(status_byte, "?")

            total_pool = (yes_pool + no_pool) / 10**DECIMALS
            yes_pct = round(yes_pool / (yes_pool + no_pool) * 100) if (yes_pool + no_pool) > 0 else 50

            from datetime import datetime, timezone
            ends_dt = datetime.fromtimestamp(resolution_end, tz=timezone.utc)
            ends_str = ends_dt.strftime("%b %d")

            lines.append(
                f"#{market_id} [{status}] {question[:80]}\n"
                f"   YES {yes_pct}% / NO {100 - yes_pct}% · {total_pool:,.0f} HRMZ · ends {ends_str}"
                + (f" · outcome: {'YES' if outcome else 'NO'}" if status == "Resolved" else "")
            )

        if not lines:
            await update.message.reply_text(f"Markets at: {SITE_URL}/markets")
            return

        text = (
            f"HORMUZ Prediction Markets ({market_count} total)\n\n"
            + "\n\n".join(lines)
            + f"\n\nBet YES or NO: {SITE_URL}/markets"
        )
        if len(text) > 4000:
            text = text[:3997] + "..."
        await update.message.reply_text(text)

    except Exception as e:
        logger.warning("cmd_markets error: %s", e)
        await update.message.reply_text(
            f"Markets: {SITE_URL}/markets\n"
            "(Could not fetch live data)"
        )


async def cmd_monitor(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Link to the live Strait of Hormuz intelligence dashboard."""
    text = (
        f"HORMUZ Strait Monitor\n\n"
        f"Live intelligence dashboard:\n"
        f"• Threat level meter\n"
        f"• Oil price feed (Brent / WTI / NatGas)\n"
        f"• AIS vessel traffic in Hormuz zone\n"
        f"• Breaking news aggregator\n\n"
        f"Monitor the strait: {SITE_URL}/monitor"
    )
    await update.message.reply_text(text)


# ── Wire into the bot application ────────────────────────────────────────────

def register_commands(app: Application) -> None:
    """Call this from main.py after creating the Application."""
    app.add_handler(CommandHandler("help",        cmd_help))
    app.add_handler(CommandHandler("start",       cmd_help))
    app.add_handler(CommandHandler("stats",       cmd_stats))
    app.add_handler(CommandHandler("airdrop",     cmd_airdrop))
    app.add_handler(CommandHandler("strait",      cmd_strait))
    app.add_handler(CommandHandler("price",       cmd_price))
    app.add_handler(CommandHandler("leaderboard", cmd_leaderboard))
    app.add_handler(CommandHandler("markets",     cmd_markets))
    app.add_handler(CommandHandler("monitor",     cmd_monitor))
    logger.info(
        "Bot commands registered: "
        "/help /stats /airdrop /strait /price /leaderboard /markets /monitor"
    )
