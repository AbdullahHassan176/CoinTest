import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import dynamic from "next/dynamic";
import WalletConnect from "../components/WalletConnect";
import StakePanel from "../components/StakePanel";
import DAOPanel from "../components/DAOPanel";
import RugProof from "../components/RugProof";
import Phase04Disclosure from "../components/Phase04Disclosure";

const AirdropSignup = dynamic(() => import("../components/AirdropSignup"), { ssr: false });
import { fetchChainStats, type ChainStats } from "../utils/hormuz";
import { TOKEN_SYMBOL } from "../utils/connection";
import OfficialStraitPinCallout from "../components/OfficialStraitPinCallout";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live";

type Tab = "stake" | "dao" | "about";

const MONITOR_FEATURES = [
  { icon: "◉", label: "Live Threat Level",    desc: "Computed from real-time news sentiment across Reuters, BBC, Al Jazeera and military feeds" },
  { icon: "⬡", label: "Shipping Lane Map",    desc: "Animated TSS traffic separation, pipeline bypasses, Iran territorial waters, Cape bypass route" },
  { icon: "◈", label: "Market Signals",       desc: "Auto-derived insights: Brent/WTI spread, tanker stock decoupling, $/barrel Cape premium, route breakeven" },
  { icon: "▦", label: "9 Intelligence Panels",desc: "AIS traffic · Trade flows · Supply routes · Freight rates · Chokepoints · Goods · Country exposure · Signals" },
  { icon: "▸", label: "Live Oil & Freight",   desc: "Brent, WTI, Nat Gas, Heating Oil, VLCC spot rate (computed from FRO 52-week position), war risk premium" },
  { icon: "⊞", label: "Pipeline Alternatives",desc: "Saudi SCPX 4.8M bbl/day, UAE Habshan-Fujairah 1.5M bbl/day, Iraq-Turkey Kirkuk-Ceyhan mapped live" },
];

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
  const [brent, setBrent] = useState<number | null>(null);
  const [threatScore, setThreatScore] = useState<number | null>(null);
  useWallet();

  useEffect(() => {
    fetchChainStats().then(setStats).catch(() => {});
    const id = setInterval(() => fetchChainStats().then(setStats).catch(() => {}), 30_000);

    fetch("/api/monitor/oil")
      .then((r) => r.json())
      .then((d) => {
        const b = d?.brent as unknown;
        let n = NaN;
        if (typeof b === "number") n = b;
        else if (b && typeof b === "object" && "price" in (b as object)) {
          const raw = (b as { price?: unknown }).price;
          n = raw == null || raw === "" ? NaN : Number(raw);
        }
        setBrent(Number.isFinite(n) ? n : null);
      })
      .catch(() => {});
    fetch("/api/monitor/threat")
      .then((r) => r.json())
      .then((d) => {
        const raw = d?.score;
        const n = raw == null || raw === "" ? NaN : Number(raw);
        setThreatScore(Number.isFinite(n) ? n : null);
      })
      .catch(() => {});

    return () => clearInterval(id);
  }, []);

  const threatLabel = threatScore === null ? "—" :
    threatScore >= 80 ? "CRITICAL" :
    threatScore >= 60 ? "HIGH" :
    threatScore >= 40 ? "ELEVATED" :
    threatScore >= 20 ? "MODERATE" : "LOW";

  const threatColor = threatScore === null ? "text-white/30" :
    threatScore >= 80 ? "text-red-400" :
    threatScore >= 60 ? "text-orange-400" :
    threatScore >= 40 ? "text-yellow-400" : "text-emerald-400";

  const PAGE_TITLE = `${TOKEN_SYMBOL} — Strait of Hormuz (community token & live intel hub)`;
  const PAGE_DESC  = "Real-time Strait of Hormuz intelligence: live oil prices, VLCC shipping rates, war risk premiums, pipeline maps, and geopolitical threat analysis. 9 live data panels. Updated continuously.";
  const PAGE_URL   = SITE_URL;
  const OG_IMAGE   = `${SITE_URL}/og-image.png`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        "url": SITE_URL,
        "name": `Strait of Hormuz (${TOKEN_SYMBOL})`,
        "description": PAGE_DESC,
        "potentialAction": {
          "@type": "SearchAction",
          "target": { "@type": "EntryPoint", "urlTemplate": `${SITE_URL}/monitor` },
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        "name": `Strait of Hormuz (${TOKEN_SYMBOL})`,
        "url": SITE_URL,
        "description": "Real-time Strait of Hormuz shipping and geopolitical intelligence platform"
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/monitor#app`,
        "name": `Strait monitor (${TOKEN_SYMBOL} hub)`,
        "url": `${SITE_URL}/monitor`,
        "description": "Live Strait of Hormuz intelligence dashboard with 9 interactive data panels covering oil markets, shipping lanes, VLCC rates, war risk premiums, pipeline alternatives and geopolitical threat analysis.",
        "applicationCategory": "BusinessApplication",
        "operatingSystem": "Web",
        "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
        "featureList": [
          "Live oil price feeds (Brent, WTI, Nat Gas)",
          "Real-time geopolitical threat scoring",
          "VLCC spot rate computation",
          "War risk insurance premium calculation",
          "Interactive Leaflet shipping lane map",
          "Pipeline bypass route analysis",
          "AIS vessel tracking integration",
          "Global chokepoint status monitoring"
        ]
      }
    ]
  };

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESC} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="keywords" content="Strait of Hormuz, Hormuz intelligence, oil chokepoint, VLCC shipping rates, war risk premium, shipping lane monitor, oil supply disruption, Persian Gulf logistics, Hormuz blockade, tanker tracking, Brent crude, shipping intelligence" />

        <link rel="canonical" href={PAGE_URL} />

        <meta property="og:type"        content="website" />
        <meta property="og:url"         content={PAGE_URL} />
        <meta property="og:title"       content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESC} />
        <meta property="og:image"       content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height"content="630" />
        <meta property="og:image:alt"   content={`${TOKEN_SYMBOL} — Strait of Hormuz live intel: shipping, oil, threat level`} />

        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:url"         content={PAGE_URL} />
        <meta name="twitter:title"       content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESC} />
        <meta name="twitter:image"       content={OG_IMAGE} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </Head>

      <div className="min-h-screen relative z-10">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="border-b border-white/[0.06] sticky top-0 z-50 bg-hormuz-deep/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-5 py-3 flex justify-between items-center">

            <div className="flex items-center gap-4">
              {/* Crosshair mark */}
              <div className="flex items-center gap-2">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none" className="text-hormuz-gold shrink-0">
                  <circle cx="11" cy="11" r="4" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="11" y1="0" x2="11" y2="6"  stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="11" y1="16" x2="11" y2="22" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="0"  y1="11" x2="6"  y2="11" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="16" y1="11" x2="22" y2="11" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
                <span className="font-bold tracking-tight text-base">{`$${TOKEN_SYMBOL}`}</span>
                <span className="hidden sm:block font-mono-data text-[10px] text-white/25 tracking-widest">
                  26°33′N 56°15′E
                </span>
              </div>
              <nav className="hidden md:flex items-center gap-1 ml-2">
                <Link href="/monitor" className="px-3 py-1.5 rounded-md text-xs font-medium text-white/40 hover:text-white/80 hover:bg-white/5 transition-all">Monitor</Link>
                <Link href="/markets" className="px-3 py-1.5 rounded-md text-xs font-medium text-white/40 hover:text-white/80 hover:bg-white/5 transition-all">Markets</Link>
              </nav>
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

        <div className="border-b border-hormuz-gold/25 bg-black/35">
          <div className="max-w-6xl mx-auto px-5 py-2.5">
            <OfficialStraitPinCallout id="official-strait-pin" dense />
          </div>
        </div>

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
              <p className="launch-nfa-micro mt-4 max-w-md">
                Not financial advice · community meme/utility token ·{" "}
                <Link href="#phase-04-disclaimer" className="text-white/40 hover:text-hormuz-teal/80 transition-colors underline-offset-2">
                  Phase 0.4 text
                </Link>
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
                      value: stats && Number.isFinite(Number(stats.circulatingSupply))
                        ? Number(stats.circulatingSupply).toLocaleString("en-US", { maximumFractionDigits: 0 })
                        : "—",
                    },
                    {
                      label: "Burned",
                      value: stats && Number.isFinite(Number(stats.totalBurned))
                        ? Number(stats.totalBurned).toLocaleString("en-US", { maximumFractionDigits: 0 })
                        : "—",
                    },
                    {
                      label: "Staked",
                      value: stats && Number.isFinite(Number(stats.totalStaked))
                        ? Number(stats.totalStaked).toLocaleString("en-US", { maximumFractionDigits: 0 })
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

        {/* ── Intelligence Hub showcase ──────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-5 py-10 border-b border-white/[0.06]" aria-labelledby="monitor-heading">
          <div className="flex flex-col lg:flex-row lg:items-start gap-8">

            {/* Left — pitch */}
            <div className="flex-1">
              <p className="section-label mb-2">Live Intelligence</p>
              <h2 id="monitor-heading" className="font-display-condensed text-[clamp(2rem,5vw,3.5rem)] text-white leading-none mb-4">
                STRAIT OF HORMUZ<br />
                <span className="text-hormuz-teal">INTELLIGENCE HUB</span>
              </h2>
              <p className="text-white/55 text-sm leading-relaxed max-w-lg mb-6">
                One-fifth of all oil traded globally transits the Strait every day.
                This dashboard aggregates live market data, geopolitical news feeds and
                shipping analytics into a single real-time operations picture — the way
                a maritime logistics analyst, tanker trader or risk desk would want it.
              </p>

              {/* Live stats strip */}
              <div className="flex flex-wrap gap-5 mb-7">
                <div>
                  <div className="stat-label">Brent Crude</div>
                  <div
                    className={`font-mono-data text-lg font-semibold ${
                      typeof brent === "number" && Number.isFinite(brent) ? "text-white" : "text-white/25"
                    }`}
                  >
                    {typeof brent === "number" && Number.isFinite(brent) ? `$${brent.toFixed(2)}` : "—"}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Threat Level</div>
                  <div className={`font-mono-data text-lg font-semibold ${threatColor}`}>
                    {threatScore !== null ? `${threatLabel} (${threatScore}/100)` : "—"}
                  </div>
                </div>
                <div>
                  <div className="stat-label">Daily Oil Flow</div>
                  <div className="font-mono-data text-lg font-semibold text-white/70">~21M bbl/day</div>
                </div>
              </div>

              <Link
                href="/monitor"
                className="inline-flex items-center gap-2 bg-hormuz-teal text-hormuz-deep font-bold text-sm px-6 py-3 rounded-md hover:brightness-110 transition-all"
                aria-label="Open the live Strait of Hormuz intelligence monitor"
              >
                Open Live Monitor
                <span aria-hidden="true">→</span>
              </Link>
              <span className="ml-4 text-[10px] font-mono-data text-white/25 tracking-widest">9 live panels · keyboard shortcuts · draggable overlays</span>
            </div>

            {/* Right — feature grid */}
            <div className="lg:w-[420px] shrink-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MONITOR_FEATURES.map((f) => (
                  <div key={f.label} className="border border-white/[0.07] rounded-md bg-hormuz-navy/40 p-4 hover:border-hormuz-teal/30 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-hormuz-teal font-mono-data text-base">{f.icon}</span>
                      <span className="text-xs font-semibold text-white/80">{f.label}</span>
                    </div>
                    <p className="text-[10px] text-white/35 leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
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
                    <p className="section-label mb-3">What is {TOKEN_SYMBOL}?</p>
                    <p className="text-white/65 text-sm leading-relaxed">
                      The Strait of Hormuz — 33 km at its narrowest — is the single most
                      important maritime chokepoint on Earth. One-fifth of all oil traded
                      globally passes through it. Tensions here move oil markets worldwide.
                    </p>
                    <p className="text-white/65 text-sm leading-relaxed mt-3">
                      {TOKEN_SYMBOL} is not an investment. It is a community experiment in
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

                  <div id="phase-04-disclaimer" className="border border-yellow-500/15 bg-yellow-500/[0.04] rounded-lg px-5 py-4 scroll-mt-24">
                    <Phase04Disclosure showPhaseLabel className="[&_.section-label]:text-yellow-500/90 [&_p]:text-white/55" />
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
              {`$${TOKEN_SYMBOL}`} · 26°33′N 56°15′E · SOLANA DEVNET
            </span>
            <Link href="#phase-04-disclaimer" className="font-mono-data text-[10px] text-white/35 hover:text-white/55 transition-colors text-center sm:text-right">
              Phase 0.4 disclaimer and positioning (on this page)
            </Link>
          </div>
        </footer>

      </div>
    </>
  );
}
