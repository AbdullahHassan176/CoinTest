/**
 * User-defined vessel / shipment profile for tailoring the Strait Monitor dashboard.
 * Persisted in localStorage; all suggestions are informational (no routing advice).
 */

import type { LayerConfig } from "../components/MonitorMap";
import { normalizeMmsi } from "./mmsiNormalize";

export { normalizeMmsi } from "./mmsiNormalize";

export type TradeRegion =
  | "persian_gulf"
  | "red_sea"
  | "med_europe"
  | "east_africa"
  | "indian_ocean_asia"
  | "far_east"
  | "americas"
  | "other";

export type VesselCategory =
  | "vlcc_suezmax"
  | "product_astmr"
  | "lng_carrier"
  | "capesize_bulker"
  | "panamax_handysize"
  | "container_feeder"
  | "container_ulcv"
  | "general_cargo"
  | "roro"
  | "other";

export type CargoFamily =
  | "crude_condensate"
  | "refined_products"
  | "lng_lpg"
  | "dry_bulk"
  | "containers"
  | "breakbulk"
  | "project"
  | "other";

export type PassagePlan =
  | "via_hormuz"
  | "via_suez_red_sea"
  | "cape_goodhope"
  | "pipe_to_red_sea"
  | "not_sure";

export type EtaWindow = "under_7d" | "1_4_weeks" | "over_month" | "unknown";

export type VoyageProfile = {
  configured: boolean;
  /** Display / AIS-style name; optional. */
  vesselName: string;
  /** 9-digit MMSI — highlighted on map when present in Hormuz AIS snapshot. */
  mmsi: string;
  vesselCategory: VesselCategory;
  cargoFamily: CargoFamily;
  /** Free text: e.g. Fujairah, Jebel Ali, Rotterdam. */
  originPort: string;
  destinationPort: string;
  origin: TradeRegion;
  destination: TradeRegion;
  passagePlan: PassagePlan;
  etaWindow: EtaWindow;
  notes: string;
};

export const VOYAGE_STORAGE_KEY = "hormuz_voyage_profile";

export const EMPTY_VOYAGE_PROFILE: VoyageProfile = {
  configured: false,
  vesselName: "",
  mmsi: "",
  vesselCategory: "other",
  cargoFamily: "other",
  originPort: "",
  destinationPort: "",
  origin: "other",
  destination: "other",
  passagePlan: "not_sure",
  etaWindow: "unknown",
  notes: "",
};

/** Panel ids matching monitor.tsx OverlayId (kept as strings to avoid circular imports). */
export type SuggestedPanelId =
  | "ais"
  | "trade"
  | "routes"
  | "rates"
  | "zones"
  | "goods"
  | "risk"
  | "signals"
  | "news"
  | "timeline";

export type VoyageDashboardHints = {
  headline: string;
  checklist: { title: string; detail: string }[];
  suggestedPanels: SuggestedPanelId[];
  layerPatch: Partial<LayerConfig>;
  mapFocus: { lat: number; lon: number; zoom: number } | null;
  /** Prefills the live intel feed search (user can edit). */
  intelSearch: string;
};

export const LABEL_PASSAGE: Record<PassagePlan, string> = {
  via_hormuz: "Via Strait of Hormuz (maritime)",
  via_suez_red_sea: "Via Red Sea / Suez",
  cape_goodhope: "Around Cape of Good Hope",
  pipe_to_red_sea: "Land / pipeline toward Red Sea",
  not_sure: "Not sure — still routing",
};

export const LABEL_ETA: Record<EtaWindow, string> = {
  under_7d: "Within 7 days",
  "1_4_weeks": "1–4 weeks",
  over_month: "Over a month",
  unknown: "Unknown",
};

export const LABEL_REGION: Record<TradeRegion, string> = {
  persian_gulf: "Persian Gulf / AG",
  red_sea: "Red Sea",
  med_europe: "Med / Europe",
  east_africa: "East Africa",
  indian_ocean_asia: "Indian Ocean / South Asia",
  far_east: "Far East",
  americas: "Americas",
  other: "Other",
};

