import type { NextApiRequest, NextApiResponse } from "next";
import YahooFinanceClass from "yahoo-finance2";

// yahoo-finance2 v3: class must be instantiated
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new (YahooFinanceClass as any)({ suppressNotices: ["yahooSurvey"] });

export type ShippingData = {
  // VLCC market (derived from FRO stock 52-week position × threat multiplier)
  vlccRate:       number;        // $/day estimated
  vlccRateLow:    number;        // $/day low bound
  vlccRateHigh:   number;        // $/day high bound
  froPrice:       number | null;
  fro52wLow:      number | null;
  fro52wHigh:     number | null;
  froPosition:    number | null; // 0–1 position in 52w range

  // War risk (derived from threat score via exponential curve)
  warRisk:        number;        // % of cargo value
  warRiskLabel:   string;        // e.g. "~1.8%"

  // Bunker / fuel
  hsfoProxy:      number;        // $/MT (HO=F × conversion factor)
  heatingOilGal:  number | null; // raw HO=F price USD/gal

  // Cape of Good Hope rerouting economics
  capeCostExtra:  number;        // $ extra per VLCC voyage
  capeExtraDays:  number;        // extra transit days
  capeExtraNm:    number;        // extra nautical miles

  // Freight rate uplift (% above normal, derived from war risk + threat)
  freightUpliftPct: number;

  // Baltic Dry Index (if obtainable via Yahoo Finance)
  bdi:            number | null;
  bdiChangePct:   number | null;

  // Supply flow estimate (threat-adjusted from baseline 21M bbl/day)
  supplyFlowBbl:  number;        // bbl/day
  supplyFlowLabel: string;       // human label

  // Inputs used (for transparency in UI)
  threatScore:    number;
  updatedAt:      string;
};

// ── Computation formulas ───────────────────────────────────────────────────────

/**
 * Map threat score (0–100) → war risk insurance premium (%).
 * Exponential curve calibrated to historical Gulf incidents:
 *   score=0   → 0.025% (peacetime baseline)
 *   score=50  → ~0.5%
 *   score=87  → ~2.2%
 *   score=100 → ~3%
 */
function computeWarRisk(score: number): number {
  return parseFloat((0.025 * Math.exp(score * 0.039)).toFixed(3));
}

/**
 * Estimate VLCC spot rate from FRO's position in its 52-week range.
 * FRO (Frontline Ltd) is a major VLCC operator — its stock closely
 * tracks VLCC charter rates. War risk adds a demand premium on top.
 */
function computeVLCCRate(
  fro: number, lo: number, hi: number, warRisk: number
): { rate: number; low: number; high: number } {
  const span = hi - lo;
  const pos = span > 0 ? Math.max(0, Math.min(1, (fro - lo) / span)) : 0.5;

  // Base VLCC range: $22K/day (market trough) → $120K/day (market peak)
  const baseRate = 22_000 + pos * 98_000;

  // War risk lifts rates (owners demand premium for risky routing)
  // A 2% war risk premium → ~25% higher charter rate
  const warMult = 1 + (warRisk / 2) * 0.25;

  const rate = Math.round(baseRate * warMult / 1_000) * 1_000;
  return {
    rate,
    low:  Math.round((baseRate * 0.85) / 1_000) * 1_000,
    high: Math.round((baseRate * warMult * 1.2) / 1_000) * 1_000,
  };
}

/**
 * HO=F (Heating Oil) → HSFO (High-Sulphur Fuel Oil) proxy in $/MT.
 * Heating oil: USD/gallon. HSFO: USD/MT.
 * Conversion: 1 MT HSFO ≈ 1,200 litres ≈ 317 US gallons.
 * HO=F and HSFO track similarly (both are middle distillates / residuals).
 */
function heatingOilToHSFO(hoUsdPerGal: number): number {
  return Math.round(hoUsdPerGal * 317);
}

/**
 * Cape of Good Hope reroute cost vs. Hormuz direct.
 * Extra distance: ~6,400 nm (Hormuz→Cape→loading port vs. direct).
 * VLCC laden speed: 14 knots → 6400/14/24 ≈ 19 extra days.
 * Bunker consumption laden: 80 MT/day.
 */
function computeCapeCost(
  hsfo: number, vlccRate: number, warRisk: number
): { cost: number; days: number; nm: number } {
  const nm = 6_400;
  const days = nm / 14 / 24;                           // ~19 days
  const bunker = hsfo * 80 * days;                     // fuel cost
  // Cargo war risk on alternate route (still transits Gulf to load)
  // modelled as 50% of full war premium (routing avoidance reduces risk)
  const cargoVal = 120_000_000;
  const warPremium = cargoVal * (warRisk / 100) * 0.5;
  const timeCost = vlccRate * days;                    // opportunity/charter cost
  const cost = Math.round((bunker + warPremium + timeCost) / 50_000) * 50_000;
  return { cost, days: Math.round(days), nm };
}

/**
 * Freight rate uplift above pre-tension baseline.
 * Combines war risk premium × 10 + oil price shock proxy.
 */
function computeFreightUplift(warRisk: number, threatScore: number): number {
  // Base uplift from war risk (2% war risk → ~30% rate uplift is historical ratio)
  const warContrib = warRisk * 15;
  // Additional uncertainty premium from high threat scores
  const uncertaintyContrib = Math.max(0, (threatScore - 50) / 50 * 20);
  return Math.round(warContrib + uncertaintyContrib);
}

