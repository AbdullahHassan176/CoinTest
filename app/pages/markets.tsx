import Head from "next/head";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import WalletConnect from "../components/WalletConnect";
import MarketCard from "../components/MarketCard";
import MyPositions from "../components/MyPositions";
import idl from "../utils/idl.json";
import {
  fetchAllMarkets,
  fetchMarketConfig,
  createMarket,
  createMarketVault,
  marketStatusLabel,
} from "../utils/hormuz";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Market = { publicKey: any; account: any };
type TabType = "active" | "resolved" | "mine";

function NavBar() {
  return (
    <header className="border-b border-white/[0.06] sticky top-0 z-50 bg-hormuz-deep/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-5 py-3 flex justify-between items-center">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <svg width="20" height="20" viewBox="0 0 22 22" fill="none" className="text-hormuz-gold shrink-0">
              <circle cx="11" cy="11" r="4" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="11" y1="0" x2="11" y2="6"  stroke="currentColor" strokeWidth="1.5"/>
              <line x1="11" y1="16" x2="11" y2="22" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="0"  y1="11" x2="6"  y2="11" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="16" y1="11" x2="22" y2="11" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span className="font-bold tracking-tight text-sm">HORMUZ</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: "Home",    href: "/" },
              { label: "Monitor", href: "/monitor" },
              { label: "Markets", href: "/markets" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-white/40 hover:text-white/80 hover:bg-white/5 transition-all"
              >
                {item.label}
              </Link>
            ))}
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
  );
}