export const LABEL_VESSEL: Record<VesselCategory, string> = {
  vlcc_suezmax: "Tanker (VLCC / Suezmax)",
  product_astmr: "Product / chemical tanker",
  lng_carrier: "LNG / LPG",
  capesize_bulker: "Dry bulk (Capesize+)",
  panamax_handysize: "Dry bulk (Panamax / handysize)",
  container_feeder: "Container (feeder)",
  container_ulcv: "Container (deep-sea / ULCV)",
  general_cargo: "General cargo",
  roro: "Ro-Ro",
  other: "Other / mixed",
};

export const LABEL_CARGO: Record<CargoFamily, string> = {
  crude_condensate: "Crude / condensate",
  refined_products: "Refined products",
  lng_lpg: "LNG / LPG",
  dry_bulk: "Dry bulk",
  containers: "Containers",
  breakbulk: "Breakbulk",
  project: "Project / heavy lift",
  other: "Other",
};

export function voyageProfileSummary(p: VoyageProfile): string {
  const v = LABEL_VESSEL[p.vesselCategory];
  const c = LABEL_CARGO[p.cargoFamily];
  const oR = LABEL_REGION[p.origin];
  const dR = LABEL_REGION[p.destination];
  const op = p.originPort.trim();
  const dp = p.destinationPort.trim();
  const route =
    op && dp ? `${op} → ${dp}` : op || dp ? `${op || oR} → ${dp || dR}` : `${oR} → ${dR}`;
  const who = p.vesselName.trim() ? `${p.vesselName.trim()} · ` : "";
  return `${who}${v} · ${c} · ${route}`;
}

function portTextSuggestsHormuzCorridor(p: VoyageProfile): boolean {
  const blob = `${p.originPort} ${p.destinationPort}`.toLowerCase();
  if (!blob.trim()) return false;
  const kws = [
    "hormuz",
    "fujairah",
    "jebel",
    "dubai",
    "abqaiq",
    "ras tanura",
    "basrah",
    "basra",
    "kuwait",
    "ahmadi",
    "bandar",
    "kharg",
    "fakkan",
    "muscat",
    "sohar",
    "duqm",
    "qatar",
    "bahrain",
    "minaa zayed",
    "mina zayed",
    "umm qasr",
  ];
  return kws.some((k) => blob.includes(k));
}

function touchesHormuzWaterway(p: VoyageProfile): boolean {
  if (p.passagePlan === "via_hormuz") return true;
  if (portTextSuggestsHormuzCorridor(p)) return true;
  if (p.origin === "persian_gulf" || p.destination === "persian_gulf") return true;
  if (
    p.passagePlan === "not_sure" &&
    (p.destination === "indian_ocean_asia" ||
      p.destination === "far_east" ||
      p.origin === "indian_ocean_asia")
  ) {
    return true;
  }
  return false;
}

function isEnergyCargo(p: VoyageProfile): boolean {
  return (
    p.cargoFamily === "crude_condensate" ||
    p.cargoFamily === "refined_products" ||
    p.cargoFamily === "lng_lpg" ||
    p.vesselCategory === "vlcc_suezmax" ||
    p.vesselCategory === "product_astmr" ||
    p.vesselCategory === "lng_carrier"
  );
}

function isContainerTrade(p: VoyageProfile): boolean {
  return p.cargoFamily === "containers" || p.vesselCategory === "container_feeder" || p.vesselCategory === "container_ulcv";
}

function isDryBulk(p: VoyageProfile): boolean {
  return p.cargoFamily === "dry_bulk" || p.vesselCategory === "capesize_bulker" || p.vesselCategory === "panamax_handysize";
}

/**
 * Derives dashboard tailoring hints from a saved profile. Safe to call with unconfigured profile (returns generic hints).
 */