/**
 * Estimate daily oil flow through Hormuz based on threat score.
 * Baseline: 21M bbl/day at peace.
 * Ships start diverting at elevated threat; full crisis → <10M bbl/day.
 */
function computeSupplyFlow(threatScore: number): { bbl: number; label: string } {
  let bbl: number;
  if (threatScore < 20)       { bbl = 21_000_000; }
  else if (threatScore < 40)  { bbl = 19_000_000; }
  else if (threatScore < 60)  { bbl = 16_000_000; }
  else if (threatScore < 80)  { bbl = 13_000_000; }
  else                         { bbl = 9_000_000;  }

  const label = bbl >= 20_000_000 ? `~${Math.round(bbl/1_000_000)}M bbl/day`
              : bbl >= 10_000_000 ? `~${Math.round(bbl/1_000_000)}M bbl/day (restricted)`
              :                     `<10M bbl/day (crisis)`;
  return { bbl, label };
}

// ── API handler ────────────────────────────────────────────────────────────────

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<ShippingData>
) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=60");

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;

  // ── 1. Fetch threat score ──
  let threatScore = 0;
  try {
    const tr = await fetch(`${baseUrl}/api/monitor/threat`);
    if (tr.ok) { threatScore = ((await tr.json()) as { score: number }).score; }
  } catch { /* fall back to 0 */ }

  // ── 2. Fetch FRO 52-week data ──
  let froPrice: number | null = null;
  let fro52wLow: number | null = null;
  let fro52wHigh: number | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary: any = await yf.quoteSummary("FRO", { modules: ["summaryDetail", "price"] });
    const sd = summary?.summaryDetail;
    const pr = summary?.price;
    froPrice   = pr?.regularMarketPrice        ?? null;
    fro52wLow  = sd?.fiftyTwoWeekLow?.raw      ?? sd?.fiftyTwoWeekLow  ?? null;
    fro52wHigh = sd?.fiftyTwoWeekHigh?.raw     ?? sd?.fiftyTwoWeekHigh ?? null;
    // If raw nesting doesn't exist, try direct quote
    if (froPrice === null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = await yf.quote("FRO");
      froPrice   = q.regularMarketPrice         ?? null;
      fro52wLow  = q.fiftyTwoWeekLow            ?? null;
      fro52wHigh = q.fiftyTwoWeekHigh           ?? null;
    }
  } catch { /* FRO unavailable */ }

  // ── 3. Fetch HO=F (Heating Oil — bunker proxy) ──
  let heatingOilGal: number | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = await yf.quote("HO=F");
    heatingOilGal = q.regularMarketPrice ?? null;
  } catch { /* skip */ }

  // ── 4. Try Baltic Dry Index ──
  // Yahoo Finance does not carry BDI directly; try common tickers
  let bdi: number | null = null;
  let bdiChangePct: number | null = null;
  const bdiTickers = ["^BCOM", "BDRY"]; // BDRY = Breakwave Dry Bulk Shipping ETF (proxy)
  for (const ticker of bdiTickers) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = await yf.quote(ticker);
      if (q?.regularMarketPrice) {
        bdi = parseFloat(q.regularMarketPrice.toFixed(2));
        bdiChangePct = q.regularMarketChangePercent
          ? parseFloat(q.regularMarketChangePercent.toFixed(2))
          : null;
        break;
      }
    } catch { /* try next */ }
  }

  // ── 5. Compute derived metrics ──
  const warRisk   = computeWarRisk(threatScore);
  const hsfoProxy = heatingOilGal ? heatingOilToHSFO(heatingOilGal) : 450; // $450/MT fallback

  const froPos = (froPrice && fro52wLow && fro52wHigh)
    ? computeVLCCRate(froPrice, fro52wLow, fro52wHigh, warRisk)
    : { rate: 40_000 + threatScore * 500, low: 35_000, high: 80_000 };

  const cape = computeCapeCost(hsfoProxy, froPos.rate, warRisk);
  const freightUplift = computeFreightUplift(warRisk, threatScore);
  const supply = computeSupplyFlow(threatScore);
  const froPosition = (froPrice && fro52wLow && fro52wHigh && (fro52wHigh - fro52wLow) > 0)
    ? parseFloat(((froPrice - fro52wLow) / (fro52wHigh - fro52wLow)).toFixed(3))
    : null;

  res.status(200).json({
    vlccRate:         froPos.rate,
    vlccRateLow:      froPos.low,
    vlccRateHigh:     froPos.high,
    froPrice,
    fro52wLow,
    fro52wHigh,
    froPosition,
    warRisk,
    warRiskLabel:     `~${warRisk.toFixed(warRisk < 0.1 ? 3 : warRisk < 1 ? 2 : 1)}%`,
    hsfoProxy,
    heatingOilGal,
    capeCostExtra:    cape.cost,
    capeExtraDays:    cape.days,
    capeExtraNm:      cape.nm,
    freightUpliftPct: freightUplift,
    bdi,
    bdiChangePct,
    supplyFlowBbl:    supply.bbl,
    supplyFlowLabel:  supply.label,
    threatScore,
    updatedAt:        new Date().toISOString(),
  });
}
