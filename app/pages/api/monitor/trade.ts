/**
 * /api/monitor/trade — Global trade flow data through the Strait of Hormuz.
 *
 * Data hierarchy:
 *  1. EIA Open Data API (free key: https://www.eia.gov/opendata/)
 *     - Fetches latest monthly petroleum trade data if EIA_API_KEY is set.
 *  2. Static baseline from EIA/OPEC/IEA annual reports (sourced & dated).
 *
 * Either way, all data is annotated with source and last-update date so the
 * frontend can display attribution instead of appearing live when it isn't.
 */

import type { NextApiRequest, NextApiResponse } from "next";

export type TradeExporter = {
  country: string;
  rank: number;
  crude: string;       // human label e.g. "~7.0M bbl/day"
  crudeMbbl: number;   // machine value in thousands bbl/day
  share: string;       // % of Hormuz crude
};

export type TradeImporter = {
  country: string;
  rank: number;
  hormuzPct: number;   // % of their crude that comes through Hormuz
  volumeMbbl: number;  // thousands bbl/day
  label: string;
};

export type TradeData = {
  // Energy volumes
  crudeMbbl:         number;   // thousand bbl/day through Hormuz
  crudeGlobalPct:    number;   // % of global seaborne crude
  lngMtYear:         number;   // million tonnes/year LNG
  lngGlobalPct:      number;   // % of global LNG trade
  refinedMbbl:       number;   // thousand bbl/day refined products
  condensatesMbbl:   number;

  // Non-energy cargo (annual $B)
  petrochemBn:       number;
  containerBn:       number;
  steelAlumBn:       number;
  machineryBn:       number;

  // Participants
  exporters:  TradeExporter[];
  importers:  TradeImporter[];

  // Data provenance
  source:      string;   // "EIA API" or "EIA STEO / OPEC MMR"
  dataMonth:   string;   // "2025-12" or similar
  liveData:    boolean;  // true if fetched from EIA API this request
  updatedAt:   string;
};

// ── Static baseline (EIA STEO Dec-2024, OPEC MMR Jan-2025, IEA OMR Jan-2025) ─

const STATIC_TRADE: Omit<TradeData, "source" | "dataMonth" | "liveData" | "updatedAt"> = {
  crudeMbbl:        17_500,
  crudeGlobalPct:   30,
  lngMtYear:        100,
  lngGlobalPct:     22,
  refinedMbbl:      3_500,
  condensatesMbbl:  2_000,

  petrochemBn:  180,
  containerBn:  200,
  steelAlumBn:   40,
  machineryBn:   30,

  exporters: [
    { country: "Saudi Arabia", rank: 1, crude: "~7.0M bbl/day", crudeMbbl: 7_000, share: "~40%" },
    { country: "UAE",          rank: 2, crude: "~3.5M bbl/day", crudeMbbl: 3_500, share: "~20%" },
    { country: "Iraq",         rank: 3, crude: "~3.2M bbl/day", crudeMbbl: 3_200, share: "~18%" },
    { country: "Kuwait",       rank: 4, crude: "~2.2M bbl/day", crudeMbbl: 2_200, share: "~13%" },
    { country: "Qatar (LNG)",  rank: 5, crude: "~0.6M bbl/day", crudeMbbl:   600, share: "Dominant LNG" },
    { country: "Iran (sanctioned)", rank: 6, crude: "~1.3M bbl/day est.", crudeMbbl: 1_300, share: "~7%" },
  ],
  importers: [
    { country: "China",       rank: 1, hormuzPct: 38, volumeMbbl: 5_300, label: "Largest volume importer" },
    { country: "India",       rank: 2, hormuzPct: 58, volumeMbbl: 2_200, label: "Growing exposure" },
    { country: "Japan",       rank: 3, hormuzPct: 88, volumeMbbl: 3_400, label: "Near-total dependency" },
    { country: "South Korea", rank: 4, hormuzPct: 72, volumeMbbl: 2_800, label: "Major refining hub" },
    { country: "Singapore",   rank: 5, hormuzPct: 55, volumeMbbl: 1_100, label: "Refining & re-export" },
    { country: "Taiwan",      rank: 6, hormuzPct: 76, volumeMbbl:   950, label: "Highly exposed" },
    { country: "Europe",      rank: 7, hormuzPct: 10, volumeMbbl: 1_500, label: "Diversified supply" },
    { country: "USA",         rank: 8, hormuzPct:  2, volumeMbbl:   100, label: "Mostly strategic interest" },
  ],
};

// ── EIA API fetch (optional, requires EIA_API_KEY) ────────────────────────────

async function fetchEIAData(): Promise<Partial<TradeData> | null> {
  const key = process.env.EIA_API_KEY;
  if (!key) return null;

  try {
    // EIA STEO: world petroleum and other liquids supply — Hormuz transit isn't
    // a direct EIA series, but we can proxy from OPEC production + Persian Gulf exports.
    // Series: "STEO.PAPR_OPEC.M" — OPEC liquid fuels production (Mb/d)
    const url = `https://api.eia.gov/v2/steo/data/?api_key=${key}&frequency=monthly&data[0]=value&facets[seriesId][]=PAPR_OPEC&sort[0][column]=period&sort[0][direction]=desc&length=3`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;

    const json = await r.json();
    const rows: Array<{ period: string; value: number }> = json?.response?.data ?? [];
    if (rows.length === 0) return null;

    // Latest monthly OPEC production in Mb/d
    const latest = rows[0];
    // Hormuz transit ≈ 80% of OPEC production (rough proxy)
    const hormuzCrudeMbbl = Math.round(latest.value * 0.8 * 1000); // convert to kbbl/d

    return {
      crudeMbbl: hormuzCrudeMbbl,
      source: "EIA STEO API",
      dataMonth: latest.period,
      liveData: true,
    };
  } catch {
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<TradeData>
) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");

  const live = await fetchEIAData();

  const data: TradeData = {
    ...STATIC_TRADE,
    ...(live ?? {}),
    source:    live?.source    ?? "EIA STEO / OPEC MMR / IEA OMR",
    dataMonth: live?.dataMonth ?? "2025-01",
    liveData:  live?.liveData  ?? false,
    updatedAt: new Date().toISOString(),
  };

  res.status(200).json(data);
}