export function deriveVoyageDashboard(p: VoyageProfile): VoyageDashboardHints {
  const hormuz = touchesHormuzWaterway(p);
  const energy = isEnergyCargo(p);
  const boxes = isContainerTrade(p);
  const bulk = isDryBulk(p);

  const headline = p.configured ? voyageProfileSummary(p) : "Configure your route to tailor this dashboard";

  const checklist: { title: string; detail: string }[] = [];

  if (hormuz) {
    checklist.push({
      title: "Strait of Hormuz exposure",
      detail:
        "Watch the live threat band, AIS density in the TSS, and Iran 12 nm overlay if your passage uses Gulf waters. Cross-check war-risk and insurance context in Freight & Rates + Country Exposure.",
    });
  }

  if (p.passagePlan === "via_suez_red_sea" || p.origin === "red_sea" || p.destination === "red_sea") {
    checklist.push({
      title: "Red Sea / Suez corridor",
      detail:
        "Review Suez and Bab el-Mandeb-related risk in Trade Routes + Chokepoints. Compare extra days vs other passages in Supply Routes.",
    });
  }

  if (p.passagePlan === "cape_goodhope") {
    checklist.push({
      title: "Cape of Good Hope routing",
      detail:
        "Enable the Cape bypass layer and compare bunker/day delta vs Suez/Hormuz exposure in Supply Routes and Market Signals.",
    });
  }

  if (p.passagePlan === "pipe_to_red_sea") {
    checklist.push({
      title: "Land bridge / pipeline legs",
      detail:
        "SCPX and UAE Fujairah bypass options appear in Supply Routes when relevant; verify operational news against your cargo chain.",
    });
  }

  if (energy && hormuz) {
    checklist.push({
      title: "Energy freight & spreads",
      detail:
        "Track Brent/WTI, HSFO proxy, and tanker proxies in Freight & Rates; relate to logistics estimates in Supply Chain.",
    });
  }

  if (boxes) {
    checklist.push({
      title: "Box trade & global chokepoints",
      detail:
        "Trade Flows + world chokepoint layers help context for schedules. Cross-read intel feed for sanctions and canal congestion.",
    });
  }

  if (bulk) {
    checklist.push({
      title: "Dry bulk economics",
      detail:
        "Freight proxies and commodity-linked signals in Market Signals + Goods Impacted support voyage P&L context (not a fixture).",
    });
  }

  if (p.etaWindow === "under_7d") {
    checklist.push({
      title: "Near-term window",
      detail:
        "Prioritize live AIS, threat band changes (Timeline), and CRITICAL/WARNING headlines in the intel feed.",
    });
  }

  const mmsiNorm = normalizeMmsi(p.mmsi);
  if (mmsiNorm) {
    checklist.push({
      title: "AIS watch (your MMSI)",
      detail:
        `We highlight MMSI ${mmsiNorm} on the map when it appears in the current Hormuz bounding-box snapshot. If absent, you may be outside the box, AIS-off, or not received by terrestrial AIS — see AIS panel for coverage notes.`,
    });
  }

  const op = p.originPort.trim();
  const dp = p.destinationPort.trim();
  if (op || dp) {
    checklist.push({
      title: "Your stated ports",
      detail:
        "Port names here are for organizing your dashboard and intel search only — not berth availability, pilot booking, or port-state verification.",
    });
  }

  if (checklist.length === 0) {
    checklist.push({
      title: "General monitoring",
      detail:
        "Use Impact index and Trade Routes for baseline posture; enable map layers that match your geography, then refine with My route settings.",
    });
  }

  const suggestedPanels = new Set<SuggestedPanelId>();
  if (normalizeMmsi(p.mmsi)) suggestedPanels.add("ais");
  if (hormuz || p.passagePlan === "not_sure") suggestedPanels.add("ais").add("zones").add("routes");
  if (energy) suggestedPanels.add("rates").add("signals").add("goods");
  if (boxes) suggestedPanels.add("trade").add("risk").add("news");
  if (bulk) suggestedPanels.add("goods").add("signals").add("rates");
  if (p.passagePlan === "cape_goodhope") suggestedPanels.add("routes").add("signals");
  suggestedPanels.add("news").add("timeline");

  const layerPatch: Partial<LayerConfig> = {};
  if (hormuz) {
    layerPatch.lanes = true;
    layerPatch.iranBorder = true;
    layerPatch.ports = true;
    layerPatch.newsMarkers = true;
  }
  if (p.passagePlan === "via_suez_red_sea") {
    layerPatch.altRoutes = true;
    layerPatch.chokepoints = true;
  }
  if (p.passagePlan === "cape_goodhope") {
    layerPatch.capeRoute = true;
    layerPatch.chokepoints = true;
  }
  if (p.passagePlan === "pipe_to_red_sea" || energy) {
    layerPatch.pipelines = true;
  }
  if (boxes || bulk) {
    layerPatch.chokepoints = true;
    layerPatch.canalRoutes = true;
  }

  let mapFocus: { lat: number; lon: number; zoom: number } | null = null;
  if (p.passagePlan === "via_hormuz" || (hormuz && p.passagePlan !== "cape_goodhope")) {
    mapFocus = { lat: 26.56, lon: 56.15, zoom: 9 };
  } else if (p.passagePlan === "via_suez_red_sea") {
    mapFocus = { lat: 20.0, lon: 38.0, zoom: 6 };
  } else if (p.passagePlan === "cape_goodhope") {
    mapFocus = { lat: -34.4, lon: 18.5, zoom: 6 };
  } else if (p.passagePlan === "pipe_to_red_sea") {
    mapFocus = { lat: 24.5, lon: 44.0, zoom: 6 };
  }

  const intelParts: string[] = [];
  if (hormuz) intelParts.push("Hormuz", "tanker", "sanctions");
  if (energy) intelParts.push("VLCC", "Brent", "insurance");
  if (boxes) intelParts.push("container", "Suez", "Malacca");
  if (bulk) intelParts.push("dry bulk", "freight");
  if (p.passagePlan === "cape_goodhope") intelParts.push("Cape Good Hope", "bunker");

  for (const blob of [p.originPort, p.destinationPort, p.vesselName]) {
    if (!blob.trim()) continue;
    for (const w of blob.split(/[\s,/]+/)) {
      const t = w.trim();
      if (t.length >= 3 && t.length <= 28) intelParts.push(t);
    }
  }

  const intelSearch =
    intelParts.length > 0 ? [...new Set(intelParts)].slice(0, 14).join(" ") : "Strait Hormuz shipping";

  return {
    headline,
    checklist,
    suggestedPanels: [...suggestedPanels],
    layerPatch,
    mapFocus,
    intelSearch,
  };
}

