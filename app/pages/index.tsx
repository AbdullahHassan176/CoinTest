import Head from "next/head";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import WalletConnect from "../components/WalletConnect";
import StakePanel from "../components/StakePanel";
import DAOPanel from "../components/DAOPanel";
import RugProof from "../components/RugProof";

const AirdropSignup = dynamic(() => import("../components/AirdropSignup"), { ssr: false });
import { fetchChainStats, type ChainStats } from "../utils/hormuz";

type Tab = "stake" | "dao" | "about";

const TOKENOMICS = [
  { label: "Liquidity Pool",   pct: 40, color: "#00B4CC" },
  { label: "Staking Rewards",  pct: 20, color: "#C9A84C" },
  { label: "Marketing",        pct: 20, color: "#a78bfa" },
  { label: "Team (12m vest)",  pct: 15, color: "#60a5fa" },
  { label: "Airdrop",          pct:  5, color: "#f472b6" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("stake");
  const [stats, setStats] = useState<ChainStats | null>(null);
  useWallet();

  useEffect(() => {
    fetchChainStats().then(setStats).catch(() => {});
    // Refresh every 30 s
    const id = setInterval(() => fetchChainStats().then(setStats).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Head>
        <title>HORMUZ — Control the Strait. Hold the Coin.</title>
        <meta
          name="description"
          content="HORMUZ is a community-governed Solana token with staking, burn mechanics and on-chain DAO — themed around the world's most critical oil chokepoint."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen relative z-10">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="border-b border-white/[0.06] sticky top-0 z-50 bg-hormuz-deep/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-5 py-3 flex justify-between items-center">

            <div className="flex items-center gap-4">
              {/* Crosshair mark */}
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-hormuz-gold shrink-0">
                <circle cx="11" cy="11" r="4" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="11" y1="0" x2="11" y2="6"  stroke="currentColor" strokeWidth="1.5"/>
                <line x1="11" y1="16" x2="11" y2="22" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="0"  y1="11" x2="6"  y2="11" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="16" y1="11" x2="22" y2="11" stroke="currentColor" strokeWidth="1.5"/>
              </svg>
              <span className="font-bold tracking-tight text-base">HORMUZ</span>
              <span className="hidden sm:block font-mono-data text-[10px] text-white/25 tracking-widest">
                26°33′N 56°15′E
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden md:flex items-center gap-1.5 font-mono-data text-[10px] text-hormuz-teal/70 border border-hormuz-teal/20 px-2.5 py-1 rounded-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-hormuz-teal animate-pulse" />
                DEVNET
              </span>
              <WalletConnect />
            </div>
          </div>
        </header>

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 pt-14 pb-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">

            {/* Left — display headline */}
            <div className="flex-1">
              <p className="section-label mb-3">Solana · Community Token · On-chain DAO</p>
              <h1 className="font-display-condensed text-[clamp(4rem,12vw,9rem)] text-white leading-none">
                CONTROL<br />
                <span className="text-hormuz-gold">THE STRAIT.</span>
              </h1>
              <p className="mt-5 text-white/55 text-sm leading-relaxed max-w-md">
                ~21 million barrels of oil pass through the Strait of Hormuz every day.
                Now there&apos;s a token. Stake it, govern it, watch it burn.
              </p>
            </div>

            {/* Right — live chain data block */}
            <div className="lg:text-right shrink-0">
              <div className="inline-block border border-white/[0.07] rounded-md bg-hormuz-navy/60 backdrop-blur-sm p-5 min-w-[220px]">
                <div className="flex items-center gap-2 mb-3 lg:justify-end">
                  <span className="section-label">On-chain</span>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${stats ? "bg-hormuz-teal animate-pulse" : "bg-white/20"}`} />
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-left">
                  {[
                    {
                      label: "Circulating",
                      value: stats
                        ? stats.circulatingSupply.toLocaleString("en-US", { maximumFractionDigits: 0 })
                        : "—",
                    },
                    {
                      label: "Burned",
                      value: stats
                        ? stats.totalBurned.toLocaleString("en-US", { maximumFractionDigits: 0 })
                        : "—",
                    },
                    {
                      label: "Staked",
                      value: stats
                        ? stats.totalStaked.toLocaleString("en-US", { maximumFractionDigits: 0 })
                        : "—",
                    },
                    {
                      label: "Proposals",
                      value: stats ? String(stats.proposalCount) : "—",
                    },
                  ].map((d) => (
                    <div key={d.label}>
                      <div className="stat-label">{d.label}</div>
                      <div className={`font-mono-data text-base font-medium transition-colors ${
                        stats ? "text-white" : "text-white/25"
                      }`}>
                        {d.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal stats strip */}
          <div className="mt-8 border-t border-b border-white/[0.06] py-3 flex flex-wrap gap-x-0 gap-y-2">
            {[
              { label: "Program",    value: "5CAXvU...XahV",    href: "https://solscan.io/account/5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv?cluster=devnet" },
              { label: "Mint",       value: "D6i3vd...vLN2",    href: "https://solscan.io/token/D6i3vdtzYWuTxEVBobSYegqHane3u6kzvBYXDTHxvLN2?cluster=devnet" },
              { label: "Network",    value: "Solana Devnet",    href: undefined },
              { label: "Burn / tx",  value: "1%",               href: undefined },
              { label: "Max APY",    value: "40%",              href: undefined },
              { label: "Chokepoint", value: "~20% global oil",  href: undefined },
            ].map((item, i) => (
              <div key={item.label} className="flex items-center">
                {i > 0 && <span className="mx-4 text-white/10 font-mono-data select-none">|</span>}
                <div>
                  <span className="section-label mr-2">{item.label}</span>
                  {item.href ? (
                    <a href={item.href} target="_blank" rel="noreferrer"
                       className="font-mono-data text-xs text-hormuz-teal hover:text-white transition-colors">
                      {item.value}
                    </a>
                  ) : (
                    <span className="font-mono-data text-xs text-white/60">{item.value}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main className="max-w-6xl mx-auto px-5 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Left — tabs */}
            <div className="lg:col-span-2">
              {/* Tab strip */}
              <div className="flex gap-0 border border-white/[0.07] rounded-md overflow-hidden mb-4 bg-hormuz-navy/40">
                {(["stake", "dao", "about"] as Tab[]).map((t, i) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-widest transition-all
                      ${i > 0 ? "border-l border-white/[0.07]" : ""}
                      ${tab === t
                        ? "bg-hormuz-gold text-hormuz-deep"
                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                      }`}
                  >
                    {t === "dao" ? "DAO Gov" : t}
                  </button>
                ))}
              </div>

              {tab === "stake" && <StakePanel />}
              {tab === "dao"   && <DAOPanel />}
              {tab === "about" && (
                <div className="space-y-4">
                  <div className="card-ruled">
                    <p className="section-label mb-3">What is HORMUZ?</p>
                    <p className="text-white/65 text-sm leading-relaxed">
                      The Strait of Hormuz — 33 km at its narrowest — is the single most
                      important maritime chokepoint on Earth. One-fifth of all oil traded
                      globally passes through it. Tensions here move oil markets worldwide.
                    </p>
                    <p className="text-white/65 text-sm leading-relaxed mt-3">
                      HORMUZ is not an investment. It is a community experiment in
                      on-chain governance built on the most relevant geopolitical metaphor
                      of our time — with staking yield, a DAO treasury, and a deflationary
                      burn on every transaction. All on Solana: sub-second finality,
                      near-zero fees.
                    </p>
                  </div>

                  <div className="card">
                    <p className="section-label mb-4">How it works</p>
                    <div className="space-y-4">
                      {[
                        {
                          n: "01",
                          title: "Stake",
                          desc: "Lock tokens for 30, 90, or 180 days. 1% burns at stake time. Earn 10–40% APY from the rewards treasury.",
                        },
                        {
                          n: "02",
                          title: "Govern",
                          desc: "Any staker can create a DAO proposal. Voting power equals your staked balance. Passed proposals can release treasury funds.",
                        },
                        {
                          n: "03",
                          title: "Deflate",
                          desc: "Every stake burns 1% permanently. Fixed supply of 100B. No mint authority — no new tokens can ever be created.",
                        },
                      ].map((item) => (
                        <div key={item.n} className="flex gap-4">
                          <div className="font-mono-data text-2xl font-medium text-hormuz-gold/30 leading-none shrink-0 w-8">
                            {item.n}
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-white">{item.title}</div>
                            <div className="text-xs text-white/45 mt-1 leading-relaxed">{item.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-yellow-500/15 bg-yellow-500/[0.04] rounded-lg px-5 py-4">
                    <p className="section-label mb-2">Risk notice</p>
                    <p className="text-xs text-white/40 leading-relaxed">
                      HORMUZ is a community meme token. It is not an investment and makes no
                      promise of financial returns. Cryptocurrency is highly speculative.
                      You may lose all funds. This is not financial advice. DYOR.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <div className="space-y-4">

              {/* Tokenomics */}
              <div className="card">
                <p className="section-label mb-4">Tokenomics</p>

                {/* Single stacked bar */}
                <div className="flex h-2 rounded-sm overflow-hidden mb-4 gap-px">
                  {TOKENOMICS.map((t) => (
                    <div
                      key={t.label}
                      style={{ width: `${t.pct}%`, backgroundColor: t.color }}
                      title={`${t.label} — ${t.pct}%`}
                    />
                  ))}
                </div>

                <div className="space-y-2.5">
                  {TOKENOMICS.map((item) => (
                    <div key={item.label} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-xs text-white/60">{item.label}</span>
                      </div>
                      <span className="font-mono-data text-xs text-white/40">{item.pct}%</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-white/[0.06]">
                  <div className="flex justify-between items-baseline">
                    <span className="section-label">Total supply</span>
                    <span className="font-mono-data text-sm text-hormuz-gold font-medium">100B</span>
                  </div>
                  <div className="flex justify-between items-baseline mt-1">
                    <span className="section-label">Mint authority</span>
                    <span className="font-mono-data text-xs text-hormuz-teal">Revoked</span>
                  </div>
                </div>
              </div>

              {/* Staking tiers */}
              <div className="card">
                <p className="section-label mb-3">Staking tiers</p>
                <div className="space-y-0 divide-y divide-white/[0.05]">
                  {[
                    { days: "30d",  apy: "10%", heat: "■□□□" },
                    { days: "90d",  apy: "20%", heat: "■■□□" },
                    { days: "180d", apy: "40%", heat: "■■■■" },
                  ].map((tier) => (
                    <div key={tier.days} className="flex justify-between items-center py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="font-mono-data text-xs text-white/30">{tier.heat}</span>
                        <span className="text-xs text-white/60">{tier.days} lock</span>
                      </div>
                      <span className="font-mono-data text-xs text-hormuz-gold font-medium">{tier.apy} APY</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-white/25 font-mono-data mt-3">
                  1% burned at stake entry. No early exit.
                </p>
              </div>

              {/* Airdrop signup */}
              <AirdropSignup />

              {/* Rug-proof */}
              <RugProof />

              {/* Links */}
              <div className="card">
                <p className="section-label mb-3">Verify on-chain</p>
                <div className="space-y-1">
                  {[
                    { label: "Program on Solscan",  href: "https://solscan.io/account/5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv?cluster=devnet" },
                    { label: "Mint on Solscan",     href: "https://solscan.io/token/D6i3vdtzYWuTxEVBobSYegqHane3u6kzvBYXDTHxvLN2?cluster=devnet" },
                    { label: "Raydium Pool",        href: "https://explorer.solana.com/address/A6h82ySkHntYn65RK3VknTDzbGXKQcZHpFReyU4E8W9H?cluster=devnet" },
                    { label: "Streamflow vesting",  href: "https://app.streamflow.finance/devnet/vesting/5Cn6xgN1r9kDA52udrjvGkAPGu4JF77MxJpwK5hz9Dqw" },
                  ].map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between py-1.5 text-xs text-white/40
                                 hover:text-white/80 transition-colors group"
                    >
                      <span>{link.label}</span>
                      <span className="font-mono-data text-white/15 group-hover:text-white/40 transition-colors">↗</span>
                    </a>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </main>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <footer className="border-t border-white/[0.05] py-5">
          <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row justify-between items-center gap-2">
            <span className="font-mono-data text-[10px] text-white/20 tracking-widest">
              HORMUZ · 26°33′N 56°15′E · SOLANA DEVNET
            </span>
            <span className="font-mono-data text-[10px] text-white/20">
              Community token — not financial advice — DYOR
            </span>
          </div>
        </footer>

      </div>
    </>
  );
}
