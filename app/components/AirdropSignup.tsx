/**
 * AirdropSignup — task-based airdrop registration widget.
 * Collects a Solana wallet address after the user confirms three tasks.
 * Submissions are stored in localStorage and downloaded as CSV by the admin.
 *
 * No backend required — works purely client-side on Vercel.
 * Admin: open the site with ?export=airdrop to download the CSV.
 */

import { useState, useEffect } from "react";
import { PublicKey } from "@solana/web3.js";

const TASKS = [
  { id: "telegram", label: "Join the Telegram channel", href: "https://t.me/StateOfHormuz", cta: "Join t.me/StateOfHormuz" },
  { id: "bluesky",  label: "Follow on Bluesky",         href: "https://bsky.app/profile/makingtheworldmove.bsky.social", cta: "Follow on Bluesky" },
  { id: "share",    label: "Share this page with someone", href: undefined, cta: "I shared it" },
];

const STORAGE_KEY = "hormuz_airdrop_submissions";
const ALLOCATION  = "50,000 HORMUZ";

function isValidSolanaAddress(s: string): boolean {
  try { new PublicKey(s); return true; } catch { return false; }
}

function loadSubmissions(): { address: string; ts: string }[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

function saveSubmission(address: string) {
  const existing = loadSubmissions();
  if (existing.find(e => e.address === address)) return false; // already registered
  existing.push({ address, ts: new Date().toISOString() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  return true;
}

// Admin export — triggered by ?export=airdrop in the URL
function exportCsv() {
  const data = loadSubmissions();
  const csv  = ["address,amount,registered_at",
    ...data.map(r => `${r.address},50000000000,${r.ts}`)
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a    = document.createElement("a");
  a.href     = URL.createObjectURL(blob);
  a.download = `hormuz_airdrop_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

export default function AirdropSignup() {
  const [checked, setChecked]   = useState<Record<string, boolean>>({});
  const [wallet, setWallet]     = useState("");
  const [status, setStatus]     = useState<"idle"|"success"|"duplicate"|"error">("idle");
  const [count, setCount]       = useState(0);

  const allDone = TASKS.every(t => checked[t.id]);

  useEffect(() => {
    setCount(loadSubmissions().length);
    // Admin export
    if (window.location.search.includes("export=airdrop")) exportCsv();
  }, []);

  function toggle(id: string) {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidSolanaAddress(wallet.trim())) {
      setStatus("error");
      return;
    }
    const ok = saveSubmission(wallet.trim());
    setStatus(ok ? "success" : "duplicate");
    if (ok) setCount(c => c + 1);
  }

  return (
    <div className="card border border-hormuz-gold/15">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <p className="section-label">Airdrop — 5B HORMUZ</p>
        <span className="font-mono-data text-[10px] text-hormuz-gold/60 border border-hormuz-gold/20 px-2 py-0.5 rounded-sm tracking-widest">
          {ALLOCATION} / wallet
        </span>
      </div>
      <p className="text-[11px] text-white/40 leading-relaxed mb-4">
        Complete the three tasks below, then submit your Solana wallet address.
        Tokens are distributed manually before mainnet launch.
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
            {/* Checkbox */}
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

            {/* Label + link */}
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

      {/* Wallet input */}
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <input
            type="text"
            value={wallet}
            onChange={e => { setWallet(e.target.value); setStatus("idle"); }}
            placeholder="Your Solana wallet address"
            disabled={!allDone || status === "success"}
            className={`flex-1 font-mono-data text-xs bg-hormuz-navy/60 border rounded-md px-3 py-2.5
              placeholder:text-white/20 text-white/80 outline-none transition-all
              ${!allDone ? "opacity-40 cursor-not-allowed border-white/[0.06]" : "border-white/15 focus:border-hormuz-teal/40"}
              ${status === "error" ? "border-red-500/40" : ""}`}
          />
          <button
            type="submit"
            disabled={!allDone || status === "success"}
            className={`shrink-0 px-4 py-2.5 rounded-md text-xs font-semibold tracking-wide transition-all
              ${allDone && status !== "success"
                ? "bg-hormuz-gold text-hormuz-deep hover:bg-hormuz-gold/90"
                : "bg-white/5 text-white/20 cursor-not-allowed"}`}
          >
            Register
          </button>
        </div>

        {/* Status messages */}
        {status === "success" && (
          <p className="mt-2 text-[11px] text-hormuz-teal">
            Registered. You&apos;ll receive {ALLOCATION} before mainnet launch.
          </p>
        )}
        {status === "duplicate" && (
          <p className="mt-2 text-[11px] text-hormuz-gold/70">
            This address is already registered.
          </p>
        )}
        {status === "error" && (
          <p className="mt-2 text-[11px] text-red-400/70">
            Invalid Solana address — check and try again.
          </p>
        )}
        {!allDone && (
          <p className="mt-2 text-[10px] text-white/25 font-mono-data">
            Complete all tasks above to unlock registration.
          </p>
        )}
      </form>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-white/[0.05] flex justify-between items-center">
        <span className="text-[10px] text-white/20 font-mono-data">5B HORMUZ total · {ALLOCATION} per wallet</span>
        <span className="text-[10px] text-white/20 font-mono-data">{count} registered</span>
      </div>
    </div>
  );
}