function CreateMarketModal({
  onClose,
  onCreated,
  marketCount,
  program,
  creator,
  initialQuestion = "",
}: {
  onClose: () => void;
  onCreated: () => void;
  marketCount: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program: any;
  creator: import("@solana/web3.js").PublicKey;
  initialQuestion?: string;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [daysUntilResolution, setDaysUntilResolution] = useState("7");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "vault">("form");
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!question.trim() || !daysUntilResolution) return;
    setLoading(true);
    setError("");
    try {
      const days = parseInt(daysUntilResolution, 10);
      const resolutionEnd = Math.floor(Date.now() / 1000) + days * 24 * 3600;
      await createMarket(program, creator, question.trim(), resolutionEnd, marketCount);
      setStep("vault");
    } catch (e) {
      setError(String(e).slice(0, 150));
      setLoading(false);
      return;
    }

    // Immediately create vault in second tx
    try {
      await createMarketVault(program, creator, marketCount);
      onCreated();
      onClose();
    } catch (e) {
      setError(`Market created but vault setup failed: ${String(e).slice(0, 100)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-hormuz-deep/80 backdrop-blur-sm">
      <div className="card w-full max-w-lg border border-white/[0.12]">
        <div className="flex items-center justify-between mb-5">
          <p className="font-semibold text-sm">Create Prediction Market</p>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 text-lg leading-none">✕</button>
        </div>

        {step === "vault" && (
          <div className="mb-4 px-3 py-2 bg-hormuz-teal/10 border border-hormuz-teal/20 rounded-md">
            <p className="text-xs text-hormuz-teal">Market created. Setting up vault (tx 2/2)...</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="section-label block mb-2">Question (max 200 chars)</label>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Will there be a tanker incident in the Strait this month?"
              className="input w-full h-24 resize-none text-sm"
              maxLength={200}
            />
            <p className="font-mono-data text-[9px] text-white/20 mt-1 text-right">{question.length}/200</p>
          </div>

          <div>
            <label className="section-label block mb-2">Days until resolution</label>
            <select
              value={daysUntilResolution}
              onChange={(e) => setDaysUntilResolution(e.target.value)}
              className="input w-full"
            >
              {[3, 7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={String(d)}>{d} days</option>
              ))}
            </select>
          </div>

          <div className="border border-white/[0.06] rounded-md px-4 py-3 bg-white/[0.02]">
            <p className="section-label mb-1">How it works</p>
            <ul className="text-[11px] text-white/40 space-y-1 leading-relaxed">
              <li>• Stakers bet HORMUZ on YES or NO outcomes</li>
              <li>• Parimutuel pool: winners share the entire pool</li>
              <li>• 2% house cut is burned on resolution (deflationary)</li>
              <li>• Creating markets requires an active stake record</li>
            </ul>
          </div>

          {error && (
            <p className="text-[10px] text-hormuz-red/80 font-mono-data break-all">{error}</p>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1" disabled={loading}>Cancel</button>
            <button onClick={handleCreate} disabled={loading || !question.trim()} className="btn-primary flex-1">
              {loading ? (step === "vault" ? "Creating vault..." : "Creating...") : "Create Market"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Suggested question bank ────────────────────────────────────────────────────
// Base bank — always shown; dynamic ones prepended based on live threat level
const BASE_SUGGESTIONS = [
  "Will Iran seize a tanker this month?",
  "Will the Houthis attack a vessel in the Red Sea this week?",
  "Will Brent crude exceed $95 within 30 days?",
  "Will a naval incident occur in the Persian Gulf this week?",
  "Will there be a new Hormuz blockade announcement this month?",
  "Will VLCC spot rates increase by 20%+ in the next 14 days?",
  "Will any G7 nation impose new Iran sanctions this month?",
  "Will LNG flows through Hormuz drop below 15M tonnes this quarter?",
  "Will a Cape of Good Hope rerouting surge occur this month?",
  "Will the UAE-Habshan pipeline capacity be publicly activated?",
];

const THREAT_SUGGESTIONS: Record<string, string[]> = {
  critical: [
    "Will Hormuz close to commercial shipping in the next 7 days?",
    "Will Brent crude spike above $120 this week?",
    "Will a US Navy vessel be involved in a Hormuz incident this month?",
  ],
  elevated: [
    "Will the strait threat level remain ELEVATED for 14+ consecutive days?",
    "Will war risk insurance premiums exceed 1.0% this week?",
    "Will a major oil tanker be boarded or seized this week?",
  ],
  guarded: [
    "Will tensions escalate to ELEVATED within 14 days?",
    "Will Brent crude trade above $85 by month end?",
  ],
  low: [
    "Will geopolitical risk remain LOW through the end of this month?",
    "Will VLCC spot rates fall below $30,000/day this week?",
  ],
};

type ThreatSnap = { label: string; level: number; brent?: number | null };

export default function Markets() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketCount, setMarketCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>("active");
  const [showCreate, setShowCreate] = useState(false);
  const [prefillQuestion, setPrefillQuestion] = useState("");
  const [threat, setThreat] = useState<ThreatSnap | null>(null);

  // Fetch live threat level for suggested questions
  useEffect(() => {
    fetch("/api/monitor/threat")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setThreat({ label: d.label, level: d.level, brent: d.brent }); })
      .catch(() => {});
  }, []);

  // Pre-fill from ?q= query param (e.g. from monitor "Predict this" link)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) { setPrefillQuestion(decodeURIComponent(q)); setShowCreate(true); }
  }, []);

  function openCreateWithQuestion(q: string) {
    setPrefillQuestion(q);
    setShowCreate(true);
  }

  const getProgram = useCallback(() => {
    if (!anchorWallet) return null;
    const provider = new anchor.AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new anchor.Program(idl as anchor.Idl, provider) as any;
  }, [connection, anchorWallet]);

  const loadMarkets = useCallback(async () => {
    const program = getProgram();
    if (!program) { setLoading(false); return; }
    setLoading(true);
    try {
      const [all, config] = await Promise.all([
        fetchAllMarkets(program),
        fetchMarketConfig(program),
      ]);
      setMarkets(all.sort((a: Market, b: Market) => Number(b.account.marketId) - Number(a.account.marketId)));
      setMarketCount(config ? Number(config.marketCount) : 0);
    } catch {
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, [getProgram]);

  useEffect(() => { loadMarkets(); }, [loadMarkets]);

  const activeMarkets   = markets.filter((m) => marketStatusLabel(m.account.status) === "Active");
  const resolvedMarkets = markets.filter((m) => marketStatusLabel(m.account.status) !== "Active");

  const displayMarkets =
    tab === "active"   ? activeMarkets :
    tab === "resolved" ? resolvedMarkets :
    markets; // "mine" filter is handled in MyPositions panel

  return (
    <>
      <Head>
        <title>HORMUZ Markets — On-Chain Strait of Hormuz Prediction Markets</title>
        <meta name="description" content="On-chain parimutuel prediction markets for Strait of Hormuz geopolitical outcomes. Bet HORMUZ tokens on oil supply disruptions, tanker incidents and chokepoint events. Solana-native, 2% burn on resolution." />
        <meta name="keywords" content="Hormuz prediction markets, Solana prediction market, geopolitical betting, oil supply prediction, Strait of Hormuz on-chain, HORMUZ token markets, parimutuel Solana" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        <link rel="canonical" href={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live"}/markets`} />

        <meta property="og:type"        content="website" />
        <meta property="og:url"         content={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live"}/markets`} />
        <meta property="og:title"       content="HORMUZ Markets — On-Chain Prediction Markets for Geopolitical Risk" />
        <meta property="og:description" content="Trade HORMUZ tokens on Strait of Hormuz geopolitical outcomes. Parimutuel, on-chain, Solana-native. 2% burn on every resolution." />
        <meta property="og:image"       content={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live"}/og-image.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height"content="630" />

        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content="HORMUZ Markets — Geopolitical Prediction Markets on Solana" />
        <meta name="twitter:description" content="On-chain prediction markets for Strait of Hormuz events. Solana-native · parimutuel · 2% deflationary burn." />
        <meta name="twitter:image"       content={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live"}/og-image.png`} />

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": "HORMUZ Prediction Markets",
          "url": `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live"}/markets`,
          "description": "On-chain parimutuel prediction markets for Strait of Hormuz geopolitical outcomes, built on Solana.",
          "applicationCategory": "FinanceApplication",
          "operatingSystem": "Web",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
        }) }} />
      </Head>

      {showCreate && anchorWallet && publicKey && (
        <CreateMarketModal
          onClose={() => { setShowCreate(false); setPrefillQuestion(""); }}
          onCreated={loadMarkets}
          marketCount={marketCount}
          program={getProgram()}
          creator={publicKey}
          initialQuestion={prefillQuestion}
        />
      )}

      <div className="min-h-screen relative z-10">
        <NavBar />

        {/* Page header */}
        <div className="max-w-7xl mx-auto px-5 pt-8 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="section-label mb-2">On-chain · Parimutuel · HORMUZ-denominated</p>
              <h1 className="font-display-condensed text-[clamp(2.5rem,8vw,5rem)] text-white leading-none">
                STRAIT <span className="text-hormuz-gold">MARKETS</span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={loadMarkets} className="btn-secondary text-xs py-2">Refresh</button>
              {publicKey && (
                <button onClick={() => setShowCreate(true)} className="btn-primary text-xs py-2">
                  + Create Market
                </button>
              )}
            </div>
          </div>

          {/* Status / roadmap banner */}
          <div className="mt-5 grid sm:grid-cols-3 gap-2">
            {[
              {
                icon: "✓",
                color: "#22c55e",
                title: "Devnet live",
                desc: "Contracts deployed · create and bet on markets today with testnet HORMUZ",
              },
              {
                icon: "⏳",
                color: "#C9A84C",
                title: "Mainnet pending",
                desc: "Awaiting security audit (Sec3 X-ray) · target Q3 2025 mainnet launch",
              },
              {
                icon: "○",
                color: "#a78bfa",
                title: "DAO resolution",
                desc: "Next upgrade: stakers vote on outcome via DAO instead of authority key",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-md px-4 py-3 border"
                style={{ borderColor: `${item.color}22`, background: `${item.color}08` }}
              >
                <span className="font-mono-data text-sm shrink-0 mt-0.5" style={{ color: item.color }}>{item.icon}</span>
                <div>
                  <div className="font-semibold text-xs text-white mb-0.5" style={{ color: item.color }}>{item.title}</div>
                  <div className="text-[11px] text-white/35 leading-relaxed">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <main className="max-w-7xl mx-auto px-5 pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Left — market list */}
            <div className="lg:col-span-2">
              {/* Tabs */}
              <div className="flex gap-0 border border-white/[0.07] rounded-md overflow-hidden mb-4 bg-hormuz-navy/40">
                {([
                  { key: "active",   label: `Active (${activeMarkets.length})`   },
                  { key: "resolved", label: `Past (${resolvedMarkets.length})`   },
                ] as const).map((t, i) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-widest transition-all
                      ${i > 0 ? "border-l border-white/[0.07]" : ""}
                      ${tab === t.key
                        ? "bg-hormuz-gold text-hormuz-deep"
                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Market cards */}
              {loading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="card">
                      <div className="h-4 bg-white/5 rounded-sm mb-3 w-3/4 animate-pulse" />
                      <div className="h-5 bg-white/5 rounded-sm mb-3 animate-pulse" />
                      <div className="h-3 bg-white/5 rounded-sm w-1/2 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : displayMarkets.length === 0 ? (
                <div className="card text-center py-10">
                  <p className="text-white/30 text-sm mb-3">
                    {tab === "active" ? "No active markets yet." : "No past markets."}
                  </p>
                  {tab === "active" && publicKey && (
                    <button onClick={() => setShowCreate(true)} className="btn-primary text-xs">
                      Create the first market
                    </button>
                  )}
                  {tab === "active" && !publicKey && (
                    <p className="text-xs text-white/20">Connect your wallet to create a market.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {displayMarkets.map((m) => (
                    <MarketCard
                      key={String(m.publicKey)}
                      market={m}
                      onRefresh={loadMarkets}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <div className="space-y-4">
              <MyPositions />

              {/* How markets work */}
              <div className="card">
                <p className="section-label mb-3">How markets work</p>
                <div className="space-y-3">
                  {[
                    { n: "01", title: "Bet YES or NO",  desc: "HORMUZ stakers place bets on any active market. One position per wallet per market." },
                    { n: "02", title: "Parimutuel pool", desc: "The entire pool is distributed to winners, proportional to their stake." },
                    { n: "03", title: "2% burn",         desc: "On resolution, 2% of the pool is burned. Deflationary pressure with every market." },
                    { n: "04", title: "On-chain truth",  desc: "Authority resolves markets on-chain. Future upgrade: DAO resolution." },
                  ].map((item) => (
                    <div key={item.n} className="flex gap-3">
                      <div className="font-mono-data text-lg font-medium text-hormuz-gold/30 leading-none shrink-0 w-7">
                        {item.n}
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-white">{item.title}</div>
                        <div className="text-[11px] text-white/40 mt-0.5 leading-relaxed">{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live intelligence → market suggestions */}
              <div className="card-ruled">
                <div className="flex items-center justify-between mb-3">
                  <p className="section-label">Suggested markets</p>
                  {threat && (
                    <span className="font-mono-data text-[8px] px-1.5 py-0.5 rounded-sm"
                      style={{
                        background: threat.level >= 3 ? "#CC293622" : threat.level >= 2 ? "#f9731622" : "#22c55e22",
                        color:      threat.level >= 3 ? "#CC2936"   : threat.level >= 2 ? "#f97316"   : "#22c55e",
                        border:     `1px solid ${threat.level >= 3 ? "#CC293644" : threat.level >= 2 ? "#f9731644" : "#22c55e44"}`,
                      }}
                    >
                      {threat.label} threat
                    </span>
                  )}
                </div>

                {/* Threat-contextual questions first */}
                {threat && (
                  <div className="mb-2.5 space-y-1">
                    {(THREAT_SUGGESTIONS[threat.label.toLowerCase()] ?? []).map((q) => (
                      <button
                        key={q}
                        onClick={() => openCreateWithQuestion(q)}
                        className="w-full text-left group flex items-start gap-2 py-1.5 px-2 rounded-sm hover:bg-white/[0.04] transition-colors"
                      >
                        <span className="text-hormuz-gold/50 text-[10px] mt-0.5 shrink-0">→</span>
                        <span className="text-[11px] text-white/60 group-hover:text-white/85 leading-snug transition-colors">{q}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="border-t border-white/[0.05] pt-2.5 space-y-1">
                  {BASE_SUGGESTIONS.slice(0, 6).map((q) => (
                    <button
                      key={q}
                      onClick={() => openCreateWithQuestion(q)}
                      className="w-full text-left group flex items-start gap-2 py-1.5 px-2 rounded-sm hover:bg-white/[0.04] transition-colors"
                    >
                      <span className="text-white/20 text-[10px] mt-0.5 shrink-0">—</span>
                      <span className="text-[11px] text-white/35 group-hover:text-white/65 leading-snug transition-colors">{q}</span>
                    </button>
                  ))}
                </div>

                {!publicKey && (
                  <p className="font-mono-data text-[9px] text-white/20 mt-3 border-t border-white/[0.05] pt-2.5">
                    Connect wallet to pre-fill and create any question above ↑
                  </p>
                )}
              </div>

              {/* Live monitor link */}
              <Link
                href="/monitor"
                className="block card border border-hormuz-teal/15 hover:border-hormuz-teal/35 transition-colors group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-hormuz-teal animate-pulse" />
                  <p className="section-label">Live Intelligence</p>
                </div>
                <p className="text-[11px] text-white/40 leading-relaxed mb-2">
                  Use the Strait Monitor to spot emerging situations before creating a market.
                  {threat?.brent ? ` Brent is currently at $${Number(threat.brent).toFixed(2)}.` : ""}
                </p>
                <span className="font-mono-data text-[10px] text-hormuz-teal group-hover:text-hormuz-teal/80 transition-colors">
                  Open monitor →
                </span>
              </Link>

              <div className="border border-yellow-500/15 bg-yellow-500/[0.04] rounded-lg px-4 py-3">
                <p className="section-label mb-1">Risk notice</p>
                <p className="text-[10px] text-white/30 leading-relaxed">
                  Prediction markets are speculative. You may lose your entire position.
                  This is devnet — not real funds. DYOR.
                </p>
              </div>
            </div>
          </div>
        </main>

        <footer className="border-t border-white/[0.05] py-5">
          <div className="max-w-7xl mx-auto px-5 flex flex-col sm:flex-row justify-between items-center gap-2">
            <span className="font-mono-data text-[10px] text-white/20 tracking-widest">
              HORMUZ MARKETS · SOLANA DEVNET · PARIMUTUEL
            </span>
            <span className="font-mono-data text-[10px] text-white/20">
              Community markets — not financial advice — DYOR
            </span>
          </div>
        </footer>
      </div>
    </>
  );
}