export function loadVoyageProfile(): VoyageProfile {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(VOYAGE_STORAGE_KEY) : null;
    if (!raw) return { ...EMPTY_VOYAGE_PROFILE };
    const o = JSON.parse(raw) as Partial<VoyageProfile> & { vesselLabel?: string };
    const { vesselLabel: _legacy, ...rest } = o;
    const legacyName =
      typeof o.vesselName === "string" && o.vesselName.trim() !== ""
        ? o.vesselName
        : typeof _legacy === "string"
          ? _legacy
          : "";
    return {
      ...EMPTY_VOYAGE_PROFILE,
      ...rest,
      configured: Boolean(o.configured),
      vesselName: legacyName,
      mmsi: typeof o.mmsi === "string" ? o.mmsi : "",
      originPort: typeof o.originPort === "string" ? o.originPort : "",
      destinationPort: typeof o.destinationPort === "string" ? o.destinationPort : "",
      notes: typeof o.notes === "string" ? o.notes : "",
    };
  } catch {
    return { ...EMPTY_VOYAGE_PROFILE };
  }
}

export function saveVoyageProfile(p: VoyageProfile): void {
  try {
    localStorage.setItem(VOYAGE_STORAGE_KEY, JSON.stringify(p));
  } catch { /* ignore */ }
}
