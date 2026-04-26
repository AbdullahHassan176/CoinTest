/**
 * AirdropSignup — task-based airdrop registration widget.
 *
 * Submissions POST to /api/airdrop/signup → stored in Vercel KV.
 * Falls back to localStorage if KV is not yet configured (local dev).
 *
 * Admin export: GET https://stateofhormuz.org/api/airdrop/export?key=SECRET
 * Then run: node_modules\.bin\ts-node scripts/airdrop.ts --list <downloaded.csv> --send
 */

import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_SYMBOL } from "../utils/connection";

const TASKS = [
  {
    id:    "telegram",
    label: "Join the Telegram channel",
    href:  "https://t.me/StateOfHormuz",
    cta:   "Join t.me/StateOfHormuz",
  },
  {
    id:    "bluesky",
    label: "Follow on Bluesky",
    href:  "https://bsky.app/profile/makingtheworldmove.bsky.social",
    cta:   "Follow on Bluesky",
  },
  {
    id:    "share",
    label: "Share this page with one person",
    href:  undefined,
    cta:   "Done — I shared it",
  },
];

const ALLOCATION    = `50,000 ${TOKEN_SYMBOL}`;
const STORAGE_KEY   = "hormuz_airdrop_submitted";

function isValidSolana(s: string) {
  try { new PublicKey(s); return true; } catch { return false; }
}

// localStorage helpers (fallback only)
function lsIsRegistered(addr: string) {
  try { return (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[]).includes(addr); }
  catch { return false; }
}
function lsSave(addr: string) {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
    if (!list.includes(addr)) { list.push(addr); localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
  } catch { /* ignore */ }
}

export default function AirdropSignup() {
  const [checked, setChecked]   = useState<Record<string, boolean>>({});
  const [wallet, setWallet]     = useState("");
  const [status, setStatus]     = useState<"idle" | "loading" | "success" | "duplicate" | "error">("idle");
  const [errMsg, setErrMsg]     = useState("");
  const [refParam, setRefParam] = useState<string | null>(null);
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) setRefParam(ref);
  }, []);

  const allDone = TASKS.every(t => checked[t.id]);

  function toggle(id: string) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const addr = wallet.trim();

    if (!isValidSolana(addr)) {
      setStatus("error");
      setErrMsg("Invalid Solana address — check and try again.");
      return;
    }

    setStatus("loading");

    try {
      const res = await fetch("/api/airdrop/signup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          address: addr,
          tasks:   Object.keys(checked).filter(k => checked[k]),
          ref:     refParam ?? undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 409 || data.error === "already_registered") {
        setStatus("duplicate");
        return;
      }

      if (!res.ok) {
        throw new Error(data.error ?? "Server error");
      }

      // KV not configured yet — fall back to localStorage for dev
      if (data.kvMissing) lsSave(addr);

      setStatus("success");
    } catch (err) {
      // Network failure — fall back to localStorage so the user isn't stuck
      if (lsIsRegistered(addr)) { setStatus("duplicate"); return; }
      lsSave(addr);
      setStatus("success");
      console.warn("API unavailable, stored locally:", err);
    }
  }

  return (
    <div className="card border border-hormuz-gold/15">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <p className="section-label">Airdrop — 5B {TOKEN_SYMBOL}</p>
        <span className="font-mono-data text-[10px] text-hormuz-gold/60 border border-hormuz-gold/20 px-2 py-0.5 rounded-sm tracking-widest">
          {ALLOCATION} / wallet
        </span>
      </div>
      <p className="text-[11px] text-white/40 leading-relaxed mb-4">
        Complete the three tasks below, then submit your Solana wallet address.
        Tokens are distributed before mainnet launch.
      </p>

      {/* Tasks */}
      <div className="space-y-2.5 mb-4">
        {TASKS.map(task => (
          <label
            key={task.id}
            className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-all
              ${checked[task.id]
                ? "border-hormuz-teal/30 bg-hormuz-teal/5"
                : "border-white/[0.06] hover:border-white/[0.12]"}`}
          >
            <div
              onClick={() => toggle(task.id)}
              className={`mt-0.5 w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 transition-all
                ${checked[task.id]
                  ? "bg-hormuz-teal border-hormuz-teal"
                  : "border-white/20"}`}
            >
              {checked[task.id] && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="#0a1628" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-xs text-white/70">{task.label}</div>
              {task.href ? (
                <a
                  href={task.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-hormuz-teal/60 hover:text-hormuz-teal transition-colors"
                  onClick={() => toggle(task.id)}
                >
                  {task.cta} ↗
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(task.id)}
                  className="text-[11px] text-hormuz-teal/60 hover:text-hormuz-teal transition-colors"
                >
                  {task.cta}
                </button>
              )}
            </div>
          </label>
        ))}
      </div>

      {/* Wallet input + submit */}
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <input
            type="text"
            value={wallet}
            onChange={e => { setWallet(e.target.value); setStatus("idle"); }}
            placeholder="Your Solana wallet address"
            disabled={!allDone || status === "success" || status === "loading"}
            className={`flex-1 font-mono-data text-xs bg-hormuz-navy/60 border rounded-md px-3 py-2.5
              placeholder:text-white/20 text-white/80 outline-none transition-all
              ${!allDone ? "opacity-40 cursor-not-allowed border-white/[0.06]" : "border-white/15 focus:border-hormuz-teal/40"}
              ${status === "error" ? "border-red-500/40" : ""}`}
          />
          <button
            type="submit"
            disabled={!allDone || status === "success" || status === "loading"}
            className={`shrink-0 px-4 py-2.5 rounded-md text-xs font-semibold tracking-wide transition-all
              ${allDone && status !== "success" && status !== "loading"
                ? "bg-hormuz-gold text-hormuz-deep hover:bg-hormuz-gold/90"
                : "bg-white/5 text-white/20 cursor-not-allowed"}`}
          >
            {status === "loading" ? "..." : "Register"}
          </button>
        </div>

        {status === "success" && (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-hormuz-teal">
              Registered. You will receive {ALLOCATION} before mainnet launch.
            </p>
            {/* Referral link */}
            <div className="rounded-md border border-hormuz-gold/20 bg-hormuz-gold/5 p-2.5">
              <p className="text-[10px] text-hormuz-gold/70 mb-1.5 font-semibold tracking-wide uppercase">
                Your referral link — earn +25,000 {TOKEN_SYMBOL} per signup
              </p>
              <div className="flex gap-2 items-center">
                <span className="font-mono-data text-[10px] text-white/50 truncate flex-1">
                  stateofhormuz.org?ref={wallet.trim()}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`https://stateofhormuz.org?ref=${wallet.trim()}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="shrink-0 text-[10px] px-2 py-1 rounded border border-hormuz-gold/30 text-hormuz-gold/70 hover:text-hormuz-gold transition-colors"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        )}
        {status === "duplicate" && (
          <p className="mt-2 text-[11px] text-hormuz-gold/70">
            This address is already registered.
          </p>
        )}
        {status === "error" && (
          <p className="mt-2 text-[11px] text-red-400/70">{errMsg}</p>
        )}
        {!allDone && status === "idle" && (
          <p className="mt-2 text-[10px] text-white/25 font-mono-data">
            Complete all tasks above to unlock registration.
          </p>
        )}
      </form>

      <div className="mt-3 pt-3 border-t border-white/[0.05]">
        <span className="text-[10px] text-white/20 font-mono-data">
          5B {TOKEN_SYMBOL} total · {ALLOCATION} per wallet · pre-mainnet
        </span>
      </div>
    </div>
  );
}
