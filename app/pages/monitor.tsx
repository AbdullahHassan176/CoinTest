/**
 * /monitor — Strait of Hormuz Logistics Intelligence Terminal
 *
 * Full-viewport layout:
 *   Top bar  → live status metrics
 *   Left     → Leaflet map + draggable/collapsible overlay panels (7 types)
 *   Right    → Logistics impact panel + searchable/filterable intel feed
 *   Bottom   → Scrolling news ticker
 */

import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useState, useEffect, useLayoutEffect, useRef, useCallback, type CSSProperties } from "react";
import WalletConnect from "../components/WalletConnect";
import type { ThreatData, ThreatLevel } from "./api/monitor/threat";
import type { OilData } from "./api/monitor/oil";
import type { VesselData } from "./api/monitor/vessels";
import type { NewsData, NewsItem } from "./api/monitor/news";
import type { FreightData } from "./api/monitor/freight";
import type { ShippingData } from "./api/monitor/shipping";
import type { TradeData } from "./api/monitor/trade";
import type { NewsMarker, LayerConfig, MapViewportCommand } from "../components/MonitorMap";
import { DEFAULT_LAYERS } from "../components/MonitorMap";

import "leaflet/dist/leaflet.css";

const MonitorMap = dynamic(() => import("../components/MonitorMap"), { ssr: false });

// ─── Constants ────────────────────────────────────────────────────────────────

// Static labels/colors per threat level (thresholds don't change)
const THREAT_BANDS = {
  0: { chokepoint: "OPEN",       chopkeyColor: "#22c55e", routeStatus: "Normal transit operations",      rerouting: false, suezNote: "No advisory",           capeDelayBase: null as string|null, impactScore: 8  },
  1: { chokepoint: "MONITORED",  chopkeyColor: "#C9A84C", routeStatus: "Heightened naval monitoring",    rerouting: false, suezNote: "Advisory issued",       capeDelayBase: null as string|null, impactScore: 28 },
  2: { chokepoint: "RESTRICTED", chopkeyColor: "#f97316", routeStatus: "Carriers rerouting via Cape",    rerouting: true,  suezNote: "Partial closure adv",   capeDelayBase: "+18–22 days",       impactScore: 62 },
  3: { chokepoint: "CRISIS",     chopkeyColor: "#CC2936", routeStatus: "Major rerouting — Cape of GH",   rerouting: true,  suezNote: "Full closure advisory", capeDelayBase: "+22–26 days",       impactScore: 91 },
} as const;

/** Build a LOGISTICS-style row by merging static threat bands with live shipping data */
function buildLogistics(level: ThreatLevel, shipping: ShippingData | null) {
  const band = THREAT_BANDS[level];
  const s = shipping;

  const vlccRate   = s ? `~$${Math.round(s.vlccRate / 1000)}K/day`     : ["~$40K", "~$55K", "~$120K", "~$250K+"][level];
  const warRisk    = s ? s.warRiskLabel                                  : ["~0.05%", "~0.1–0.3%", "~0.5–1.5%", "2%+"][level];
  const capeCost   = s ? `~$${(s.capeCostExtra / 1_000_000).toFixed(1)}M extra/voyage` : ["~$0.8M", "~$0.9M", "~$1.4M", "~$2M+"][level];
  const supplyFlow = s ? s.supplyFlowLabel                               : ["~21M bbl/day", "~21M bbl/day", "~15–18M bbl/day", "<10M bbl/day"][level];
  const freightImpact = s
    ? (s.freightUpliftPct < 5 ? "Minimal" : s.freightUpliftPct < 20 ? `Minor (+${s.freightUpliftPct}% uplift)` : s.freightUpliftPct < 60 ? `Significant (+${s.freightUpliftPct}%)` : `Severe (+${s.freightUpliftPct}%)`)
    : ["Minimal", "Minor (+5–15%)", "Significant (+30–60%)", "Severe (+80–150%)"][level];
  const capeDelay = s ? `+${s.capeExtraDays} days` : band.capeDelayBase;

  return { ...band, vlccRate, warRisk, capeCost, supplyFlow, freightImpact, capeDelay };
}

const THREAT_COLOR: Record<string, string> = {
  LOW: "#22c55e", ELEVATED: "#C9A84C", HIGH: "#f97316", CRITICAL: "#CC2936",
};

// ─── Geo-location dictionary (place name → [lat, lon]) ────────────────────────
const GEO_DICT: Record<string, [number, number]> = {
  "hormuz": [26.56, 56.15], "strait of hormuz": [26.56, 56.15],
  "persian gulf": [26.0, 52.0], "gulf of oman": [22.0, 59.0],
  "bandar abbas": [27.18, 56.29], "qeshm": [26.74, 55.90],
  "abu musa": [25.87, 55.03], "fujairah": [25.12, 56.34],
  "jebel ali": [24.99, 55.06], "abu dhabi": [24.45, 54.38],
  "dubai": [25.20, 55.27], "muscat": [23.61, 58.59],
  "sohar": [24.35, 56.71], "kharg": [29.26, 50.32],
  "ras tanura": [26.64, 50.16], "yanbu": [24.09, 38.05],
  "kuwait": [29.37, 47.99], "bahrain": [26.21, 50.55],
  "qatar": [25.35, 51.18], "doha": [25.29, 51.53],
  "red sea": [20.0, 38.0], "bab el-mandeb": [12.60, 43.30],
  "bab-el-mandeb": [12.60, 43.30], "aden": [12.79, 45.04],
  "gulf of aden": [12.0, 46.0], "hodeidah": [14.80, 42.95],
  "houthi": [15.5, 44.0], "yemen": [15.5, 48.5],
  "suez": [29.97, 32.55], "suez canal": [30.58, 32.34],
  "iran": [32.0, 53.0], "tehran": [35.69, 51.39], "irgc": [27.0, 56.0],
  "saudi": [24.0, 45.0], "riyadh": [24.69, 46.72],
  "aramco": [26.64, 50.16], "abqaiq": [25.93, 49.66],
  "iraq": [33.0, 44.0], "basra": [30.51, 47.82], "kirkuk": [35.47, 44.39],
  "oman": [22.0, 57.0], "karachi": [24.86, 67.01], "mumbai": [18.97, 72.82],
  "malacca": [2.50, 102.00], "singapore": [1.35, 103.82],
  "cape of good hope": [-34.36, 18.48], "cape good hope": [-34.36, 18.48],
};

function geolocateItem(item: NewsItem): [number, number] | null {
  const text = (item.title + " " + item.snippet).toLowerCase();
  // Longer phrases first so "strait of hormuz" beats "hormuz"
  const keys = Object.keys(GEO_DICT).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (text.includes(k)) return GEO_DICT[k];
  }
  return null;
}

/** Stable id so map markers, feed rows, and the intel deck refer to the same item. */
function newsIntelId(item: NewsItem): string {
  if (item.link) return item.link;
  return `${item.title.slice(0, 200)}::${item.pubDate || ""}`;
}

// ─── Per-article severity scoring ─────────────────────────────────────────────
const SEV_CRITICAL = ["attack", "struck", "seized", "seize", "blockade", "blocked", "missile", "warship", "explosion", "crisis", "halt", "closure", "shut", "hostage", "war"];
const SEV_HIGH     = ["military", "naval", "navy", "irgc", "threat", "escalat", "warning", "drone", "detained", "sanction", "embargo", "houthi", "armed", "confrontat", "tension"];
const SEV_NORMAL   = ["oil", "shipping", "freight", "tanker", "crude", "opec", "pipeline", "cargo", "vessel", "brent", "wti"];

function scoreSeverity(text: string): "CRITICAL" | "HIGH" | "NORMAL" | "LOW" {
  const t = text.toLowerCase();
  if (SEV_CRITICAL.some((k) => t.includes(k))) return "CRITICAL";
  if (SEV_HIGH.some((k) => t.includes(k))) return "HIGH";
  if (SEV_NORMAL.some((k) => t.includes(k))) return "NORMAL";
  return "LOW";
}

const ITEM_SEV_COLOR: Record<string, string> = {
  CRITICAL: "#CC2936", HIGH: "#f97316", NORMAL: "#C9A84C", LOW: "rgba(255,255,255,0.25)",
};
const ITEM_SEV_BG: Record<string, string> = {
  CRITICAL: "#CC293622", HIGH: "#f9731622", NORMAL: "#C9A84C22", LOW: "transparent",
};

// ─── Timeline event types ─────────────────────────────────────────────────────
type TimelineEvent = {
  ts: number; // unix ms
  type: "threat_change" | "critical_news";
  label: string;
  detail: string;
  color: string;
};

function useTimelineLog(threatLabel: string | null) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const prevThreat = useRef<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("hormuz_timeline");
      if (saved) setEvents(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const logEvent = useCallback((ev: TimelineEvent) => {
    setEvents((prev) => {
      const next = [ev, ...prev].slice(0, 50); // keep last 50
      try { localStorage.setItem("hormuz_timeline", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!threatLabel) return;
    if (prevThreat.current && prevThreat.current !== threatLabel) {
      logEvent({
        ts: Date.now(),
        type: "threat_change",
        label: `Threat → ${threatLabel}`,
        detail: `Changed from ${prevThreat.current}`,
        color: THREAT_COLOR[threatLabel] ?? "#C9A84C",
      });
    }
    prevThreat.current = threatLabel;
  }, [threatLabel, logEvent]);

  return { events, logEvent };
}

const RIGHT_PANEL_PORTS = [
  { name: "Fujairah (UAE)",    keywords: ["fujairah"] },
  { name: "Bandar Abbas (IR)", keywords: ["bandar abbas", "bandar-abbas", "hormozgan"] },
  { name: "Jebel Ali (UAE)",   keywords: ["jebel ali", "dubai port"] },
  { name: "Muscat (OM)",       keywords: ["muscat", "oman port"] },
];

const NEWS_TOPICS = [
  { label: "OIL",      kw: ["oil", "crude", "petroleum", "bbl", "opec", "brent", "wti"] },
  { label: "LNG",      kw: ["lng", "liquefied", "natural gas", "qatar", "gas carrier"] },
  { label: "MILITARY", kw: ["military", "naval", "navy", "attack", "missile", "drone", "warship", "frigat", "irgc"] },
  { label: "SHIPPING", kw: ["shipping", "vessel", "tanker", "cargo", "port", "freight", "maritime", "ais"] },
  { label: "SANCTIONS",kw: ["sanction", "embargo", "restrict", "ban", "iran deal", "seizure"] },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useFetch<T>(url: string, interval = 120_000) {
  const [data, setData] = useState<T | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  useEffect(() => {
    const load = () => fetch(url).then((r) => r.json()).then((d) => { setData(d); setFetchedAt(Date.now()); }).catch(() => {});
    load();
    const id = setInterval(load, interval);
    return () => clearInterval(id);
  }, [url, interval]);
  return { data, fetchedAt, intervalMs: interval };
}

/** Track last N threat scores to determine trend direction */
function useThreatHistory(score: number | null) {
  const history = useRef<number[]>([]);
  useEffect(() => {
    if (score == null) return;
    history.current = [...history.current.slice(-9), score];
  }, [score]);
  const h = history.current;
  if (h.length < 2 || score == null) return "–";
  const prev = h[h.length - 2];
  if (score > prev + 2) return "↑";
  if (score < prev - 2) return "↓";
  return "→";
}

/** Drag hook — tracks position via fixed viewport coordinates */
function useDrag(defaultPos: { top: number; left: number }) {
  const [pos, setPos] = useState(defaultPos);
  const posRef = useRef(pos);
  posRef.current = pos; // always current without closure stale issue

  function startDrag(e: React.MouseEvent) {
    // Let buttons, inputs, links handle their own events
    if ((e.target as HTMLElement).closest("button, input, a, select, textarea")) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const sl = posRef.current.left, st = posRef.current.top;

    const onMove = (ev: MouseEvent) =>
      setPos({ top: st + ev.clientY - sy, left: sl + ev.clientX - sx });
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return { pos, startDrag };
}

/** Client-only breakpoint helper for responsive layout (SSR defaults to `initial`). */
function useMediaQuery(query: string, initial = false) {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);
  return matches;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function fmt(n: number | null | undefined, dec = 2, prefix = "$"): string {
  return n == null ? "—" : `${prefix}${n.toFixed(dec)}`;
}

function ChangePill({ v }: { v: number | null | undefined }) {
  if (v == null) return null;
  const up = v >= 0;
  return (
    <span className={`font-mono-data text-[9px] ml-0.5 ${up ? "text-green-400" : "text-hormuz-red"}`}>
      {up ? "▲" : "▼"}{Math.abs(v).toFixed(1)}%
    </span>
  );
}

function portAlerted(keywords: string[], news: NewsItem[]) {
  const corpus = news.map((n) => (n.title + " " + n.snippet).toLowerCase()).join(" ");
  return keywords.some((kw) => corpus.includes(kw));
}

function filterNews(items: NewsItem[], query: string, topic: string | null, source: string | null) {
  return items.filter((item) => {
    const text = (item.title + " " + (item.snippet ?? "")).toLowerCase();
    if (query && !text.includes(query.toLowerCase())) return false;
    if (topic) {
      const t = NEWS_TOPICS.find((tp) => tp.label === topic);
      if (t && !t.kw.some((kw) => text.includes(kw))) return false;
    }
    if (source && item.source.split(" ")[0].toUpperCase() !== source) return false;
    return true;
  });
}

// ─── Draggable, collapsible panel shell ──────────────────────────────────────

/** Monotonic z-index so the active panel stays above siblings + the left toolbar (z-1200). */
let __panelZSeed = 1300;
function takeNextPanelZ() {
  __panelZSeed += 1;
  return __panelZSeed;
}

type DPProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  defaultPos: { top: number; left: number };
  width?: number;
  accentColor?: string;
};

function DraggablePanel({ title, subtitle, children, onClose, defaultPos, width = 255, accentColor = "#C9A84C" }: DPProps) {
  const { pos, startDrag } = useDrag(defaultPos);
  const [collapsed, setCollapsed] = useState(false);
  const [zIndex, setZIndex] = useState(() => takeNextPanelZ());
  const bringToFront = () => setZIndex(takeNextPanelZ());
  const narrowSheet = useMediaQuery("(max-width: 1023px)", false);

  const shellStyle: CSSProperties = narrowSheet
    ? {
        position: "fixed",
        zIndex,
        top: "auto",
        left: 10,
        right: 10,
        width: "auto",
        bottom: "max(88px, calc(env(safe-area-inset-bottom, 0px) + 76px))",
        maxHeight: "min(78dvh, 620px)",
        background: "rgba(8,12,22,0.97)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderTop: `2px solid ${accentColor}55`,
        borderRadius: 8,
        boxShadow: "0 12px 48px rgba(0,0,0,0.75)",
        fontFamily: "inherit",
        overflow: "hidden",
      }
    : {
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width,
        zIndex,
        background: "rgba(8,12,22,0.95)",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderTop: `2px solid ${accentColor}55`,
        borderRadius: 2,
        boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
        fontFamily: "inherit",
        overflow: "hidden",
      };

  return (
    <div style={shellStyle}>
      {/* ── Drag handle / header ── */}
      <div
        onMouseDown={(e) => {
          bringToFront();
          if (!narrowSheet) startDrag(e);
        }}
        style={{ cursor: "grab", userSelect: "none" }}
        className="flex items-center justify-between px-3 py-2 bg-white/[0.025] border-b border-white/[0.07]"
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Drag grip dots */}
          <span className="shrink-0 font-mono-data text-[11px] leading-none" style={{ color: "rgba(255,255,255,0.18)", letterSpacing: "-1px" }}>⠿</span>
          <div className="min-w-0">
            <div className="font-mono-data text-[10px] font-semibold uppercase tracking-widest truncate" style={{ color: "rgba(255,255,255,0.82)" }}>
              {title}
            </div>
            {subtitle && !collapsed && (
              <div className="font-mono-data text-[8px] tracking-wider mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.28)" }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 ml-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand" : "Collapse"}
            className="font-mono-data text-[13px] leading-none px-1.5 py-0.5 text-white/30 hover:text-white/70 transition-colors rounded-sm"
          >
            {collapsed ? "□" : "─"}
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="font-mono-data text-[15px] leading-none px-1.5 py-0.5 text-white/30 hover:text-hormuz-red transition-colors rounded-sm"
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Body (hidden when collapsed) ── */}
      {!collapsed && (
        <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: narrowSheet ? "min(62dvh, 520px)" : "min(70vh, 520px)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// Shared sub-components used inside panels
function PRow({ label, value, vc }: { label: string; value: React.ReactNode; vc?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-0.5">
      <span className="font-mono-data text-[9px] text-white/35 shrink-0 leading-relaxed">{label}</span>
      <span className="font-mono-data text-[10px] text-right leading-relaxed" style={{ color: vc ?? "rgba(255,255,255,0.75)" }}>
        {value}
      </span>
    </div>
  );
}

function PDivider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 my-2">
      {label && <span className="font-mono-data text-[8px] text-white/25 uppercase tracking-widest shrink-0">{label}</span>}
      <div className="flex-1 h-px bg-white/[0.07]" />
    </div>
  );
}

// ─── Overlay panels (7 total) ─────────────────────────────────────────────────

function AISOverlay({ vessels, onClose }: { vessels: VesselData | null; onClose: () => void }) {
  const noKey = vessels?.noKey;
  const hasData = (vessels?.count ?? 0) > 0;

  // Compute live type breakdown from actual vessel list
  const typeCounts = (vessels?.vessels ?? []).reduce<Record<string, number>>((acc, v) => {
    acc[v.shipType] = (acc[v.shipType] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <DraggablePanel title="AIS Traffic" subtitle="Live vessel snapshot · Strait of Hormuz bbox" onClose={onClose} defaultPos={{ top: 70, left: 670 }} width={280} accentColor="#00B4CC">
      <div className="px-3 py-2.5 space-y-0">

        {noKey ? (
          /* ── No API key — operator note + public map links (no env paths in UI) ── */
          <>
            <div className="py-2 px-2 bg-hormuz-gold/10 border border-hormuz-gold/20 rounded-sm mb-3">
              <p className="font-mono-data text-[9px] text-hormuz-gold leading-relaxed">
                Live dots on this map need an AIS feed. Site operators configure <span className="text-white/50">AISSTREAM_API_KEY</span> on the server; end users can still track ships on public maps below.
              </p>
            </div>
            <PRow label="AIS feed" value={<a href="https://aisstream.io" target="_blank" rel="noreferrer" className="text-hormuz-teal underline">AISstream.io</a>} />
            <PDivider label="Live vessel map (no key needed)" />
            <a
              href="https://www.marinetraffic.com/en/ais/home/centerx:56.15/centery:26.56/zoom:10"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between py-2 px-2.5 bg-white/[0.04] border border-white/[0.08] rounded-sm hover:border-hormuz-teal/30 transition-colors group"
            >
              <span className="font-mono-data text-[10px] text-white/60 group-hover:text-white/80">Open MarineTraffic →</span>
              <span className="font-mono-data text-[8px] text-white/25">Live vessel map</span>
            </a>
            <a
              href="https://www.vesselfinder.com/?lat=26.5&lon=56.5&zoom=9"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between py-2 px-2.5 bg-white/[0.04] border border-white/[0.08] rounded-sm hover:border-hormuz-teal/30 transition-colors group mt-1.5"
            >
              <span className="font-mono-data text-[10px] text-white/60 group-hover:text-white/80">Open VesselFinder →</span>
              <span className="font-mono-data text-[8px] text-white/25">Live vessel map</span>
            </a>
          </>
        ) : hasData ? (
          /* ── Live data available ── */
          <>
            <PRow label="Vessels detected"       value={<span className="text-hormuz-teal font-semibold">{vessels!.count}</span>} />
            <PRow label="Coverage area"          value="25–27.5°N / 55–59.5°E" />
            <PRow label="Data source"            value={<a href="https://aisstream.io" target="_blank" rel="noreferrer" className="text-hormuz-teal underline">AISstream.io</a>} />
            <PRow label="Snapshot age"           value={vessels?.updatedAt ? `${Math.round((Date.now() - new Date(vessels.updatedAt).getTime()) / 1000)}s ago` : "—"} />
            <PDivider label="Detected vessel types" />
            {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, cnt]) => (
              <PRow key={type} label={type} value={`${cnt} (${Math.round(cnt / vessels!.count! * 100)}%)`} />
            ))}
          </>
        ) : (
          /* ── Key set but 0 vessels — Gulf has no terrestrial AIS stations ── */
          <>
            <div className="py-2 px-2 bg-orange-500/10 border border-orange-500/20 rounded-sm mb-3">
              <p className="font-mono-data text-[9px] text-orange-300 font-medium mb-1">
                No AIS coverage in this region
              </p>
              <p className="font-mono-data text-[8px] text-white/40 leading-relaxed">
                AISstream free tier = terrestrial receivers only. Persian Gulf has no contributing shore stations — satellite AIS (paid plan) required for Hormuz positions.
              </p>
            </div>
            <PDivider label="View live vessels (open in new tab)" />
            <a href="https://www.marinetraffic.com/en/ais/home/centerx:56.15/centery:26.56/zoom:10" target="_blank" rel="noreferrer"
              className="flex items-center justify-between py-2 px-2.5 bg-white/[0.04] border border-white/[0.08] rounded-sm hover:border-hormuz-teal/30 transition-colors group mb-1.5">
              <span className="font-mono-data text-[10px] text-white/65 group-hover:text-white/85">MarineTraffic — Hormuz ↗</span>
              <span className="font-mono-data text-[8px] text-white/25">Satellite + terrestrial AIS</span>
            </a>
            <a href="https://www.vesselfinder.com/?lat=26.5&lon=56.5&zoom=9" target="_blank" rel="noreferrer"
              className="flex items-center justify-between py-2 px-2.5 bg-white/[0.04] border border-white/[0.08] rounded-sm hover:border-hormuz-teal/30 transition-colors group mb-1.5">
              <span className="font-mono-data text-[10px] text-white/65 group-hover:text-white/85">VesselFinder — Hormuz ↗</span>
              <span className="font-mono-data text-[8px] text-white/25">Live vessel positions</span>
            </a>
            <a href="https://www.fleetmon.com/map/#!zoom=9&lat=26.5&lon=56.5" target="_blank" rel="noreferrer"
              className="flex items-center justify-between py-2 px-2.5 bg-white/[0.04] border border-white/[0.08] rounded-sm hover:border-hormuz-teal/30 transition-colors group">
              <span className="font-mono-data text-[10px] text-white/65 group-hover:text-white/85">FleetMon — Hormuz ↗</span>
              <span className="font-mono-data text-[8px] text-white/25">Commercial vessel tracker</span>
            </a>
            <PDivider label="Upgrade for embedded live data" />
            <PRow label="AISstream paid"    value={<a href="https://aisstream.io/pricing" target="_blank" rel="noreferrer" className="text-hormuz-teal underline">Satellite AIS tiers ↗</a>} />
            <PRow label="Spire Maritime"    value={<a href="https://spire.com/maritime/" target="_blank" rel="noreferrer" className="text-white/40 underline">Enterprise AIS ↗</a>} />
          </>
        )}
      </div>
    </DraggablePanel>
  );
}

function TradeFlowsOverlay({ trade, onClose }: { trade: TradeData | null; onClose: () => void }) {
  const t = trade;
  const fmtMbbl = (n: number) => n >= 1000 ? `~${(n/1000).toFixed(1)}M bbl/day` : `~${n}K bbl/day`;
  return (
    <DraggablePanel title="Trade Flows" subtitle="Goods transiting Strait of Hormuz" onClose={onClose} defaultPos={{ top: 70, left: 60 }} width={285} accentColor="#C9A84C">
      <div className="px-3 py-2.5 space-y-0">
        <PDivider label="Energy volumes" />
        <PRow label="Crude oil"                value={t ? fmtMbbl(t.crudeMbbl) : "~17–18M bbl/day"} />
        <PRow label="% of global seaborne oil" value={t ? `~${t.crudeGlobalPct}%` : "~30%"} vc="#f97316" />
        <PRow label="Oil products (refined)"   value={t ? fmtMbbl(t.refinedMbbl) : "~3–4M bbl/day"} />
        <PRow label="LNG (Qatar origin)"       value={t ? `~${t.lngMtYear}M tonnes/yr` : "~100M tonnes/yr"} />
        <PRow label="% of global LNG trade"    value={t ? `~${t.lngGlobalPct}%` : "~20–25%"} vc="#f97316" />
        <PRow label="Condensates / NGLs"       value={t ? fmtMbbl(t.condensatesMbbl) : "~2M bbl/day"} />
        <PDivider label="Non-energy cargo (annual)" />
        <PRow label="Petrochemicals"           value={t ? `~$${t.petrochemBn}B/yr` : "~$180B/yr"} />
        <PRow label="Container cargo"          value={t ? `~$${t.containerBn}B/yr` : "~$200B/yr"} />
        <PRow label="Steel & aluminium"        value={t ? `~$${t.steelAlumBn}B/yr` : "~$40B/yr"} />
        <PRow label="Heavy machinery"          value={t ? `~$${t.machineryBn}B/yr` : "~$30B/yr"} />
        <PDivider label={`Top exporters ${t?.liveData ? "(EIA API)" : "(EIA/OPEC)"}`} />
        {(t?.exporters ?? []).map((e) => (
          <PRow key={e.country} label={`#${e.rank} ${e.country}`} value={e.crude} />
        ))}
        <PDivider label="Top importers" />
        {(t?.importers ?? []).slice(0, 5).map((i) => (
          <PRow key={i.country} label={i.country} value={`${i.hormuzPct}% Hormuz dep.`} />
        ))}
        {t && (
          <div className="mt-2 pt-1.5 border-t border-white/[0.05]">
            <p className="font-mono-data text-[8px] text-white/18 leading-relaxed">
              Source:{" "}
              <a href="https://www.eia.gov/international/analysis.php" target="_blank" rel="noreferrer" className="text-hormuz-teal/60 hover:text-hormuz-teal underline">{t.source}</a>
              {" · "}{t.dataMonth}
              {t.liveData ? " · Live" : " · Monthly report"}
            </p>
          </div>
        )}
      </div>
    </DraggablePanel>
  );
}

function FreightRatesOverlay({ freight, oil, shipping, level, onClose }: { freight: FreightData | null; oil: OilData | null; shipping: ShippingData | null; level: ThreatLevel; onClose: () => void }) {
  const lc = buildLogistics(level, shipping);
  const s = shipping;
  return (
    <DraggablePanel title="Freight & Rates" subtitle="Live commodity prices · Tanker market" onClose={onClose} defaultPos={{ top: 460, left: 670 }} width={270} accentColor="#C9A84C">
      <div className="px-3 py-2.5 space-y-0">
        <PDivider label="Energy futures (live)" />
        <PRow label="Brent Crude"          value={<>{fmt(oil?.brent?.price)}<ChangePill v={oil?.brent?.changePct} /></>} />
        <PRow label="WTI Crude"            value={<>{fmt(oil?.wti?.price)}<ChangePill v={oil?.wti?.changePct} /></>} />
        <PRow label="Nat Gas (Henry Hub)"  value={<>{fmt(oil?.ng?.price, 3)} /MMBtu<ChangePill v={oil?.ng?.changePct} /></>} />
        <PRow label="Heating Oil (HO=F)"   value={<>{fmt(freight?.heatingOil?.price, 4)} /gal<ChangePill v={freight?.heatingOil?.changePct} /></>} />
        <PRow label="RBOB Gasoline"        value={<>{fmt(freight?.gasoline?.price, 4)} /gal<ChangePill v={freight?.gasoline?.changePct} /></>} />
        {s?.hsfoProxy && <PRow label="HSFO proxy ($/MT)"   value={`$${s.hsfoProxy}/MT`} vc="rgba(255,255,255,0.45)" />}
        <PDivider label="Tanker stocks (live)" />
        <PRow label="Frontline (FRO)"      value={<>{fmt(freight?.frontline?.price)}<ChangePill v={freight?.frontline?.changePct} /></>} />
        <PRow label="DHT Holdings (DHT)"   value={<>{fmt(freight?.dht?.price)}<ChangePill v={freight?.dht?.changePct} /></>} />
        <PRow label="Hafnia (HAFNIA.CO)"   value={<>{fmt(freight?.hafnia?.price)}<ChangePill v={freight?.hafnia?.changePct} /></>} />
        {s?.froPosition != null && (
          <PRow label="FRO 52w range pos." value={`${Math.round(s.froPosition * 100)}% (${s.fro52wLow ? `$${s.fro52wLow?.toFixed(2)}` : "—"}–${s.fro52wHigh ? `$${s.fro52wHigh?.toFixed(2)}` : "—"})`} vc="rgba(255,255,255,0.35)" />
        )}
        <PDivider label="Derived from FRO market + threat score" />
        <PRow label="VLCC spot rate est."  value={lc.vlccRate}            vc="#C9A84C" />
        <PRow label="VLCC range"           value={s ? `$${Math.round(s.vlccRateLow/1000)}K–$${Math.round(s.vlccRateHigh/1000)}K/day` : "—"} vc="rgba(255,255,255,0.4)" />
        <PRow label="War risk premium"     value={lc.warRisk}             vc="#f97316" />
        <PRow label="Freight rate uplift"  value={s ? `+${s.freightUpliftPct}%` : lc.freightImpact} />
        <PRow label="Cape reroute cost"    value={lc.capeCost}            vc="#f97316" />
        <PDivider label="Cape rerouting economics" />
        <PRow label="Extra distance"       value={s ? `${s.capeExtraNm.toLocaleString()} nm` : "+6,400 nm"} />
        <PRow label="Extra transit days"   value={s ? `+${s.capeExtraDays} days` : (lc.capeDelay ?? "N/A")} />
        <PRow label="HSFO bunker/voyage"   value={s ? `~${Math.round(80 * s.capeExtraDays / 1000) * 1000} MT` : "~1,520 MT"} />
        <PRow label="Extra CO₂/voyage"     value="~15,000 tonnes" />
        {s?.bdi && (
          <>
            <PDivider label="Dry bulk (proxy)" />
            <PRow label={s.bdi > 1000 ? "BCOM / BDRY ETF" : "Baltic proxy"} value={<>{s.bdi.toFixed(2)}<ChangePill v={s.bdiChangePct} /></>} />
          </>
        )}
      </div>
    </DraggablePanel>
  );
}

// Keywords that signal disruption at each non-Hormuz chokepoint
const SUEZ_KEYWORDS   = ["suez", "red sea", "houthi", "bab el-mandeb", "bab-el-mandeb", "gulf of aden", "rerouting via cape"];
const MALACCA_KEYWORDS= ["malacca", "singapore strait", "south china sea", "piracy malaysia"];
const BEL_KEYWORDS    = ["bab el-mandeb", "bab-el-mandeb", "houthi", "red sea attack", "aden", "gulf of aden"];
const TURKISH_KEYWORDS= ["bosphorus", "dardanelles", "turkish strait", "black sea", "russia ukraine shipping"];
const PANAMA_KEYWORDS   = ["panama canal", "neo-panamax", "panamax", "panama transit"];
const GIB_KEYWORDS      = ["gibraltar", "algeciras", "strait of gibraltar"];
const DOVER_KEYWORDS    = ["english channel", "dover strait", "dover-calais"];
const TAIWAN_KEYWORDS   = ["taiwan strait", "taiwan shipping", "south china sea blockade"];
const KOREA_KEYWORDS    = ["korea strait", "tsushima", "korea strait tss"];
const SINGAPORE_KEYWORDS= ["singapore strait", "straits of singapore", "singapore port congestion"];
const DANISH_KEYWORDS   = ["great belt", "fehmarn belt", "danish straits", "bornholm"];
const STLAW_KEYWORDS    = ["saint lawrence", "st. lawrence seaway", "seaway locks"];
const MAGELLAN_KEYWORDS = ["strait of magellan", "magellan strait"];
const LOMBOK_KEYWORDS   = ["lombok strait", "lombok"];
const SUNDA_KEYWORDS    = ["sunda strait", "sunda "];
const TORRES_KEYWORDS   = ["torres strait"];
const WINDWARD_KEYWORDS = ["windward passage", "caribbean shipping"];
const MOZ_KEYWORDS      = ["mozambique channel"];

function chorkeStatus(keywords: string[], news: NewsItem[]): { status: string; color: string } {
  const corpus = news.map((n) => (n.title + " " + (n.snippet ?? "")).toLowerCase()).join(" ");
  const hit = keywords.some((kw) => corpus.includes(kw));
  return hit ? { status: "MONITORED", color: "#C9A84C" } : { status: "OPEN", color: "#22c55e" };
}

const CHOKEPOINT_MAP_VIEW: Record<string, { lat: number; lon: number; zoom: number }> = {
  "Strait of Hormuz":     { lat: 26.56,  lon: 56.15,  zoom: 9 },
  "Suez Canal":           { lat: 30.58,  lon: 32.34,  zoom: 7 },
  "Malacca Strait":       { lat: 2.5,    lon: 102.0,  zoom: 6 },
  "Bab el-Mandeb":        { lat: 12.6,   lon: 43.3,   zoom: 7 },
  "Turkish Straits":      { lat: 41.1,   lon: 29.05,  zoom: 7 },
  "Singapore Strait":     { lat: 1.22,   lon: 103.82, zoom: 9 },
  "Panama Canal":         { lat: 9.08,   lon: -79.68, zoom: 7 },
  "Strait of Gibraltar":  { lat: 36.14,  lon: -5.35,  zoom: 7 },
  "Dover Strait":         { lat: 51.05,  lon: 1.45,   zoom: 7 },
  "Taiwan Strait":        { lat: 24.2,   lon: 119.85, zoom: 7 },
  "Korea Strait":         { lat: 34.6,   lon: 129.55, zoom: 7 },
  "Great Belt (Denmark)": { lat: 54.95,  lon: 11.1,   zoom: 7 },
  "Saint Lawrence":       { lat: 47.2,   lon: -70.5,  zoom: 6 },
  "Strait of Magellan":   { lat: -52.5,  lon: -69.5,  zoom: 6 },
  "Lombok Strait":        { lat: -8.4,   lon: 115.9,  zoom: 7 },
  "Sunda Strait":         { lat: -6.0,   lon: 105.8,  zoom: 7 },
  "Torres Strait":        { lat: -10.5,  lon: 142.2,  zoom: 6 },
  "Windward Passage":     { lat: 20.2,   lon: -73.8,  zoom: 7 },
  "Mozambique Channel":   { lat: -16.0,  lon: 42.0,   zoom: 5 },
};

function ChokepointsOverlay({
  level, news, onClose, onMapFocus,
}: {
  level: ThreatLevel;
  news: NewsItem[];
  onClose: () => void;
  onMapFocus: (lat: number, lon: number, zoom: number) => void;
}) {
  const lc = THREAT_BANDS[level];
  const suez   = chorkeStatus(SUEZ_KEYWORDS, news);
  const malacca = chorkeStatus(MALACCA_KEYWORDS, news);
  const bel    = chorkeStatus(BEL_KEYWORDS, news);
  const turkish = chorkeStatus(TURKISH_KEYWORDS, news);
  const panama  = chorkeStatus(PANAMA_KEYWORDS, news);
  const gib     = chorkeStatus(GIB_KEYWORDS, news);
  const dover   = chorkeStatus(DOVER_KEYWORDS, news);
  const taiwanS = chorkeStatus(TAIWAN_KEYWORDS, news);
  const koreaS  = chorkeStatus(KOREA_KEYWORDS, news);
  const singaporeS = chorkeStatus(SINGAPORE_KEYWORDS, news);
  const danishS = chorkeStatus(DANISH_KEYWORDS, news);
  const stLaw   = chorkeStatus(STLAW_KEYWORDS, news);
  const magellan = chorkeStatus(MAGELLAN_KEYWORDS, news);
  const lombokS = chorkeStatus(LOMBOK_KEYWORDS, news);
  const sundaS  = chorkeStatus(SUNDA_KEYWORDS, news);
  const torresS = chorkeStatus(TORRES_KEYWORDS, news);
  const windward = chorkeStatus(WINDWARD_KEYWORDS, news);
  const mozS    = chorkeStatus(MOZ_KEYWORDS, news);

  // Escalate Suez/Bab if Hormuz is in crisis (historical ripple effect)
  const suezStatus  = level >= 2 ? { status: "ADV ISSUED", color: "#f97316" } : suez;
  const belStatus   = level >= 1 ? { status: "MONITORED",  color: "#C9A84C" } : bel;

  const cps = [
    { name: "Strait of Hormuz", region: "Persian Gulf exit",      oil: "21M bbl/day",    trade: "~30% seaborne oil", lng: "~25% global LNG", w: "33 km",         status: lc.chokepoint,   sc: lc.chopkeyColor },
    { name: "Suez Canal",       region: "Red Sea → Mediterranean", oil: "~1.25M bbl/day", trade: "~12% global trade", lng: "~8% global LNG",  w: "205 m (canal)", status: suezStatus.status,   sc: suezStatus.color },
    { name: "Malacca Strait",   region: "Indo-Pacific transit",    oil: "~15M bbl/day",   trade: "~25% world trade",  lng: "~30% Asian LNG",  w: "2.8 km (min)", status: malacca.status,      sc: malacca.color },
    { name: "Singapore Strait", region: "Malacca feeder",          oil: "High product flow", trade: "Top-3 box choke", lng: "LNG transshipment", w: "TSS dense",   status: singaporeS.status,   sc: singaporeS.color },
    { name: "Bab el-Mandeb",    region: "Red Sea entrance",        oil: "~4.8M bbl/day",  trade: "~10% seaborne",     lng: "~6% global LNG",  w: "29 km",        status: belStatus.status,    sc: belStatus.color },
    { name: "Panama Canal",     region: "Americas east–west",      oil: "~0.5M bbl/day",  trade: "~5% seaborne",      lng: "Growing LNG",     w: "Neo-Panamax",  status: panama.status,       sc: panama.color },
    { name: "Strait of Gibraltar", region: "Med ↔ Atlantic",     oil: "~3M bbl/day",    trade: "Med container",    lng: "Med LNG",         w: "13 km min",    status: gib.status,          sc: gib.color },
    { name: "Dover Strait",     region: "North Sea access",        oil: "Products",      trade: "UK–EU shortsea",   lng: "Minimal",         w: "TSS busiest",  status: dover.status,        sc: dover.color },
    { name: "Turkish Straits",  region: "Black Sea → Med",         oil: "~2.4M bbl/day",  trade: "~4% European trade",lng: "Minimal",         w: "0.7 km (min)", status: turkish.status,      sc: turkish.color },
    { name: "Taiwan Strait",    region: "NE Asia trunk",           oil: "Major products", trade: "China–ROW lanes", lng: "Spot risk",       w: "110–130 nm",   status: taiwanS.status,      sc: taiwanS.color },
    { name: "Korea Strait",     region: "Japan Sea entry",         oil: "Crude & products", trade: "NE Asia entry", lng: "Winter fog",     w: "TSS",          status: koreaS.status,       sc: koreaS.color },
    { name: "Great Belt (Denmark)", region: "Baltic access",       oil: "Baltic grades",  trade: "Russian exports", lng: "Minimal",         w: "Bridges / ice", status: danishS.status,      sc: danishS.color },
    { name: "Saint Lawrence",   region: "N. America inland",       oil: "US/Canada crude", trade: "Seaway locks",   lng: "Minimal",         w: "Seasonal",     status: stLaw.status,        sc: stLaw.color },
    { name: "Strait of Magellan", region: "S. America southern",   oil: "Bunkers",        trade: "Cape alternative", lng: "Minimal",         w: "Narrow legs",  status: magellan.status,     sc: magellan.color },
    { name: "Lombok Strait",    region: "Deep Malacca alt",        oil: "VLCC preferred", trade: "Deep draft",     lng: "Minimal",         w: "Deep channel", status: lombokS.status,      sc: lombokS.color },
    { name: "Sunda Strait",     region: "Shallow Malacca alt",     oil: "Draft-sensitive", trade: "Shortcut risk", lng: "Minimal",         w: "Shallower",    status: sundaS.status,       sc: sundaS.color },
    { name: "Torres Strait",    region: "Aus north coast",         oil: "Coastal",       trade: "Aus supply",     lng: "Minimal",         w: "Pilotage",     status: torresS.status,      sc: torresS.color },
    { name: "Windward Passage", region: "Caribbean trunk",         oil: "Bunkers",        trade: "US–LatAm",       lng: "Minimal",         w: "Weather",      status: windward.status,     sc: windward.color },
    { name: "Mozambique Channel", region: "W. Indian Ocean",     oil: "East Africa",  trade: "Cape feeder",    lng: "Minimal",         w: "Wide",         status: mozS.status,         sc: mozS.color },
  ];
  return (
    <DraggablePanel title="Global chokepoints" subtitle="World straits & canals logistics watches — news keyword scan" onClose={onClose} defaultPos={{ top: 460, left: 60 }} width={312} accentColor="#22c55e">
      <div className="px-3 py-2 max-h-[min(60vh,480px)] overflow-y-auto overscroll-contain">
        {cps.map((c) => {
          const mv = CHOKEPOINT_MAP_VIEW[c.name];
          return (
            <div key={c.name} className="mb-3 last:mb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-data text-[10px] font-semibold text-white/85">{c.name}</span>
                <span className="font-mono-data text-[9px] font-semibold shrink-0" style={{ color: c.sc }}>{c.status}</span>
              </div>
              <div className="font-mono-data text-[8px] text-white/25 mb-1">{c.region} · width {c.w}</div>
              <div className="grid grid-cols-2 gap-x-2">
                <span className="font-mono-data text-[9px] text-white/45">Oil: {c.oil}</span>
                <span className="font-mono-data text-[9px] text-white/45">{c.trade}</span>
                <span className="font-mono-data text-[9px] text-white/30">LNG: {c.lng}</span>
              </div>
              {mv && (
                <button
                  type="button"
                  onClick={() => onMapFocus(mv.lat, mv.lon, mv.zoom)}
                  className="mt-1.5 font-mono-data text-[8px] text-hormuz-teal/80 hover:text-hormuz-teal border border-hormuz-teal/25 rounded-sm px-2 py-0.5 w-full text-left transition-colors"
                >
                  Show on map →
                </button>
              )}
              <div className="h-px bg-white/[0.06] mt-2" />
            </div>
          );
        })}
      </div>
    </DraggablePanel>
  );
}

function GoodsImpactedOverlay({ level, shipping, onClose }: { level: ThreatLevel; shipping: ShippingData | null; onClose: () => void }) {
  const lc = buildLogistics(level, shipping);
  const uplift = shipping?.freightUpliftPct ?? [0, 10, 45, 100][level];
  const goods = [
    { name: "Crude Oil",      sev: "CRITICAL", detail: "30% of global seaborne crude",       impact: `~$${level >= 3 ? "15–25" : level >= 2 ? "8–15" : "1–5"} price shock/bbl`, color: "#CC2936" },
    { name: "LNG / Nat Gas",  sev: "CRITICAL", detail: "Qatar supplies ~25% of global LNG",   impact: level >= 2 ? "Europe & Asia spot prices spike" : "Price premium elevated",  color: "#CC2936" },
    { name: "Refined Prods.", sev: "HIGH",     detail: "Jet fuel, diesel, fuel oil",          impact: `+${Math.round(uplift * 0.7)}–${Math.round(uplift * 1.4)}% premium on spot`, color: "#f97316" },
    { name: "Petrochemicals", sev: "HIGH",     detail: "Ethylene, propylene feedstocks",      impact: "Supply chain disruption to plastics",                                        color: "#f97316" },
    { name: "Aluminium/Steel",sev: level >= 2 ? "HIGH" : "ELEVATED", detail: "Gulf smelters supply Asia & EU", impact: `Freight cost +${Math.round(uplift * 0.4)}%`,           color: level >= 2 ? "#f97316" : "#C9A84C" },
    { name: "Container Cargo",sev: "ELEVATED", detail: "India/Asia → Gulf consumer goods",    impact: `${level >= 2 ? "+3–6 weeks" : "+0–2 weeks"} delay`,                         color: "#C9A84C" },
    { name: "Food Imports",   sev: level >= 2 ? "ELEVATED" : "LOW", detail: "Gulf imports ~85% of food",       impact: level >= 2 ? "Domestic food price pressure" : "Minimal",    color: level >= 2 ? "#C9A84C" : "#22c55e" },
  ];
  return (
    <DraggablePanel title="Goods Impacted" subtitle={`Blockade scenario · ${lc.chokepoint}`} onClose={onClose} defaultPos={{ top: 265, left: 670 }} width={270} accentColor="#f97316">
      <div className="px-3 py-2">
        {goods.map((g) => (
          <div key={g.name} className="pb-2 mb-1.5 border-b border-white/[0.05] last:border-0 last:mb-0 last:pb-0">
            <div className="flex items-center justify-between">
              <span className="font-mono-data text-[10px] font-semibold text-white/82">{g.name}</span>
              <span className="font-mono-data text-[8px] font-semibold px-1.5 py-0.5 rounded-sm" style={{ color: g.color, background: `${g.color}22` }}>{g.sev}</span>
            </div>
            <div className="font-mono-data text-[8px] text-white/28 mt-0.5">{g.detail}</div>
            <div className="font-mono-data text-[9px] text-white/55 mt-0.5">{g.impact}</div>
          </div>
        ))}
      </div>
    </DraggablePanel>
  );
}

// ─── Supply Routes overlay ────────────────────────────────────────────────────

/** Strategic Petroleum Reserve days of import-cover for Hormuz-dependent nations */
const SPR_DATA = [
  { country: "Japan",       govDays: 91, comDays: 54, hormuzPct: 88, note: "IEA obligation + commercial stocks" },
  { country: "South Korea", govDays: 60, comDays: 40, hormuzPct: 72, note: "Gov + commercial combined" },
  { country: "China",       govDays: 45, comDays: 35, hormuzPct: 38, note: "SPR programme ongoing expansion" },
  { country: "India",       govDays:  9, comDays: 30, hormuzPct: 58, note: "Small gov SPR + private stocks" },
  { country: "Taiwan",      govDays: 60, comDays: 30, hormuzPct: 76, note: "Gov mandate 60 days" },
  { country: "Singapore",   govDays:  0, comDays: 45, hormuzPct: 55, note: "Commercial stocks only" },
];

/** Pipeline bypass routes that skip Hormuz entirely */
const PIPELINE_BYPASSES = [
  {
    name:     "Saudi SCPX (Petroline)",
    route:    "Abqaiq → Yanbu (Red Sea)",
    capacity: 4.8,  // M bbl/day
    status:   "STANDBY",
    color:    "#C9A84C",
    note:     "Largest Hormuz bypass. Activates in crisis — historically used in 1984 Tanker War. Yanbu then loads VLCC for export.",
  },
  {
    name:     "UAE Habshan-Fujairah",
    route:    "Abu Dhabi → Fujairah (Indian Ocean)",
    capacity: 1.5,
    status:   "OPERATIONAL",
    color:    "#00B4CC",
    note:     "Already active since 2012. UAE routes ~30% of its crude through this pipeline. Fujairah is a major bunkering hub.",
  },
  {
    name:     "Iraq-Turkey (Kirkuk-Ceyhan)",
    route:    "Kirkuk → Ceyhan (Mediterranean)",
    capacity: 0.75,
    status:   "INTERMITTENT",
    color:    "#a78bfa",
    note:     "Bypasses Hormuz for Northern Iraq crude. Frequently disrupted by political issues and attacks on pipeline in Turkey/Iraq.",
  },
];

const PIPELINE_KEYWORDS = ["pipeline", "scpx", "petroline", "yanbu", "habshan", "fujairah pipeline", "kirkuk", "ceyhan"];

const ROUTE_MAP_VIEW: Record<string, { lat: number; lon: number; zoom: number }> = {
  "Hormuz Direct":        { lat: 26.56, lon: 56.15, zoom: 9 },
  "Red Sea / Suez Canal": { lat: 20.0,  lon: 38.0,  zoom: 6 },
  "Cape of Good Hope":    { lat: -34.4, lon: 18.5,  zoom: 6 },
  "Saudi SCPX Pipeline":  { lat: 24.5,  lon: 44.0,  zoom: 6 },
  "UAE Habshan Pipeline": { lat: 25.05, lon: 55.2,  zoom: 7 },
};

function SupplyRoutesOverlay({
  shipping, news, level, onClose, onMapFocus,
}: {
  shipping: ShippingData | null; news: NewsItem[]; level: ThreatLevel; onClose: () => void;
  onMapFocus: (lat: number, lon: number, zoom: number) => void;
}) {
  const lc = buildLogistics(level, shipping);
  const corpus = news.map((n) => (n.title + " " + (n.snippet ?? "")).toLowerCase()).join(" ");
  const pipelineInNews = PIPELINE_KEYWORDS.some((kw) => corpus.includes(kw));

  // Route comparison rows — costs computed live where possible
  const vlcc = shipping?.vlccRate ?? 40_000;
  const cape = shipping?.capeCostExtra ?? 1_400_000;
  const capaeDays = shipping?.capeExtraDays ?? 19;

  const routes = [
    {
      name:     "Hormuz Direct",
      type:     "MARITIME",
      days:     "+0",
      extraCostMvoy: 0,
      bblPremium: 0,
      capacity: "21M bbl/day",
      status:   lc.chokepoint,
      color:    lc.chopkeyColor,
      note:     "Shortest route. War risk insurance ~" + lc.warRisk + " of cargo value.",
    },
    {
      name:     "Red Sea / Suez Canal",
      type:     "MARITIME",
      days:     "+8",
      extraCostMvoy: 1.2,
      bblPremium: 0.60,
      capacity: "~4M bbl/day (canal limit)",
      status:   level >= 2 ? "ADVISORY" : "OPEN",
      color:    level >= 2 ? "#f97316" : "#22c55e",
      note:     "Suez canal fees + extra bunker. Houthi threat in Red Sea adds its own war risk.",
    },
    {
      name:     "Cape of Good Hope",
      type:     "MARITIME",
      days:     `+${capaeDays}`,
      extraCostMvoy: +(cape / 1_000_000).toFixed(1),
      bblPremium: +(cape / 2_000_000).toFixed(2),
      capacity: "Unlimited (open ocean)",
      status:   level >= 2 ? "ACTIVE DIVERT" : "CONTINGENCY",
      color:    level >= 2 ? "#f97316" : "rgba(255,255,255,0.35)",
      note:     "No chokepoint risk. ~80 extra MT bunker per VLCC. Adds CO₂ emissions ~15K tonnes.",
    },
    {
      name:     "Saudi SCPX Pipeline",
      type:     "PIPELINE",
      days:     "N/A",
      extraCostMvoy: 0.4,
      bblPremium: 0.20,
      capacity: "4.8M bbl/day",
      status:   pipelineInNews ? "MENTIONED" : "STANDBY",
      color:    pipelineInNews ? "#C9A84C" : "rgba(255,255,255,0.35)",
      note:     "Saudi Arabia's strategic bypass. Pipeline to Yanbu Red Sea terminal. Crude loads VLCC for onward voyage.",
    },
    {
      name:     "UAE Habshan Pipeline",
      type:     "PIPELINE",
      days:     "N/A",
      extraCostMvoy: 0.3,
      bblPremium: 0.15,
      capacity: "1.5M bbl/day",
      status:   "OPERATIONAL",
      color:    "#00B4CC",
      note:     "UAE already routes crude to Fujairah. Fujairah is outside Hormuz — Indian Ocean–facing terminal.",
    },
  ];

  return (
    <DraggablePanel
      title="Supply Routes"
      subtitle="Maritime + pipeline bypass options · Live status"
      onClose={onClose}
      defaultPos={{ top: 70, left: 960 }}
      width={330}
      accentColor="#22c55e"
    >
      <div className="px-3 py-2.5 space-y-0">

        {/* Route comparison table */}
        <PDivider label="Route comparison" />
        <div className="space-y-2.5">
          {routes.map((r) => {
            const mv = ROUTE_MAP_VIEW[r.name];
            return (
              <div key={r.name} className="pb-2 border-b border-white/[0.05] last:border-0 last:pb-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono-data text-[8px] text-white/25 border border-white/[0.08] px-1 rounded-sm">{r.type}</span>
                    <span className="font-mono-data text-[10px] font-semibold text-white/82">{r.name}</span>
                  </div>
                  <span className="font-mono-data text-[8px] font-semibold px-1.5 py-0.5 rounded-sm shrink-0 ml-1" style={{ color: r.color, background: `${r.color}20` }}>{r.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 mb-1">
                  <div>
                    <div className="font-mono-data text-[7px] text-white/25 uppercase">Extra Time</div>
                    <div className="font-mono-data text-[9px] text-white/60">{r.days} days</div>
                  </div>
                  <div>
                    <div className="font-mono-data text-[7px] text-white/25 uppercase">Cost/Voyage</div>
                    <div className="font-mono-data text-[9px] text-white/60">{r.extraCostMvoy > 0 ? `+$${r.extraCostMvoy}M` : "Baseline"}</div>
                  </div>
                  <div>
                    <div className="font-mono-data text-[7px] text-white/25 uppercase">$/bbl extra</div>
                    <div className="font-mono-data text-[9px]" style={{ color: r.bblPremium > 0 ? "#f97316" : "rgba(255,255,255,0.4)" }}>{r.bblPremium > 0 ? `+$${r.bblPremium}` : "—"}</div>
                  </div>
                </div>
                <div className="font-mono-data text-[8px] text-white/25">Cap: {r.capacity}</div>
                <div className="font-mono-data text-[8px] text-white/35 mt-0.5 leading-relaxed">{r.note}</div>
                {mv && (
                  <button
                    type="button"
                    onClick={() => onMapFocus(mv.lat, mv.lon, mv.zoom)}
                    className="mt-1.5 font-mono-data text-[8px] text-hormuz-teal/80 hover:text-hormuz-teal border border-hormuz-teal/25 rounded-sm px-2 py-0.5 w-full text-left transition-colors"
                  >
                    Show on map →
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Pipeline bypass capacity summary */}
        <PDivider label="Combined bypass capacity (if activated)" />
        <PRow label="Saudi SCPX + UAE pipeline" value="~6.3M bbl/day" vc="#C9A84C" />
        <PRow label="% of Hormuz baseline" value="~30%" vc="#f97316" />
        <PRow label="Gap if Hormuz closes" value="~14.7M bbl/day deficit" vc="#CC2936" />
        <PRow label="Pipeline ramp-up time" value="~1–2 weeks (SCPX)" />

        {/* SPR buffer */}
        <PDivider label="Strategic reserve buffer (days at current flow)" />
        {SPR_DATA.map((s) => {
          const totalDays = s.govDays + s.comDays;
          const color = totalDays < 30 ? "#CC2936" : totalDays < 60 ? "#f97316" : totalDays < 90 ? "#C9A84C" : "#22c55e";
          return (
            <div key={s.country} className="flex items-center gap-2 py-0.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-mono-data text-[9px] text-white/70">{s.country}</span>
                  <span className="font-mono-data text-[9px] font-semibold" style={{ color }}>{totalDays}d</span>
                </div>
                <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden mt-0.5">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, totalDays / 1.8)}%`, background: color }} />
                </div>
                <div className="font-mono-data text-[7px] text-white/20 mt-0.5">
                  Gov {s.govDays}d + Commercial {s.comDays}d · {s.hormuzPct}% Hormuz dep.
                </div>
              </div>
            </div>
          );
        })}

        {/* LNG note */}
        <PDivider label="LNG — no pipeline alternative" />
        <PRow label="Qatar LNG if Hormuz closes" value="FULLY SHUT IN" vc="#CC2936" />
        <PRow label="Japan LNG storage" value="~20 days only" vc="#f97316" />
        <PRow label="South Korea LNG storage" value="~12 days" vc="#CC2936" />
        <PRow label="Global LNG reroute" value="~10 days longer via Cape" />
        <div className="mt-1.5">
          <p className="font-mono-data text-[8px] text-white/22 leading-relaxed">
            Unlike crude oil, LNG cannot be piped — Qatar&apos;s 100M tonne/yr export is entirely dependent on Hormuz. LNG storage is costly and nations hold minimal buffer.
          </p>
        </div>

      </div>
    </DraggablePanel>
  );
}

function CountryRiskOverlay({ level, trade, onClose }: { level: ThreatLevel; trade: TradeData | null; onClose: () => void }) {
  // Use trade API importers if available, otherwise fall back to embedded baseline
  const countries = trade?.importers ? [
    ...trade.importers,
    { country: "Germany", rank: 9, hormuzPct: 15, volumeMbbl: 600,  label: "Diversified EU supply" },
    { country: "Brazil",  rank: 10, hormuzPct:  4, volumeMbbl: 150,  label: "Net exporter, low dep." },
  ] : [
    { country: "Japan",       rank: 3, hormuzPct: 88, volumeMbbl: 3_400, label: "Near-total dependency" },
    { country: "Taiwan",      rank: 6, hormuzPct: 76, volumeMbbl:   950, label: "Highly exposed" },
    { country: "South Korea", rank: 4, hormuzPct: 72, volumeMbbl: 2_800, label: "Major refining hub" },
    { country: "India",       rank: 2, hormuzPct: 58, volumeMbbl: 2_200, label: "Growing exposure" },
    { country: "Singapore",   rank: 5, hormuzPct: 55, volumeMbbl: 1_100, label: "Refining & re-export" },
    { country: "China",       rank: 1, hormuzPct: 38, volumeMbbl: 5_300, label: "Largest volume importer" },
    { country: "Germany",     rank: 9, hormuzPct: 15, volumeMbbl:   600, label: "Diversified EU supply" },
    { country: "USA",         rank: 8, hormuzPct:  2, volumeMbbl:   100, label: "Mostly strategic interest" },
    { country: "Brazil",      rank: 10, hormuzPct:  4, volumeMbbl:  150, label: "Net exporter, low dep." },
  ];

  // Sort by dependency descending
  const sorted = [...countries].sort((a, b) => b.hormuzPct - a.hormuzPct);

  function bc(dep: number) {
    if (dep >= 70 && level >= 2) return "#CC2936";
    if (dep >= 50 && level >= 1) return "#f97316";
    if (dep >= 30) return "#C9A84C";
    return "#22c55e";
  }
  const fmtVol = (mbbl: number) => mbbl >= 1000 ? `~${(mbbl/1000).toFixed(1)}M bbl/day` : `~${mbbl}K bbl/day`;

  return (
    <DraggablePanel title="Country Exposure" subtitle="Hormuz import dependency by nation" onClose={onClose} defaultPos={{ top: 265, left: 60 }} width={280} accentColor="#CC2936">
      <div className="px-3 py-2 space-y-2">
        {sorted.map((c) => {
          const color = bc(c.hormuzPct);
          return (
            <div key={c.country}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-mono-data text-[10px] text-white/78">{c.country}</span>
                <span className="font-mono-data text-[10px] font-semibold" style={{ color }}>{c.hormuzPct}%</span>
              </div>
              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-0.5">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.hormuzPct}%`, backgroundColor: color }} />
              </div>
              <div className="font-mono-data text-[8px] text-white/25">{fmtVol(c.volumeMbbl)} · {c.label}</div>
            </div>
          );
        })}
        <PDivider label="Closure scenario (global)" />
        <PRow label="Global GDP at risk / yr"  value="~$0.6–1.1T" />
        <PRow label="Insurance cost surge"      value={level >= 2 ? "+400–800%" : "+50–150%"} />
        <PRow label="Supply gap if full close"  value="~20M bbl/day deficit" />
        {trade && (
          <div className="mt-1 pt-1 border-t border-white/[0.05]">
            <p className="font-mono-data text-[8px] text-white/18">Source: {trade.source} · {trade.dataMonth}</p>
          </div>
        )}
      </div>
    </DraggablePanel>
  );
}

/** 7th overlay — news search with topic/source filters */
function NewsSearchOverlay({ items, onClose }: { items: NewsItem[]; onClose: () => void }) {
  const [query, setQuery]           = useState("");
  const [activeTopic, setTopic]     = useState<string | null>(null);
  const [activeSource, setSource]   = useState<string | null>(null);

  const sources = [...new Set(items.map((i) => i.source.split(" ")[0].toUpperCase()))];
  const filtered = filterNews(items, query, activeTopic, activeSource);

  return (
    <DraggablePanel title="Intelligence Search" subtitle="Filter across all monitored news feeds" onClose={onClose} defaultPos={{ top: 70, left: 350 }} width={340} accentColor="#00B4CC">
      <div className="px-3 pt-2.5 pb-1 border-b border-white/[0.06] space-y-2">
        {/* Search input */}
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search headlines, regions, commodities…"
            className="w-full bg-white/[0.05] border border-white/[0.10] rounded-sm px-3 py-1.5 font-mono-data text-[10px] text-white/80 placeholder-white/25 focus:outline-none focus:border-hormuz-teal/50"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 font-mono-data text-[12px]">×</button>
          )}
        </div>

        {/* Topic pills */}
        <div className="flex flex-wrap gap-1">
          {NEWS_TOPICS.map((t) => (
            <button
              key={t.label}
              onClick={() => setTopic(activeTopic === t.label ? null : t.label)}
              className="font-mono-data text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-sm border transition-colors"
              style={{
                borderColor: activeTopic === t.label ? "#00B4CC66" : "rgba(255,255,255,0.08)",
                background:  activeTopic === t.label ? "#00B4CC18" : "transparent",
                color:       activeTopic === t.label ? "#00B4CC"   : "rgba(255,255,255,0.35)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Source pills */}
        {sources.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sources.map((s) => (
              <button
                key={s}
                onClick={() => setSource(activeSource === s ? null : s)}
                className="font-mono-data text-[8px] uppercase tracking-wider px-2 py-0.5 rounded-sm border transition-colors"
                style={{
                  borderColor: activeSource === s ? "#C9A84C66" : "rgba(255,255,255,0.06)",
                  background:  activeSource === s ? "#C9A84C18" : "transparent",
                  color:       activeSource === s ? "#C9A84C"   : "rgba(255,255,255,0.28)",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="font-mono-data text-[8px] text-white/20">
          {filtered.length} of {items.length} items
          {(query || activeTopic || activeSource) && (
            <button onClick={() => { setQuery(""); setTopic(null); setSource(null); }} className="ml-2 text-white/35 hover:text-white/60 underline">clear</button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="divide-y divide-white/[0.04] overflow-y-auto" style={{ maxHeight: 310 }}>
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center font-mono-data text-[10px] text-white/20">No items match filters</div>
        )}
        {filtered.map((item, i) => (
          <a
            key={`${item.link}-${i}`}
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="group flex items-start gap-2 px-3 py-2 hover:bg-white/[0.025] transition-colors"
          >
            <span className="shrink-0 font-mono-data text-[7px] bg-white/[0.05] text-white/30 px-1 py-0.5 rounded-sm uppercase mt-0.5">
              {item.source.split(" ")[0].slice(0, 6)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-mono-data text-[10px] text-white/70 group-hover:text-white/90 leading-snug line-clamp-2 transition-colors">
                {item.title}
              </p>
            </div>
            <span className="shrink-0 font-mono-data text-[8px] text-white/20 mt-0.5">{timeAgo(item.pubDate)}</span>
          </a>
        ))}
      </div>
    </DraggablePanel>
  );
}

// ─── Market Signals overlay (8th panel) ──────────────────────────────────────

type SignalSeverity = "BULLISH" | "BEARISH" | "ALERT" | "INFO" | "NEUTRAL";

type MarketSignal = {
  title: string;
  detail: string;
  severity: SignalSeverity;
  value?: string;
};

const SEV_COLOR: Record<SignalSeverity, string> = {
  BULLISH: "#22c55e",
  BEARISH: "#CC2936",
  ALERT:   "#f97316",
  INFO:    "#00B4CC",
  NEUTRAL: "#C9A84C",
};

function deriveSignals(
  oil: OilData | null,
  freight: FreightData | null,
  shipping: ShippingData | null,
  trade: TradeData | null,
  level: ThreatLevel,
): MarketSignal[] {
  const signals: MarketSignal[] = [];
  const brent = oil?.brent?.price;
  const wti   = oil?.wti?.price;

  // 1. Brent–WTI spread analysis
  if (brent && wti) {
    const spread = brent - wti;
    const spreadColor: SignalSeverity = spread > 5 ? "ALERT" : spread > 3 ? "NEUTRAL" : "INFO";
    signals.push({
      title: "Brent–WTI Spread",
      detail: spread > 5
        ? "Elevated spread signals Gulf supply risk premium above normal — physical market pricing in disruption."
        : spread > 3
        ? "Spread above long-run mean (~$2–3). Gulf supply anxiety mildly elevated."
        : "Spread within normal range. No Gulf-specific oil premium detected.",
      severity: spreadColor,
      value: `$${spread.toFixed(2)}/bbl (avg ~$2–3)`,
    });
  }

  // 2. Tanker stock vs oil decoupling
  const froChg = freight?.frontline?.changePct;
  const dhtChg = freight?.dht?.changePct;
  const brentChg = oil?.brent?.changePct;
  if (froChg != null && dhtChg != null && brentChg != null) {
    const avgTanker = (froChg + dhtChg) / 2;
    const decoupling = avgTanker - brentChg;
    if (decoupling > 1.5) {
      signals.push({
        title: "Tanker Stock Decoupling",
        detail: `FRO +${froChg.toFixed(1)}% / DHT +${dhtChg.toFixed(1)}% outpacing Brent (${brentChg.toFixed(1)}%). Market is separately pricing charter rate demand — implies traders expect rerouting, not just price shock.`,
        severity: "ALERT",
        value: `+${decoupling.toFixed(1)}pp tanker vs Brent`,
      });
    } else if (avgTanker > 0 && brentChg < 0) {
      signals.push({
        title: "Tanker/Oil Divergence",
        detail: "Tanker stocks rising while oil falls. Unusual — suggests supply route disruption risk being priced independently of commodity demand.",
        severity: "ALERT",
        value: `Tankers +${avgTanker.toFixed(1)}%, Brent ${brentChg.toFixed(1)}%`,
      });
    } else {
      signals.push({
        title: "Tanker Correlation",
        detail: "Tanker stocks moving in line with oil. No unusual decoupling signal today.",
        severity: "NEUTRAL",
        value: `Tankers avg ${avgTanker.toFixed(1)}% vs Brent ${brentChg.toFixed(1)}%`,
      });
    }
  }

  // 3. Per-barrel Cape rerouting premium
  if (shipping?.capeCostExtra) {
    const cargoBbl = 2_000_000; // ~2M bbl VLCC cargo
    const bblPremium = shipping.capeCostExtra / cargoBbl;
    const sev: SignalSeverity = bblPremium > 3 ? "BEARISH" : bblPremium > 1.5 ? "ALERT" : "NEUTRAL";
    signals.push({
      title: "Cape Reroute $/bbl Premium",
      detail: `At current HSFO ($${shipping.hsfoProxy}/MT) and VLCC rates, routing via Cape of Good Hope costs an extra $${bblPremium.toFixed(2)}/bbl vs direct Hormuz transit. This becomes embedded in crude pricing if rerouting becomes norm.`,
      severity: sev,
      value: `$${bblPremium.toFixed(2)}/bbl extra`,
    });
  }

  // 4. VLCC rate vs 5-year baseline
  if (shipping?.vlccRate) {
    const baseline = 40_000; // ~$40K/day peacetime
    const premium = Math.round(((shipping.vlccRate - baseline) / baseline) * 100);
    const sev: SignalSeverity = premium > 150 ? "BEARISH" : premium > 80 ? "ALERT" : premium > 20 ? "NEUTRAL" : "INFO";
    signals.push({
      title: "VLCC Rate vs Baseline",
      detail: premium > 150
        ? `Charter rates ${premium}% above peacetime baseline. Tanker owners capturing crisis premium — spot market extremely tight. Charterers locked into expensive voyages.`
        : premium > 80
        ? `Rates ${premium}% above peacetime — owners holding pricing power. Charterers facing significant cost pressure.`
        : `Rates ${premium}% above peacetime. Elevated but not crisis-level.`,
      severity: sev,
      value: `$${Math.round(shipping.vlccRate/1000)}K/day (${premium > 0 ? "+" : ""}${premium}% vs baseline)`,
    });
  }

  // 5. War risk breakeven vs Cape rerouting
  if (shipping?.warRisk && brent && shipping.capeCostExtra) {
    const cargoBbl = 2_000_000;
    const cargoValue = cargoBbl * brent;
    const warCost = cargoValue * (shipping.warRisk / 100); // $ war premium per voyage
    const capeCost = shipping.capeCostExtra;
    const cheaper = capeCost < warCost ? "Cape" : "Hormuz (war risk)";
    const diff = Math.abs(capeCost - warCost);
    signals.push({
      title: "Route Breakeven Analysis",
      detail: `At current war risk (${shipping.warRiskLabel}) on $${(cargoValue/1e9).toFixed(1)}B cargo, war premium = $${(warCost/1e6).toFixed(1)}M vs Cape cost $${(capeCost/1e6).toFixed(1)}M. ${cheaper === "Cape" ? "Cape rerouting is cheaper — rational carriers should already divert." : "Hormuz transit still cheaper despite war risk — carriers will continue direct routing."}`,
      severity: cheaper === "Cape" ? "ALERT" : "INFO",
      value: `${cheaper} cheaper by $${(diff/1e6).toFixed(1)}M/voyage`,
    });
  }

  // 6. Supply disruption severity
  if (shipping?.supplyFlowBbl) {
    const baseline = 21_000_000;
    const pctOnline = Math.round((shipping.supplyFlowBbl / baseline) * 100);
    const disrupted = 100 - pctOnline;
    if (disrupted > 0) {
      const gdpDaily = 2_000_000_000; // ~$2B/day global GDP exposure per 1M bbl/day shortfall
      const dailyImpact = ((baseline - shipping.supplyFlowBbl) / 1_000_000) * gdpDaily;
      signals.push({
        title: "Estimated Supply Disruption",
        detail: `Flow at ~${pctOnline}% of normal. ${disrupted}% shortfall vs baseline 21M bbl/day implies approximately $${(dailyImpact/1e9).toFixed(1)}B/day in global economic exposure at current oil price.`,
        severity: disrupted > 40 ? "BEARISH" : disrupted > 20 ? "ALERT" : "NEUTRAL",
        value: `${shipping.supplyFlowLabel} (${disrupted > 0 ? `-${disrupted}%` : "normal"})`,
      });
    }
  }

  // 7. Importer vulnerability under current threat
  if (trade?.importers && level >= 2) {
    const criticalCountries = trade.importers.filter((i) => i.hormuzPct >= 70);
    if (criticalCountries.length > 0) {
      const names = criticalCountries.map((c) => c.country).join(", ");
      signals.push({
        title: "High-Dependency Importer Alert",
        detail: `${names} each source ≥70% of crude through Hormuz. At CRITICAL threat level these nations face immediate strategic energy security decisions. Expect diplomatic pressure and SPR drawdown announcements.`,
        severity: "BEARISH",
        value: `${criticalCountries.length} nations ≥70% exposed`,
      });
    }
  }

  return signals;
}

function MarketSignalsOverlay({
  oil, freight, shipping, trade, level, onClose,
}: {
  oil: OilData | null; freight: FreightData | null; shipping: ShippingData | null;
  trade: TradeData | null; level: ThreatLevel; onClose: () => void;
}) {
  const signals = deriveSignals(oil, freight, shipping, trade, level);
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <DraggablePanel
      title="Market Signals"
      subtitle="Click a row for full rationale · Heuristic signals from live inputs"
      onClose={onClose}
      defaultPos={{ top: 70, left: 960 }}
      width={310}
      accentColor="#f97316"
    >
      <div className="divide-y divide-white/[0.05]">
        {signals.map((sig, i) => {
          const color = SEV_COLOR[sig.severity];
          const open = expanded === i;
          return (
            <div key={i} className="px-3 py-2">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : i)}
                className="w-full text-left rounded-sm px-0 py-0.5 hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <span className="font-mono-data text-[10px] font-semibold text-white/85 leading-tight">{sig.title}</span>
                  <span
                    className="font-mono-data text-[8px] font-semibold px-1.5 py-0.5 rounded-sm shrink-0"
                    style={{ color, background: `${color}20` }}
                  >
                    {sig.severity}
                  </span>
                </div>
                {sig.value && (
                  <div className="font-mono-data text-[10px] mb-0.5" style={{ color }}>{sig.value}</div>
                )}
                <span className="font-mono-data text-[8px] text-white/22">{open ? "Hide detail ▲" : "Full detail ▼"}</span>
              </button>
              {open && (
                <div className="mt-1.5 pl-0 pr-0 pb-1 border-l-2 border-hormuz-teal/40 pl-2">
                  <p className="font-mono-data text-[9px] text-white/50 leading-relaxed">{sig.detail}</p>
                </div>
              )}
            </div>
          );
        })}
        <div className="px-3 py-2 space-y-1">
          <p className="font-mono-data text-[8px] text-white/18 leading-relaxed">
            Heuristic signals from our APIs — not financial advice. Underlying quotes:{" "}
            <a href="https://finance.yahoo.com/quote/BZ%3DF" target="_blank" rel="noreferrer" className="text-hormuz-teal/70 underline">Brent</a>
            {" · "}
            <a href="https://finance.yahoo.com/quote/CL%3DF" target="_blank" rel="noreferrer" className="text-hormuz-teal/70 underline">WTI</a>
            {" · "}
            <a href="https://finance.yahoo.com/quote/FRO" target="_blank" rel="noreferrer" className="text-hormuz-teal/70 underline">FRO</a>
            {" · "}
            <a href="https://www.eia.gov/" target="_blank" rel="noreferrer" className="text-hormuz-teal/70 underline">EIA</a>
            .
          </p>
        </div>
      </div>
    </DraggablePanel>
  );
}

// ─── Overlay toolbar ──────────────────────────────────────────────────────────

type OverlayId = "ais" | "trade" | "rates" | "zones" | "goods" | "risk" | "news" | "signals" | "routes" | "timeline" | "layers";

const TOOLBAR_BTNS: Array<{ id: OverlayId; label: string; color: string; key?: string }> = [
  { id: "ais",      label: "AIS Traffic",         color: "#00B4CC", key: "1" },
  { id: "trade",    label: "Trade Flows",          color: "#C9A84C", key: "2" },
  { id: "routes",   label: "Supply Routes",        color: "#22c55e", key: "3" },
  { id: "rates",    label: "Freight & Rates",      color: "#C9A84C", key: "4" },
  { id: "zones",    label: "Chokepoints",          color: "#22c55e", key: "5" },
  { id: "goods",    label: "Goods Impacted",       color: "#f97316", key: "6" },
  { id: "risk",     label: "Country Exposure",     color: "#CC2936", key: "7" },
  { id: "signals",  label: "Market Signals",       color: "#f97316", key: "8" },
  { id: "news",     label: "Intel Search",         color: "#00B4CC", key: "9" },
  { id: "timeline", label: "Event Timeline",       color: "#a78bfa", key: "0" },
  { id: "layers",   label: "Map Layers",           color: "#00B4CC", key: "L" },
];

const TOOLBAR_GROUPS: Array<{ section: string; ids: OverlayId[] }> = [
  { section: "Live Data",   ids: ["ais", "trade"] },
  { section: "Geography",   ids: ["routes", "zones", "goods", "risk"] },
  { section: "Financial",   ids: ["rates", "signals"] },
  { section: "Intelligence",ids: ["news", "timeline"] },
  { section: "Map",         ids: ["layers"] },
];

function OverlayToolbar({ open, onToggle }: { open: Set<OverlayId>; onToggle: (id: OverlayId) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const mobileBar = useMediaQuery("(max-width: 1023px)", false);

  useEffect(() => {
    try {
      const v = localStorage.getItem("hormuz_toolbar_collapsed");
      if (v !== null) setCollapsed(JSON.parse(v));
    } catch { /* ignore */ }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("hormuz_toolbar_collapsed", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const openCount = TOOLBAR_BTNS.filter((b) => open.has(b.id)).length;

  if (mobileBar) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-[1250] flex flex-col border-t border-white/[0.08] bg-[rgba(6,10,20,0.97)] backdrop-blur-md touch-manipulation pb-[max(6px,env(safe-area-inset-bottom,0px))]">
        <div className="flex items-center justify-between px-2 py-0.5 border-b border-white/[0.05]">
          <span className="font-mono-data text-[8px] text-white/25 uppercase tracking-widest">Panels</span>
          <span className="font-mono-data text-[8px] text-white/20">{openCount} open · swipe →</span>
        </div>
        <div className="flex overflow-x-auto gap-1 px-1.5 py-1.5 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
          {TOOLBAR_BTNS.map((btn) => {
            const isOpen = open.has(btn.id);
            const short =
              btn.id === "ais" ? "AIS"
                : btn.id === "trade" ? "Trade"
                  : btn.id === "routes" ? "Routes"
                    : btn.id === "rates" ? "Rates"
                      : btn.id === "zones" ? "Choke"
                        : btn.id === "goods" ? "Goods"
                          : btn.id === "risk" ? "Risk"
                            : btn.id === "signals" ? "Sig"
                              : btn.id === "news" ? "News"
                                : btn.id === "timeline" ? "Log"
                                  : btn.id === "layers" ? "Map"
                                    : btn.label.slice(0, 4);
            return (
              <button
                key={btn.id}
                type="button"
                onClick={() => onToggle(btn.id)}
                title={`${btn.label}${btn.key ? ` · key ${btn.key}` : ""}`}
                className="shrink-0 flex flex-col items-center justify-center min-w-[3.25rem] min-h-[3rem] rounded-md border transition-colors active:scale-95"
                style={{
                  borderColor: isOpen ? `${btn.color}55` : "rgba(255,255,255,0.08)",
                  background: isOpen ? `${btn.color}18` : "rgba(255,255,255,0.03)",
                }}
              >
                <span className="font-mono-data text-[10px] font-bold leading-none" style={{ color: isOpen ? btn.color : "rgba(255,255,255,0.35)" }}>
                  {btn.key ?? "—"}
                </span>
                <span className="font-mono-data text-[7px] text-white/40 mt-0.5 leading-tight text-center px-0.5">{short}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute left-0 top-0 bottom-0 z-[1200] flex flex-col overflow-hidden"
      style={{
        width: collapsed ? 36 : 160,
        background: "rgba(6,10,20,0.96)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        transition: "width 180ms cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between px-2 h-9 border-b border-white/[0.06] shrink-0">
        {!collapsed && (
          <span className="font-mono-data text-[8px] text-white/20 uppercase tracking-widest select-none">
            Panels {openCount > 0 && <span className="text-hormuz-teal ml-0.5">{openCount}</span>}
          </span>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand panel list" : "Collapse panel list"}
          className="ml-auto font-mono-data text-[10px] text-white/20 hover:text-white/60 transition-colors leading-none px-2 py-2 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 lg:px-1 lg:py-1 flex items-center justify-center"
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* Scrollable panel groups */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1.5">
        {TOOLBAR_GROUPS.map((group, gi) => {
          const btns = group.ids.map((id) => TOOLBAR_BTNS.find((b) => b.id === id)!).filter(Boolean);
          return (
            <div key={group.section} className={gi > 0 ? "mt-2.5 pt-2.5 border-t border-white/[0.05]" : ""}>
              {!collapsed && (
                <div className="px-2.5 mb-1 font-mono-data text-[7px] text-white/18 uppercase tracking-widest select-none">
                  {group.section}
                </div>
              )}
              {btns.map((btn) => {
                const isOpen = open.has(btn.id);
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => onToggle(btn.id)}
                    title={`${btn.label}${btn.key ? ` [${btn.key}]` : ""}`}
                    className="w-full flex items-center gap-2 px-2.5 py-2 lg:py-1.5 transition-colors duration-100 touch-manipulation"
                    style={{ background: isOpen ? `${btn.color}12` : "transparent" }}
                    onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = isOpen ? `${btn.color}12` : "transparent"; }}
                  >
                    {/* Active dot */}
                    <div
                      className="shrink-0 rounded-full transition-colors"
                      style={{
                        width: 5, height: 5,
                        background: isOpen ? btn.color : "rgba(255,255,255,0.15)",
                        boxShadow: isOpen ? `0 0 4px ${btn.color}` : "none",
                      }}
                    />
                    {!collapsed && (
                      <>
                        <span
                          className="flex-1 font-mono-data text-[9px] text-left truncate transition-colors"
                          style={{ color: isOpen ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.38)" }}
                        >
                          {btn.label}
                        </span>
                        {btn.key && (
                          <span className="font-mono-data text-[7px] text-white/12 border border-white/[0.07] px-1 rounded-sm shrink-0 select-none">
                            {btn.key}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer — Esc hint */}
      {!collapsed && (
        <div className="shrink-0 px-2.5 py-2 border-t border-white/[0.05]">
          <div className="font-mono-data text-[7px] text-white/12">
            <kbd className="border border-white/[0.07] px-1 rounded-sm">Esc</kbd> close all &nbsp;
            <kbd className="border border-white/[0.07] px-1 rounded-sm">?</kbd> shortcuts
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Status Bar ───────────────────────────────────────────────────────────────

function StatusBar({
  threat, oil, vessels, now, shipping, threatTrend, threatCountdown, oilCountdown, incidentCount24h,
}: {
  threat: ThreatData | null; oil: OilData | null; vessels: VesselData | null;
  now: Date | null; shipping: ShippingData | null;
  threatTrend: string; threatCountdown: number | null; oilCountdown: number | null;
  incidentCount24h: number;
}) {
  const level = Math.min(3, Math.max(0, Number(threat?.level) || 0)) as ThreatLevel;
  const lc = buildLogistics(level, shipping);
  const threatColor = THREAT_COLOR[threat?.label ?? "LOW"];

  const spread = (oil?.brent?.price && oil?.wti?.price)
    ? (oil.brent.price - oil.wti.price)
    : null;
  const spreadSignal = spread == null ? null : spread > 5 ? "↑ elevated" : spread < 2 ? "↓ tight" : "normal";
  const spreadColor  = spread == null ? undefined : spread > 5 ? "#f97316" : spread > 3 ? "#C9A84C" : "rgba(255,255,255,0.45)";

  function fmtCountdown(s: number | null) {
    if (s == null || s <= 0) return null;
    return s >= 60 ? `${Math.floor(s/60)}m${s%60}s` : `${s}s`;
  }

  return (
    <div className="min-h-[48px] lg:h-11 shrink-0 flex items-center border-b border-white/[0.08] bg-hormuz-deep/95 backdrop-blur-sm px-2 sm:px-4 overflow-x-auto scrollbar-none gap-0 pt-[env(safe-area-inset-top,0px)] touch-manipulation">
      <Link href="/" className="flex items-center gap-2 mr-3 sm:mr-5 shrink-0 hover:opacity-80 transition-opacity py-2 px-1 -my-1 rounded-sm min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 lg:p-0 lg:my-0">
        <svg width="16" height="16" viewBox="0 0 22 22" fill="none" className="text-hormuz-gold">
          <circle cx="11" cy="11" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="11" y1="0"  x2="11" y2="6"  stroke="currentColor" strokeWidth="1.5"/>
          <line x1="11" y1="16" x2="11" y2="22" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="0"  y1="11" x2="6"  y2="11" stroke="currentColor" strokeWidth="1.5"/>
          <line x1="16" y1="11" x2="22" y2="11" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
        <span className="font-mono-data text-[11px] font-medium text-white/70 tracking-widest">HORMUZ</span>
      </Link>
      <div className="h-4 w-px bg-white/10 mr-5 shrink-0" />
      <div className="flex items-center gap-4 flex-1">

        {/* Threat + trend arrow */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: threatColor }} />
          <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">Threat</span>
          <span className="font-mono-data text-[11px] font-semibold" style={{ color: threatColor }}>{threat?.label ?? "—"}</span>
          <span className="font-mono-data text-[10px]" style={{ color: threatTrend === "↑" ? "#CC2936" : threatTrend === "↓" ? "#22c55e" : "rgba(255,255,255,0.25)" }}>{threatTrend}</span>
          {fmtCountdown(threatCountdown) && (
            <span className="font-mono-data text-[8px] text-white/18" title="Next refresh">{fmtCountdown(threatCountdown)}</span>
          )}
        </div>
        <div className="h-3 w-px bg-white/10 shrink-0" />

        {/* Chokepoint */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">Choke</span>
          <span className="font-mono-data text-[11px] font-semibold" style={{ color: lc.chopkeyColor }}>{lc.chokepoint}</span>
        </div>
        <div className="h-3 w-px bg-white/10 shrink-0" />

        {/* Brent */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">Brent</span>
          {oil?.brent
            ? <><span className="font-mono-data text-[11px] text-white">${oil.brent.price.toFixed(2)}</span><span className={`font-mono-data text-[9px] ${oil.brent.change >= 0 ? "text-green-400" : "text-hormuz-red"}`}>{oil.brent.change >= 0 ? "▲" : "▼"}{Math.abs(oil.brent.changePct).toFixed(1)}%</span></>
            : <span className="font-mono-data text-[11px] text-white/20">—</span>}
          {fmtCountdown(oilCountdown) && <span className="font-mono-data text-[8px] text-white/18">{fmtCountdown(oilCountdown)}</span>}
        </div>
        <div className="h-3 w-px bg-white/10 shrink-0" />

        {/* WTI */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">WTI</span>
          {oil?.wti
            ? <><span className="font-mono-data text-[11px] text-white">${oil.wti.price.toFixed(2)}</span><span className={`font-mono-data text-[9px] ${oil.wti.change >= 0 ? "text-green-400" : "text-hormuz-red"}`}>{oil.wti.change >= 0 ? "▲" : "▼"}{Math.abs(oil.wti.changePct).toFixed(1)}%</span></>
            : <span className="font-mono-data text-[11px] text-white/20">—</span>}
        </div>
        <div className="h-3 w-px bg-white/10 shrink-0" />

        {/* Brent–WTI Spread */}
        {spread != null && (
          <>
            <div className="flex items-center gap-1 shrink-0" title="Brent–WTI spread. >$5 signals Gulf supply premium.">
              <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">Spread</span>
              <span className="font-mono-data text-[11px] font-medium" style={{ color: spreadColor }}>${spread.toFixed(2)}</span>
              <span className="font-mono-data text-[9px]" style={{ color: spreadColor }}>{spreadSignal}</span>
            </div>
            <div className="h-3 w-px bg-white/10 shrink-0" />
          </>
        )}

        {/* War Risk */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">War Risk</span>
          <span className="font-mono-data text-[11px] text-hormuz-gold">{lc.warRisk}</span>
          {shipping && <span className="w-1 h-1 rounded-full bg-hormuz-teal shrink-0" title="Live computed" />}
        </div>
        <div className="h-3 w-px bg-white/10 shrink-0" />

        {/* Vessels */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">Vessels</span>
          {vessels?.noKey
            ? <span className="font-mono-data text-[10px] text-white/25 italic">no key</span>
            : <span className="font-mono-data text-[11px] text-hormuz-teal">{vessels?.count ?? "—"}</span>}
          {!vessels?.noKey && <span className="font-mono-data text-[10px] text-white/30">AIS</span>}
        </div>
        <div className="h-3 w-px bg-white/10 shrink-0" />

        {/* Incident count */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">Intel/24h</span>
          <span className={`font-mono-data text-[11px] font-semibold ${incidentCount24h >= 5 ? "text-hormuz-red" : incidentCount24h >= 2 ? "text-hormuz-gold" : "text-white/50"}`}>
            {incidentCount24h}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 ml-2 sm:ml-4 shrink-0">
        <span className="hidden lg:block font-mono-data text-[10px] text-white/30">{now ? now.toUTCString().slice(17, 25) : "—"} UTC</span>
        <nav className="hidden md:flex items-center gap-1">
          <Link href="/"        className="font-mono-data text-[10px] text-white/30 hover:text-white/70 px-2 py-1 transition-colors">Home</Link>
          <Link href="/markets" className="font-mono-data text-[10px] text-white/30 hover:text-white/70 px-2 py-1 transition-colors">Markets</Link>
        </nav>
        <nav className="flex md:hidden items-center gap-1">
          <Link href="/markets" className="font-mono-data text-[9px] text-hormuz-gold/80 hover:text-hormuz-gold border border-hormuz-gold/25 rounded-sm px-2 py-2 min-h-[40px] flex items-center">Markets</Link>
        </nav>
        <WalletConnect />
      </div>
    </div>
  );
}

// ─── Right panel sub-components ───────────────────────────────────────────────

function ImpactBar({ score, level }: { score: number; level: ThreatLevel }) {
  const lc = THREAT_BANDS[level];
  return (
    <div className="px-4 py-3 border-b border-white/[0.06]">
      <div className="flex justify-between items-center mb-2">
        <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">Logistics Impact Index</span>
        <span className="font-mono-data text-[11px] font-semibold" style={{ color: lc.chopkeyColor }}>{score}/100</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${score}%`, backgroundColor: lc.chopkeyColor }} />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1">
        {["Normal", "Elevated", "Disrupted", "Crisis"].map((seg, i) => (
          <div key={seg} className={`text-center font-mono-data text-[8px] uppercase tracking-wider ${i * 25 < score && score <= (i + 1) * 25 ? "text-white/60" : "text-white/15"}`}>{seg}</div>
        ))}
      </div>
    </div>
  );
}

function RouteStatus({ level, lc, news }: { level: ThreatLevel; lc: ReturnType<typeof buildLogistics>; news: NewsItem[] }) {
  const corpus = news.map((n) => (n.title + " " + (n.snippet ?? "")).toLowerCase()).join(" ");
  const pipelineNews = ["pipeline", "scpx", "petroline", "yanbu", "habshan", "kirkuk", "ceyhan"].some((kw) => corpus.includes(kw));

  const routes = [
    { name: "Strait of Hormuz",      desc: "Direct · 0 additional days",                                       status: lc.chokepoint,                             color: lc.chopkeyColor,                           primary: true  },
    { name: "Red Sea / Suez",         desc: "Via Bab el-Mandeb → Suez · +8 days",                               status: lc.suezNote,                               color: level >= 1 ? "#C9A84C" : "#22c55e",        primary: false },
    { name: "Cape of Good Hope",      desc: lc.capeDelay ? `Full bypass · ${lc.capeDelay}` : "Available · +19 days", status: lc.rerouting ? "ACTIVE REROUTE" : "CONTINGENCY", color: lc.rerouting ? "#f97316" : "rgba(255,255,255,0.3)", primary: false },
    { name: "Saudi SCPX Pipeline",    desc: "Abqaiq → Yanbu · 4.8M bbl/day capacity",                          status: pipelineNews ? "MENTIONED" : "STANDBY",    color: pipelineNews ? "#C9A84C" : "rgba(255,255,255,0.25)", primary: false },
    { name: "UAE Habshan Pipeline",   desc: "Abu Dhabi → Fujairah · 1.5M bbl/day",                              status: "OPERATIONAL",                             color: "#00B4CC",                                  primary: false },
  ];
  return (
    <div className="px-4 py-3 border-b border-white/[0.06]">
      <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest block mb-2.5">Trade Route Status</span>
      <div className="space-y-1.5">
        {routes.map((r) => (
          <div key={r.name} className={`flex items-center justify-between py-1.5 px-3 rounded-sm ${r.primary ? "bg-white/[0.04] border border-white/[0.06]" : "bg-white/[0.015]"}`}>
            <div>
              <div className="font-mono-data text-[10px] text-white/75">{r.name}</div>
              <div className="font-mono-data text-[8px] text-white/28 mt-0.5">{r.desc}</div>
            </div>
            <span className="font-mono-data text-[9px] font-semibold shrink-0 ml-2" style={{ color: r.color }}>{r.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortStatusPanel({ news }: { news: NewsItem[] }) {
  return (
    <div className="px-4 py-3 border-b border-white/[0.06]">
      <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest block mb-2.5">Key Port Status</span>
      <div className="space-y-1.5">
        {RIGHT_PANEL_PORTS.map((p) => {
          const alerted = portAlerted(p.keywords, news);
          return (
            <div key={p.name} className="flex items-center justify-between py-1">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${alerted ? "animate-pulse" : ""}`} style={{ backgroundColor: alerted ? "#CC2936" : "#22c55e" }} />
                <span className="font-mono-data text-[11px] text-white/60">{p.name}</span>
              </div>
              <span className={`font-mono-data text-[10px] font-semibold ${alerted ? "text-hormuz-red" : "text-green-400"}`}>{alerted ? "ALERT" : "OPERATIONAL"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SupplyPanel({ lc, oil, shipping }: { lc: ReturnType<typeof buildLogistics>; oil: OilData | null; shipping: ShippingData | null }) {
  const metrics = [
    { label: "Estimated daily flow",     value: lc.supplyFlow,     live: !!shipping },
    { label: "Freight rate impact",      value: lc.freightImpact,  live: !!shipping },
    { label: "War risk insurance",        value: lc.warRisk,        live: !!shipping },
    { label: "VLCC spot rate (est.)",    value: lc.vlccRate,       live: !!shipping },
    { label: "Cape reroute cost (est.)", value: lc.capeCost,       live: !!shipping },
    { label: "HSFO bunker proxy",        value: shipping?.hsfoProxy ? `$${shipping.hsfoProxy}/MT` : "—", live: !!shipping },
    { label: "Nat gas (Henry Hub)",      value: oil?.ng ? `$${oil.ng.price.toFixed(3)}/MMBtu` : "—", live: !!oil },
  ];
  return (
    <div className="px-4 py-3 border-b border-white/[0.06]">
      <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest block mb-2.5">Supply Chain Indicators</span>
      <div className="space-y-2">
        {metrics.map((m) => (
          <div key={m.label} className="flex justify-between items-start gap-2">
            <span className="font-mono-data text-[10px] text-white/30 leading-tight">{m.label}</span>
            <div className="flex items-center gap-1 shrink-0 max-w-[60%]">
              {m.live && <span className="w-1 h-1 rounded-full bg-hormuz-teal shrink-0" title="Live computed" />}
              <span className="font-mono-data text-[10px] text-white/75 text-right leading-tight">{m.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TIME_RANGES = ["6H", "24H", "7D", "ALL"] as const;
type TimeRange = typeof TIME_RANGES[number];

function timeRangeMs(r: TimeRange): number | null {
  if (r === "6H")  return 6  * 60 * 60 * 1000;
  if (r === "24H") return 24 * 60 * 60 * 1000;
  if (r === "7D")  return 7  * 24 * 60 * 60 * 1000;
  return null;
}

/** Copy formatted share text to clipboard */
function shareItem(item: NewsItem, severity: string) {
  const txt = `[${severity}] ${item.source.split(" ")[0]}: ${item.title}\nVia HORMUZ Intel — https://hormuz.live/monitor`;
  navigator.clipboard.writeText(txt).catch(() => {});
}

/** Right-panel news feed with inline search + topic/source/time filter + severity badges */
function IntelFeed({ items, mapHighlightId }: { items: NewsItem[]; mapHighlightId?: string | null }) {
  const [query, setQuery]           = useState("");
  const [activeTopic, setTopic]     = useState<string | null>(null);
  const [activeSource, setSource]   = useState<string | null>(null);
  const [timeRange, setTimeRange]   = useState<TimeRange>("ALL");
  const [copiedIdx, setCopiedIdx]   = useState<number | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const sources = [...new Set(items.map((i) => i.source.split(" ")[0].toUpperCase()))];

  // Time range filter
  const rangeMs = timeRangeMs(timeRange);
  const timeFiltered = rangeMs
    ? items.filter((i) => i.pubDate && Date.now() - new Date(i.pubDate).getTime() <= rangeMs)
    : items;

  const filtered = filterNews(timeFiltered, query, activeTopic, activeSource);

  // Count by severity
  const criticalCount = filtered.filter((i) => scoreSeverity(i.title + " " + i.snippet) === "CRITICAL").length;

  useLayoutEffect(() => {
    if (!mapHighlightId || !listScrollRef.current) return;
    const nodes = listScrollRef.current.querySelectorAll<HTMLElement>("[data-intel-id]");
    for (const el of nodes) {
      if (el.dataset.intelId === mapHighlightId) {
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        break;
      }
    }
  }, [mapHighlightId, filtered]);

  return (
    <div className="px-4 py-3 flex-1 min-h-0 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-hormuz-teal animate-pulse" />
          <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">Live Intel Feed</span>
          {criticalCount > 0 && (
            <span className="font-mono-data text-[8px] bg-hormuz-red/20 text-hormuz-red border border-hormuz-red/30 px-1 py-0.5 rounded-sm">
              {criticalCount} CRIT
            </span>
          )}
        </div>
        <span className="font-mono-data text-[9px] text-white/20">{filtered.length}/{items.length}</span>
      </div>

      {/* Search input */}
      <div className="relative mb-2 shrink-0">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search feed…"
          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-sm px-2.5 py-2 sm:py-1 font-mono-data text-[10px] text-white/75 placeholder-white/20 focus:outline-none focus:border-hormuz-teal/40 transition-colors min-h-[44px] sm:min-h-0 touch-manipulation"
        />
        {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 text-[12px]">×</button>}
      </div>

      {/* Time range pills */}
      <div className="flex gap-1 mb-2 shrink-0">
        {TIME_RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setTimeRange(r)}
            className="font-mono-data text-[7px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border transition-colors"
            style={{
              borderColor: timeRange === r ? "#a78bfa55" : "rgba(255,255,255,0.07)",
              background:  timeRange === r ? "#a78bfa14" : "transparent",
              color:       timeRange === r ? "#a78bfa"   : "rgba(255,255,255,0.28)",
            }}
          >{r}</button>
        ))}
        <div className="flex-1" />
        <span className="font-mono-data text-[7px] text-white/20 self-center">{filtered.length} items</span>
      </div>

      {/* Topic quick-filters */}
      <div className="flex flex-wrap gap-1 mb-2 shrink-0">
        {NEWS_TOPICS.map((t) => (
          <button
            key={t.label}
            onClick={() => setTopic(activeTopic === t.label ? null : t.label)}
            className="font-mono-data text-[7px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border transition-colors"
            style={{
              borderColor: activeTopic === t.label ? "#00B4CC55" : "rgba(255,255,255,0.07)",
              background:  activeTopic === t.label ? "#00B4CC14" : "transparent",
              color:       activeTopic === t.label ? "#00B4CC"   : "rgba(255,255,255,0.30)",
            }}
          >{t.label}</button>
        ))}
        {sources.map((s) => (
          <button
            key={s}
            onClick={() => setSource(activeSource === s ? null : s)}
            className="font-mono-data text-[7px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm border transition-colors"
            style={{
              borderColor: activeSource === s ? "#C9A84C55" : "rgba(255,255,255,0.06)",
              background:  activeSource === s ? "#C9A84C14" : "transparent",
              color:       activeSource === s ? "#C9A84C"   : "rgba(255,255,255,0.22)",
            }}
          >{s}</button>
        ))}
        {(query || activeTopic || activeSource || timeRange !== "ALL") && (
          <button onClick={() => { setQuery(""); setTopic(null); setSource(null); setTimeRange("ALL"); }}
            className="font-mono-data text-[7px] text-white/25 hover:text-white/50 px-1">clear</button>
        )}
      </div>

      {/* Items */}
      <div ref={listScrollRef} className="space-y-0 divide-y divide-white/[0.04] overflow-y-auto flex-1 min-h-0 overscroll-contain">
        {filtered.length === 0 && (
          <div className="py-4 text-center"><span className="font-mono-data text-[10px] text-white/20">No items match</span></div>
        )}
        {filtered.map((item, i) => {
          const sev = scoreSeverity(item.title + " " + item.snippet);
          const copied = copiedIdx === i;
          const hid = newsIntelId(item);
          const mapLit = !!mapHighlightId && hid === mapHighlightId;
          return (
            <div
              key={`${item.link}-${i}`}
              data-intel-id={hid}
              className={`group flex items-start gap-2 py-2 hover:bg-white/[0.02] -mx-2 px-2 rounded-sm transition-colors ${mapLit ? "bg-hormuz-teal/[0.06] border-l-2 border-hormuz-teal -ml-0.5 pl-[calc(0.5rem-2px)]" : ""}`}
            >
              {/* Severity badge */}
              <span
                className="shrink-0 mt-0.5 font-mono-data text-[7px] px-1 py-0.5 rounded-sm uppercase tracking-wider"
                style={{ color: ITEM_SEV_COLOR[sev], background: ITEM_SEV_BG[sev], border: `1px solid ${ITEM_SEV_COLOR[sev]}44` }}
              >{sev === "LOW" ? "—" : sev}</span>

              {/* Source label + title */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-mono-data text-[7px] text-white/25 bg-white/[0.04] px-1 rounded-sm uppercase">{item.source.split(" ")[0].slice(0, 7)}</span>
                  <span className="font-mono-data text-[8px] text-white/20">{timeAgo(item.pubDate)}</span>
                </div>
                <a href={item.link} target="_blank" rel="noreferrer"
                  className="font-mono-data text-[10px] text-white/70 leading-snug group-hover:text-white/90 transition-colors line-clamp-2 block"
                >{item.title}</a>
              </div>

              {/* Action buttons (share + predict) */}
              <div className="shrink-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                <button
                  onClick={() => { shareItem(item, sev); setCopiedIdx(i); setTimeout(() => setCopiedIdx(null), 1500); }}
                  title="Copy share text"
                  className="font-mono-data text-[8px] text-white/25 hover:text-white/60 leading-none transition-colors"
                >{copied ? "copied" : "copy"}</button>
                <a
                  href={`/markets?q=${encodeURIComponent(`Will this headline become a bigger story? "${item.title.slice(0, 80)}"`).slice(0, 200)}`}
                  target="_blank"
                  rel="noreferrer"
                  title="Create a prediction market from this headline"
                  className="font-mono-data text-[8px] text-hormuz-gold/35 hover:text-hormuz-gold/70 leading-none transition-colors"
                >predict</a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Timeline overlay ─────────────────────────────────────────────────────────

function TimelineOverlay({ events, onClose }: { events: TimelineEvent[]; onClose: () => void }) {
  return (
    <DraggablePanel
      title="Event Timeline"
      subtitle="Audit log: threat band changes + CRITICAL headlines (this browser only)"
      onClose={onClose}
      defaultPos={{ top: 70, left: 380 }}
      width={320}
      accentColor="#a78bfa"
    >
      <div className="px-3 py-2.5">
        {events.length === 0 ? (
          <p className="font-mono-data text-[9px] text-white/25 py-3 text-center leading-relaxed">
            Nothing here yet. When the threat meter moves to a new band, or the feed flags a CRITICAL story, a line is appended so you can replay what changed during your session. Data stays in localStorage until you clear it.
          </p>
        ) : (
          <div className="space-y-0 divide-y divide-white/[0.05]">
            {events.map((ev, i) => {
              const d = new Date(ev.ts);
              const ts = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
              const date = d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
              return (
                <div key={i} className="flex items-start gap-2.5 py-2">
                  <div className="shrink-0 mt-0.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: ev.color }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono-data text-[10px] font-semibold" style={{ color: ev.color }}>{ev.label}</div>
                    <div className="font-mono-data text-[8px] text-white/35 mt-0.5">{ev.detail}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono-data text-[9px] text-white/30">{ts}</div>
                    <div className="font-mono-data text-[7px] text-white/18">{date}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {events.length > 0 && (
          <button
            onClick={() => {
              localStorage.removeItem("hormuz_timeline");
              window.location.reload();
            }}
            className="mt-3 font-mono-data text-[8px] text-white/20 hover:text-white/40 transition-colors"
          >
            clear history
          </button>
        )}
      </div>
    </DraggablePanel>
  );
}

// ─── Layer controls overlay ────────────────────────────────────────────────────

const LAYER_LABELS: Array<{ key: keyof LayerConfig; label: string; color: string; desc: string }> = [
  { key: "lanes",       label: "Hormuz/Gulf lanes", color: "#00B4CC", desc: "Hormuz TSS · Gulf feeder · Arabian Sea approach (regional)" },
  { key: "altRoutes",   label: "Trunk diversions", color: "rgba(255,255,255,0.3)", desc: "Red Sea/Suez link · Asia→Malacca corridor (global trunk)" },
  { key: "capeRoute",   label: "Cape bypass",       color: "#f97316", desc: "Good Hope reroute to NW Europe (global contingency)" },
  { key: "pipelines",   label: "Land bypass pipes", color: "#C9A84C", desc: "SCPX · UAE Fujairah · Kirkuk-Ceyhan (Gulf oil bypass)" },
  { key: "iranBorder",  label: "Iran 12 nm",       color: "#CC2936", desc: "Approx territorial water line (Gulf legal risk)" },
  { key: "ports",       label: "Hub ports",        color: "#00B4CC", desc: "Major Gulf/Red Sea load & box terminals (regional)" },
  { key: "chokepoints", label: "World chokepoints", color: "#f97316", desc: "Panama, Suez, Gib, Dover, Malacca, Singapore, Taiwan, Korea, Turkish, Magellan + …" },
  { key: "canalRoutes", label: "Canal geometry",   color: "#2dd4bf", desc: "Schematic polylines: Panama, Suez, Kiel, Corinth, Welland, Volga–Don, Houston + …" },
  { key: "newsMarkers", label: "News on map",      color: "#a78bfa", desc: "Headlines geotagged to passages we track" },
];

function LayersOverlay({ layers, onChange, onClose }: { layers: LayerConfig; onChange: (k: keyof LayerConfig, v: boolean) => void; onClose: () => void }) {
  const allOn  = Object.values(layers).every(Boolean);
  const allOff = Object.values(layers).every((v) => !v);
  return (
    <DraggablePanel title="Map layers" subtitle="Hormuz detail + worldwide passages. Saved in this browser." onClose={onClose} defaultPos={{ top: 70, left: 500 }} width={300} accentColor="#00B4CC">
      <div className="px-3 py-2">
        {/* All on / all off */}
        <div className="flex gap-1.5 mb-3">
          <button
            onClick={() => LAYER_LABELS.forEach((l) => onChange(l.key, true))}
            className="flex-1 font-mono-data text-[8px] uppercase tracking-wider py-1 rounded-sm border transition-colors"
            style={{ borderColor: allOn ? "#00B4CC55" : "rgba(255,255,255,0.08)", color: allOn ? "#00B4CC" : "rgba(255,255,255,0.35)", background: allOn ? "#00B4CC14" : "transparent" }}
          >All ON</button>
          <button
            onClick={() => LAYER_LABELS.forEach((l) => onChange(l.key, false))}
            className="flex-1 font-mono-data text-[8px] uppercase tracking-wider py-1 rounded-sm border transition-colors"
            style={{ borderColor: allOff ? "#CC293655" : "rgba(255,255,255,0.08)", color: allOff ? "#CC2936" : "rgba(255,255,255,0.35)", background: allOff ? "#CC293614" : "transparent" }}
          >All OFF</button>
        </div>

        <div className="space-y-1">
          {LAYER_LABELS.map((l) => {
            const on = layers[l.key];
            return (
              <div
                key={l.key}
                onClick={() => onChange(l.key, !on)}
                className="flex items-center gap-2.5 py-1.5 px-2 rounded-sm cursor-pointer hover:bg-white/[0.04] transition-colors"
              >
                {/* Toggle dot */}
                <div className="shrink-0 w-7 h-3.5 rounded-full transition-colors relative" style={{ background: on ? `${l.color}55` : "rgba(255,255,255,0.08)" }}>
                  <div className="absolute top-0.5 h-2.5 w-2.5 rounded-full transition-all" style={{ background: on ? l.color : "rgba(255,255,255,0.25)", left: on ? "calc(100% - 10px - 2px)" : "2px" }} />
                </div>
                <div className="min-w-0">
                  <div className="font-mono-data text-[10px]" style={{ color: on ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)" }}>{l.label}</div>
                  <div className="font-mono-data text-[7px] text-white/20 truncate">{l.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DraggablePanel>
  );
}

// ─── Map Legend ───────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { color: "#00B4CC", dash: false,  shape: "line",    label: "Hormuz/Gulf TSS lanes (animated)" },
  { color: "#ffffff44", dash: true, shape: "line",    label: "Trunk diversions (Red Sea / Asia)" },
  { color: "#f97316", dash: true,   shape: "line",    label: "Cape bypass (active at HIGH+)" },
  { color: "#C9A84C", dash: true,   shape: "line",    label: "Saudi SCPX pipeline" },
  { color: "#00B4CC", dash: true,   shape: "line",    label: "UAE Habshan pipeline" },
  { color: "#a78bfa", dash: true,   shape: "line",    label: "Iraq-Turkey pipeline" },
  { color: "#CC2936", dash: true,   shape: "line",    label: "Iran 12 nm territorial waters" },
  { color: "#2dd4bf", dash: true,   shape: "line",    label: "World canal / lock paths (schematic)" },
  { color: "#00B4CC", dash: false,  shape: "square",  label: "UAE ports" },
  { color: "#C9A84C", dash: false,  shape: "square",  label: "Saudi ports / facilities" },
  { color: "#CC2936", dash: false,  shape: "square",  label: "Iranian ports" },
  { color: "#f97316", dash: false,  shape: "diamond", label: "World straits & canals (18+)" },
  { color: "#C9A84C", dash: false,  shape: "dot",     label: "Strait of Hormuz centroid" },
  { color: "#CC2936", dash: false,  shape: "pulse",   label: "CRITICAL news event" },
  { color: "#f97316", dash: false,  shape: "pulse",   label: "HIGH news event" },
];

function MapLegend({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <div className="absolute top-[52px] sm:top-[44px] right-2 sm:right-3 z-[1049] max-w-[min(calc(100vw-1rem),14rem)] touch-manipulation">
      <button
        type="button"
        onClick={onToggle}
        className="font-mono-data text-[9px] uppercase tracking-widest px-3 py-2 sm:px-2 sm:py-1 rounded-sm mb-1 block transition-colors min-h-[40px] sm:min-h-0 w-full sm:w-auto text-center sm:text-left"
        style={{ background: "rgba(8,12,22,0.88)", border: "1px solid rgba(255,255,255,0.10)", color: visible ? "#00B4CC" : "rgba(255,255,255,0.28)", backdropFilter: "blur(6px)" }}
      >
        {visible ? "hide legend" : "legend"}
      </button>
      {visible && (
        <div className="bg-hormuz-deep/92 backdrop-blur-sm border border-white/[0.10] rounded-sm px-3 py-2.5 w-full sm:w-52 max-h-[min(50dvh,320px)] overflow-y-auto overscroll-contain">
          <div className="space-y-1.5">
            {LEGEND_ITEMS.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                {/* Symbol */}
                <div className="shrink-0 w-6 flex items-center justify-center">
                  {item.shape === "line" && (
                    <div style={{ width: 22, height: 2, background: item.color, opacity: item.dash ? 0.6 : 1, borderStyle: item.dash ? "dashed" : "solid", borderColor: item.color, borderWidth: item.dash ? "0 0 1.5px 0" : 0 }} />
                  )}
                  {item.shape === "square" && (
                    <div style={{ width: 7, height: 7, background: item.color, borderRadius: 1 }} />
                  )}
                  {item.shape === "diamond" && (
                    <div style={{ width: 7, height: 7, background: item.color, transform: "rotate(45deg)" }} />
                  )}
                  {item.shape === "dot" && (
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }} />
                  )}
                  {item.shape === "pulse" && (
                    <div className="relative" style={{ width: 8, height: 8 }}>
                      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: item.color, opacity: 0.3 }} />
                      <div style={{ position: "absolute", inset: 2, borderRadius: "50%", background: item.color }} />
                    </div>
                  )}
                </div>
                <span className="font-mono-data text-[8px] text-white/45 leading-tight">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Help modal ────────────────────────────────────────────────────────────────

const SHORTCUT_ROWS = [
  { key: "1",   action: "Toggle AIS Traffic panel" },
  { key: "2",   action: "Toggle Trade Flows panel" },
  { key: "3",   action: "Toggle Supply Routes panel" },
  { key: "4",   action: "Toggle Freight & Rates panel" },
  { key: "5",   action: "Toggle Chokepoints panel" },
  { key: "6",   action: "Toggle Goods Impacted panel" },
  { key: "7",   action: "Toggle Country Exposure panel" },
  { key: "8",   action: "Toggle Market Signals panel" },
  { key: "9",   action: "Toggle Intelligence Search panel" },
  { key: "0",   action: "Toggle Event Timeline panel" },
  { key: "L",   action: "Toggle Map Layers panel" },
  { key: "Esc", action: "Close all panels, modals, and pinned map intel" },
  { key: "?",   action: "Show this help screen" },
];

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 touch-manipulation" onClick={onClose}>
      <div
        className="bg-hormuz-navy border border-white/[0.12] rounded-lg p-5 sm:p-6 w-[440px] max-w-full max-h-[min(88dvh,640px)] overflow-y-auto overscroll-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="font-mono-data text-[10px] text-white/35 uppercase tracking-widest mb-0.5">Keyboard Shortcuts</div>
            <div className="font-semibold text-white text-sm">HORMUZ Intelligence Monitor</div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white/70 font-mono-data text-xl leading-none">×</button>
        </div>
        <div className="space-y-0 divide-y divide-white/[0.05]">
          {SHORTCUT_ROWS.map((r) => (
            <div key={r.key} className="flex items-center justify-between py-2">
              <span className="font-mono-data text-[10px] text-white/60">{r.action}</span>
              <kbd className="font-mono-data text-[9px] bg-white/[0.06] border border-white/10 text-white/50 px-2 py-0.5 rounded-sm ml-4 shrink-0">{r.key}</kbd>
            </div>
          ))}
        </div>
        <p className="font-mono-data text-[8px] text-white/20 mt-4">
          Click outside to close. Shortcuts use capture on this page so 1–0 work even when the map is focused; they are disabled while typing in inputs.
        </p>
      </div>
    </div>
  );
}

// ─── Static map annotations ───────────────────────────────────────────────────

function MapOverlay({
  threat, vessels, shipping, mapExpanded, onToggleExpand, notifEnabled, onToggleNotif,
  onExport, onShowEmbed, onShareUrl, onHelp, incidentCount24h, showLegend, onToggleLegend,
}: {
  threat: ThreatData | null; vessels: VesselData | null; shipping: ShippingData | null;
  mapExpanded: boolean; onToggleExpand: () => void;
  notifEnabled: boolean; onToggleNotif: () => void;
  onExport: () => void; onShowEmbed: () => void; onShareUrl: () => void; onHelp: () => void;
  incidentCount24h: number; showLegend: boolean; onToggleLegend: () => void;
}) {
  const level = Math.min(3, Math.max(0, Number(threat?.level) || 0)) as ThreatLevel;
  const lc = buildLogistics(level, shipping);
  // shared button style
  const actionBtn = (active?: boolean, activeColor = "#00B4CC") => ({
    fontFamily: "inherit",
    background: active ? `${activeColor}14` : "rgba(8,12,22,0.88)",
    border: `1px solid ${active ? `${activeColor}44` : "rgba(255,255,255,0.08)"}`,
    color: active ? activeColor : "rgba(255,255,255,0.32)",
    backdropFilter: "blur(6px)" as const,
  });

  return (
    <>
      {/* ── Top-right action bar (wrap + larger touch targets on small screens) ── */}
      <div className="absolute top-2 left-2 right-2 sm:top-3 sm:left-auto sm:right-3 z-[1050] flex flex-wrap justify-end gap-1 touch-manipulation max-w-none">
        {incidentCount24h > 0 && (
          <span className="font-mono-data text-[8px] bg-hormuz-deep/88 backdrop-blur-sm border border-white/[0.06] px-2 py-2 sm:py-1 rounded-sm inline-flex items-center min-h-[40px] sm:min-h-0"
            style={{ color: incidentCount24h >= 5 ? "#CC2936" : incidentCount24h >= 2 ? "#f97316" : "rgba(255,255,255,0.40)" }}>
            {incidentCount24h} incident{incidentCount24h !== 1 ? "s" : ""} / 24h
          </span>
        )}

        <button type="button" onClick={onToggleNotif} title={notifEnabled ? "Notifications enabled — click to disable" : "Enable browser notifications for critical events"}
          className="font-mono-data text-[9px] px-3 py-2.5 sm:px-2 sm:py-1 rounded-sm transition-colors min-h-[44px] sm:min-h-0"
          style={actionBtn(notifEnabled)}
        >ALRT</button>

        <button type="button" onClick={onShareUrl} title="Copy URL with current panel state"
          className="font-mono-data text-[9px] px-3 py-2.5 sm:px-2 sm:py-1 rounded-sm transition-colors hover:text-white/70 min-h-[44px] sm:min-h-0"
          style={actionBtn()}
        >SHARE</button>

        <button type="button" onClick={onShowEmbed} title="Get embed widget snippet"
          className="font-mono-data text-[9px] px-3 py-2.5 sm:px-2 sm:py-1 rounded-sm transition-colors hover:text-white/70 min-h-[44px] sm:min-h-0"
          style={actionBtn()}
        >EMBED</button>

        <button type="button" onClick={onExport} title="Print or export this view"
          className="font-mono-data text-[9px] px-3 py-2.5 sm:px-2 sm:py-1 rounded-sm transition-colors hover:text-white/70 min-h-[44px] sm:min-h-0"
          style={actionBtn()}
        >PRINT</button>

        <button type="button" onClick={onHelp} title="Show keyboard shortcuts"
          className="font-mono-data text-[9px] px-3 py-2.5 sm:px-2 sm:py-1 rounded-sm transition-colors hover:text-white/70 min-h-[44px] sm:min-h-0"
          style={actionBtn()}
        >HELP</button>

        <button type="button" onClick={onToggleExpand} title={mapExpanded ? "Restore side panel" : "Expand map"}
          className="font-mono-data text-[9px] px-3 py-2.5 sm:px-2 sm:py-1 rounded-sm transition-colors hover:text-white/70 min-h-[44px] sm:min-h-0"
          style={actionBtn()}
        >{mapExpanded ? "SHRINK" : "EXPAND"}</button>
      </div>

      {/* ── Legend (below action bar) ── */}
      <MapLegend visible={showLegend} onToggle={onToggleLegend} />

      {/* ── Bottom-center: chokepoint status (lifted on small screens above panel dock) ── */}
      <div className="absolute bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-3 left-1/2 -translate-x-1/2 z-[1050] max-w-[calc(100vw-1rem)] bg-hormuz-deep/88 backdrop-blur-sm px-3 sm:px-4 py-2 rounded-sm border border-white/[0.08] flex items-center gap-3 sm:gap-4">
        <div>
          <div className="font-mono-data text-[8px] text-white/25 uppercase tracking-widest mb-0.5">Chokepoint</div>
          <div className="font-mono-data text-[11px] font-semibold leading-tight" style={{ color: lc.chopkeyColor }}>{lc.chokepoint}</div>
        </div>
        <div className="w-px h-6 bg-white/[0.08]" />
        <div className="font-mono-data text-[9px] text-white/35 max-w-[160px] leading-tight">{lc.routeStatus}</div>
      </div>

      {/* ── Bottom-right: AIS vessel count ── */}
      <div className="absolute bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-3 right-2 lg:right-3 z-[1050] bg-hormuz-deep/80 backdrop-blur-sm px-3 py-2 rounded-sm border border-white/[0.08] text-right touch-manipulation">
        <div className="font-mono-data text-[8px] text-white/25 uppercase tracking-widest mb-0.5">AIS Vessels</div>
        <div className="font-mono-data text-lg font-medium text-hormuz-teal leading-tight">{vessels?.count ?? "—"}</div>
      </div>
    </>
  );
}

// ─── Map intel deck (hover preview + pinned detail, Monitor-the-Situation style) ─

function MapIntelDeck({
  hover,
  pinned,
  onUnpin,
}: {
  hover: NewsMarker | null;
  pinned: NewsMarker | null;
  onUnpin: () => void;
}) {
  const active = pinned ?? hover;
  if (!active) return null;
  const pinnedActive = !!pinned;
  const sev = active.severity;
  const srcLabel = (active.source ?? "").split(" ")[0].toUpperCase().slice(0, 12) || "NEWS";
  const sevColor = ITEM_SEV_COLOR[sev] ?? "rgba(255,255,255,0.35)";

  return (
    <div
      className="pointer-events-auto absolute right-2 lg:right-3 z-[1240] w-[min(calc(100vw-1rem),380px)] max-w-[calc(100vw-1rem)] lg:max-w-none rounded-sm border border-white/[0.12] bg-hormuz-deep/95 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md overflow-hidden bottom-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-10 touch-manipulation"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 border-b border-white/[0.08] px-3 py-2">
        <div className="min-w-0">
          <div className="font-mono-data text-[8px] text-white/35 uppercase tracking-widest">
            {pinnedActive ? "Pinned map intel" : "Map preview"}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span
              className="font-mono-data text-[7px] px-1 py-0.5 rounded-sm uppercase tracking-wider"
              style={{ color: sevColor, background: `${sevColor}18`, border: `1px solid ${sevColor}44` }}
            >{sev === "LOW" ? "—" : sev}</span>
            <span className="font-mono-data text-[8px] text-white/30">{srcLabel}</span>
            <span className="font-mono-data text-[8px] text-white/22">{timeAgo(active.pubDate)}</span>
          </div>
        </div>
        {pinnedActive && (
          <button
            type="button"
            onClick={onUnpin}
            className="shrink-0 font-mono-data text-[14px] leading-none text-white/25 hover:text-white/55 px-1"
            aria-label="Unpin intel"
          >×</button>
        )}
      </div>
      <div className="px-3 py-2.5 max-h-[40vh] overflow-y-auto">
        <p className="font-mono-data text-[11px] text-white/85 leading-snug">{active.title}</p>
        {active.snippet ? (
          <p className="mt-2 font-mono-data text-[9px] text-white/45 leading-relaxed line-clamp-5">{active.snippet}</p>
        ) : null}
        {!pinnedActive ? (
          <p className="mt-2 font-mono-data text-[8px] text-white/20">Click the marker to pin this card while you read or cross-check the feed.</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] px-3 py-2 bg-black/20">
        <a
          href={active.link}
          target="_blank"
          rel="noreferrer"
          className="font-mono-data text-[9px] px-2 py-1 rounded-sm bg-hormuz-teal/20 text-hormuz-teal border border-hormuz-teal/35 hover:bg-hormuz-teal/30 transition-colors"
        >Open source</a>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(active.link).catch(() => {}); }}
          className="font-mono-data text-[9px] px-2 py-1 rounded-sm border border-white/[0.1] text-white/45 hover:text-white/70 transition-colors"
        >Copy link</button>
        <a
          href={`/markets?q=${encodeURIComponent(`Will this headline become a bigger story? "${active.title.slice(0, 80)}"`).slice(0, 200)}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono-data text-[9px] text-hormuz-gold/50 hover:text-hormuz-gold/80 transition-colors ml-auto"
        >Predict →</a>
      </div>
    </div>
  );
}

// ─── News ticker ──────────────────────────────────────────────────────────────

function NewsTicker({ items }: { items: NewsItem[] }) {
  if (items.length === 0) {
    return (
      <div className="h-8 shrink-0 border-t border-white/[0.08] bg-hormuz-deep/95 flex items-center px-4">
        <span className="font-mono-data text-[10px] text-white/20">Loading intel feed...</span>
      </div>
    );
  }
  const doubled = [...items, ...items];
  return (
    <div className="h-8 shrink-0 border-t border-white/[0.08] bg-hormuz-deep/95 flex items-center overflow-hidden touch-manipulation">
      <div className="shrink-0 flex items-center gap-2 px-3 border-r border-white/[0.08] h-full bg-hormuz-red/10">
        <span className="w-1.5 h-1.5 rounded-full bg-hormuz-red animate-pulse" />
        <span className="font-mono-data text-[10px] text-hormuz-red font-semibold tracking-widest uppercase">FEED</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="ticker-track">
          {doubled.map((item, i) => (
            <span key={i} className="inline-flex items-center gap-3 px-6 whitespace-nowrap">
              <span className="font-mono-data text-[9px] text-white/30 uppercase tracking-wider">{item.source.split(" ")[0]}</span>
              <span className="font-mono-data text-[10px] text-white/60">{item.title}</span>
              <span className="text-white/10 font-mono-data">·</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Monitor() {
  const now = useNow();
  const { data: threat,   fetchedAt: threatAt,   intervalMs: threatInt   } = useFetch<ThreatData>("/api/monitor/threat",    3 * 60_000);
  const { data: oil,      fetchedAt: oilAt,       intervalMs: oilInt      } = useFetch<OilData>("/api/monitor/oil",          5 * 60_000);
  const { data: vessels                                                    } = useFetch<VesselData>("/api/monitor/vessels",   2 * 60_000);
  const { data: newsData                                                   } = useFetch<NewsData>("/api/monitor/news",        3 * 60_000);
  const { data: freight                                                    } = useFetch<FreightData>("/api/monitor/freight",  5 * 60_000);
  const { data: shipping                                                   } = useFetch<ShippingData>("/api/monitor/shipping",5 * 60_000);
  const { data: tradeData                                                  } = useFetch<TradeData>("/api/monitor/trade",      30 * 60_000);

  // ── Panel open state — persisted to localStorage ──
  const [openOverlays, setOpenOverlays] = useState<Set<OverlayId>>(() => new Set<OverlayId>());

  // Restore from localStorage on mount (client-only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("hormuz_open_overlays");
      if (saved) setOpenOverlays(new Set(JSON.parse(saved) as OverlayId[]));
    } catch { /* ignore */ }
  }, []);

  const toggleOverlay = useCallback((id: OverlayId) => {
    setOpenOverlays((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("hormuz_open_overlays", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const level = Math.min(3, Math.max(0, Number(threat?.level) || 0)) as ThreatLevel;
  const lc    = buildLogistics(level, shipping);
  const items = newsData?.items ?? [];
  const threatTrend = useThreatHistory(threat?.score ?? null);
  const { events: timelineEvents, logEvent } = useTimelineLog(threat?.label ?? null);

  // ── New UI state ──
  const [mapExpanded, setMapExpanded]         = useState(false);
  const [notifEnabled, setNotifEnabled]       = useState(false);
  const [showEmbedModal, setShowEmbedModal]   = useState(false);
  const [showHelpModal, setShowHelpModal]     = useState(false);
  const [showLegend, setShowLegend]           = useState(false);
  const [customWatchwords, setCustomWatchwords] = useState<string[]>([]);
  const [watchwordInput, setWatchwordInput]   = useState("");
  const [layerConfig, setLayerConfig]         = useState<LayerConfig>(DEFAULT_LAYERS);
  const [mapIntelHover, setMapIntelHover]     = useState<NewsMarker | null>(null);
  const [mapIntelPinned, setMapIntelPinned]  = useState<NewsMarker | null>(null);
  const mapVpSeqRef = useRef(0);
  const [mapViewportCmd, setMapViewportCmd]   = useState<MapViewportCommand | null>(null);
  const requestMapFocus = useCallback((lat: number, lon: number, zoom: number) => {
    mapVpSeqRef.current += 1;
    setMapViewportCmd({ lat, lon, zoom, seq: mapVpSeqRef.current });
  }, []);
  const seenNotifTitles = useRef<Set<string>>(new Set());
  const prevAudioLevel  = useRef<number>(0);

  // ── Keyboard shortcuts (capture so map / other widgets do not eat 1–9) ──
  useEffect(() => {
    const DIGIT_ORDER: OverlayId[] = ["ais", "trade", "routes", "rates", "zones", "goods", "risk", "signals", "news", "timeline"];
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable=true]")) return;
      const num = e.key === "0" ? 10 : parseInt(e.key, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= 10) {
        e.preventDefault();
        toggleOverlay(DIGIT_ORDER[num - 1]);
        return;
      }
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        toggleOverlay("layers");
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShowHelpModal((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setOpenOverlays(new Set());
        setShowHelpModal(false);
        setShowEmbedModal(false);
        setMapIntelHover(null);
        setMapIntelPinned(null);
        try { localStorage.setItem("hormuz_open_overlays", "[]"); } catch { /* ignore */ }
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggleOverlay]);

  // Restore layer config + custom watchwords from localStorage on mount
  useEffect(() => {
    try {
      const lc = localStorage.getItem("hormuz_layers");
      if (lc) {
        const parsed = JSON.parse(lc) as Partial<LayerConfig>;
        const next = { ...DEFAULT_LAYERS };
        (Object.keys(DEFAULT_LAYERS) as (keyof LayerConfig)[]).forEach((k) => {
          if (typeof parsed[k] === "boolean") next[k] = parsed[k];
        });
        setLayerConfig(next);
      }
      const ww = localStorage.getItem("hormuz_watchwords");
      if (ww) setCustomWatchwords(JSON.parse(ww));
    } catch { /* ignore */ }
  }, []);

  function updateLayer(key: keyof LayerConfig, val: boolean) {
    setLayerConfig((prev) => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem("hormuz_layers", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function addWatchword(w: string) {
    const trimmed = w.trim().toLowerCase();
    if (!trimmed || customWatchwords.includes(trimmed)) return;
    const next = [...customWatchwords, trimmed];
    setCustomWatchwords(next);
    try { localStorage.setItem("hormuz_watchwords", JSON.stringify(next)); } catch { /* ignore */ }
  }

  function removeWatchword(w: string) {
    const next = customWatchwords.filter((x) => x !== w);
    setCustomWatchwords(next);
    try { localStorage.setItem("hormuz_watchwords", JSON.stringify(next)); } catch { /* ignore */ }
  }

  // ── Incident count (24h) ──
  const incidentCount24h = items.filter(
    (i) => i.pubDate && Date.now() - new Date(i.pubDate).getTime() <= 24 * 60 * 60 * 1000
  ).length;

  // ── Geolocated news markers for map ──
  const newsMarkers: NewsMarker[] = items.flatMap((item) => {
    const coords = geolocateItem(item);
    if (!coords) return [];
    const id = newsIntelId(item);
    return [{
      id,
      lat: coords[0], lon: coords[1],
      title: item.title,
      source: item.source,
      snippet: item.snippet ?? "",
      pubDate: item.pubDate ?? "",
      severity: scoreSeverity(item.title + " " + item.snippet),
      link: item.link,
    }];
  });

  const onNewsIntelHover = useCallback((m: NewsMarker | null) => {
    setMapIntelHover(m);
  }, []);

  const onNewsIntelSelect = useCallback((m: NewsMarker | null) => {
    if (!m) {
      setMapIntelPinned(null);
      return;
    }
    setMapIntelPinned((prev) => (prev?.id === m.id ? null : m));
  }, []);

  useEffect(() => {
    if (!layerConfig.newsMarkers) {
      setMapIntelHover(null);
      setMapIntelPinned(null);
    }
  }, [layerConfig.newsMarkers]);

  // ── Browser push notifications ──
  function toggleNotif() {
    if (notifEnabled) { setNotifEnabled(false); return; }
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => {
      if (p === "granted") {
        setNotifEnabled(true);
        new Notification("HORMUZ Intel", { body: "Notifications enabled. You'll be alerted on critical events.", icon: "/favicon.png" });
      }
    });
  }

  // Fire notifications for CRITICAL headlines + custom watchwords
  useEffect(() => {
    if (!notifEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    items.forEach((item) => {
      const text = (item.title + " " + item.snippet).toLowerCase();
      const sev = scoreSeverity(item.title + " " + item.snippet);

      // Watchword match
      const matchedWord = customWatchwords.find((w) => text.includes(w));
      const notifKey = item.title;

      if ((sev === "CRITICAL" || matchedWord) && !seenNotifTitles.current.has(notifKey)) {
        seenNotifTitles.current.add(notifKey);
        const prefix = matchedWord ? `[WATCHWORD: "${matchedWord}"]` : `[CRITICAL] ${item.source.split(" ")[0]}`;
        new Notification(prefix, { body: item.title, icon: "/favicon.png" });
        if (sev === "CRITICAL") {
          logEvent({ ts: Date.now(), type: "critical_news", label: `Critical: ${item.source.split(" ")[0]}`, detail: item.title.slice(0, 80), color: "#CC2936" });
        }
      }
    });
  }, [items, notifEnabled, customWatchwords, logEvent]);

  // ── Audio alert: sonar ping when threat rises a tier ──
  useEffect(() => {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") return;
    if (level > prevAudioLevel.current) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(); osc.stop(ctx.currentTime + 0.6);
        ctx.close();
      } catch { /* ignore — may fail without user gesture */ }
    }
    prevAudioLevel.current = level;
  }, [level]);

  // ── Countdown seconds until next refresh for threat + oil ──
  const [threatCountdown, setThreatCountdown] = useState<number | null>(null);
  const [oilCountdown, setOilCountdown] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      if (threatAt) setThreatCountdown(Math.max(0, Math.round((threatInt - (Date.now() - threatAt)) / 1000)));
      if (oilAt)   setOilCountdown(Math.max(0, Math.round((oilInt   - (Date.now() - oilAt))   / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [threatAt, oilAt, threatInt, oilInt]);

  // ── URL state: serialize open panels to URL query param ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ids = [...openOverlays].join(",");
    const url = new URL(window.location.href);
    if (ids) url.searchParams.set("p", ids);
    else url.searchParams.delete("p");
    window.history.replaceState(null, "", url.toString());
  }, [openOverlays]);

  // Restore from URL on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const p = params.get("p");
    if (p) {
      const ids = p.split(",").filter((id): id is OverlayId =>
        ["ais","trade","routes","rates","zones","goods","risk","signals","news","timeline","layers"].includes(id)
      );
      if (ids.length) setOpenOverlays(new Set(ids));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copyShareUrl() {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  }

  // ── Embed snippet ──
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live";
  const embedSnippet = `<iframe\n  src="${SITE}/embed"\n  width="420"\n  height="120"\n  style="border:none;border-radius:6px;"\n  title="HORMUZ Strait Intelligence"\n></iframe>`;

  return (
    <>
      <Head>
        <title>HORMUZ Monitor — Live Strait of Hormuz Intelligence Dashboard</title>
        <meta name="description" content="Real-time Strait of Hormuz logistics intelligence: live oil prices (Brent, WTI), VLCC spot rates, war risk premiums, AIS vessel traffic, shipping lane maps, pipeline alternatives, chokepoint status and breaking geopolitical news. Updated continuously." />
        <meta name="keywords" content="Strait of Hormuz monitor, Hormuz shipping intelligence, VLCC spot rate, war risk premium, oil chokepoint live, Persian Gulf shipping lanes, tanker tracking, Brent crude live, Hormuz blockade tracker, maritime logistics dashboard, pipeline bypass Hormuz" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />

        <link rel="canonical" href={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live"}/monitor`} />

        <meta property="og:type"        content="website" />
        <meta property="og:url"         content={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live"}/monitor`} />
        <meta property="og:title"       content="HORMUZ Monitor — Live Strait of Hormuz Intelligence Dashboard" />
        <meta property="og:description" content="9 live intelligence panels: oil prices, VLCC rates, war risk, AIS vessels, shipping lanes, pipeline maps, chokepoint status, trade flows and market signals. Real-time Strait of Hormuz data for maritime logistics and geopolitical risk." />
        <meta property="og:image"       content={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live"}/og-image.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height"content="630" />
        <meta property="og:image:alt"   content="HORMUZ live intelligence dashboard" />

        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content="HORMUZ Monitor — Live Strait of Hormuz Intelligence" />
        <meta name="twitter:description" content="Live oil prices · VLCC rates · war risk · shipping lanes · AIS vessels · 9 draggable panels. The Strait of Hormuz — monitored in real time." />
        <meta name="twitter:image"       content={`${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live"}/og-image.png`} />

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          "name": "HORMUZ Intelligence Monitor",
          "url": `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live"}/monitor`,
          "description": "Real-time Strait of Hormuz shipping and geopolitical intelligence dashboard. Live data across oil markets, VLCC freight rates, war risk premiums, AIS vessel tracking, pipeline bypass analysis and breaking news.",
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "browserRequirements": "Requires JavaScript",
          "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
          "featureList": [
            "Live Brent and WTI crude oil prices",
            "Computed VLCC spot rate from Frontline Ltd 52-week position",
            "War risk insurance premium calculation",
            "Cape of Good Hope rerouting cost and day estimate",
            "Interactive Leaflet.js shipping lane map with animation",
            "Iran 12nm territorial waters visualization",
            "Pipeline bypass routes: Saudi SCPX, UAE Habshan-Fujairah, Iraq-Turkey Kirkuk-Ceyhan",
            "Real-time geopolitical threat scoring from news sentiment",
            "AIS vessel tracking (AISstream.io + AISHub fallback)",
            "Global trade flow data for Hormuz-dependent importers",
            "Market signals: Brent/WTI spread, tanker decoupling, route breakeven",
            "Draggable, collapsible overlay panels with localStorage persistence",
            "Keyboard shortcuts for all 9 panels (keys 1-9, Esc)"
          ]
        }) }} />
      </Head>

      <div className="h-[100dvh] max-h-[100dvh] min-h-0 flex flex-col overflow-hidden bg-hormuz-deep">

        <StatusBar threat={threat} oil={oil} vessels={vessels} now={now} shipping={shipping} threatTrend={threatTrend} threatCountdown={threatCountdown} oilCountdown={oilCountdown} incidentCount24h={incidentCount24h} />

        <div className="flex-1 flex min-h-0 flex-col lg:flex-row overflow-hidden">

          {/* ── Map + overlays ── */}
          <div className="flex-1 relative monitor-scanlines min-h-[40dvh] lg:min-h-0 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
            <MonitorMap
              vesselData={vessels}
              threatLevel={level}
              layers={layerConfig}
              newsMarkers={layerConfig.newsMarkers ? newsMarkers : []}
              onNewsIntelHover={onNewsIntelHover}
              onNewsIntelSelect={onNewsIntelSelect}
              mapViewport={mapViewportCmd}
            />
            <MapIntelDeck
              hover={layerConfig.newsMarkers ? mapIntelHover : null}
              pinned={layerConfig.newsMarkers ? mapIntelPinned : null}
              onUnpin={() => setMapIntelPinned(null)}
            />
            <MapOverlay
              threat={threat} vessels={vessels} shipping={shipping}
              mapExpanded={mapExpanded} onToggleExpand={() => setMapExpanded((v) => !v)}
              notifEnabled={notifEnabled} onToggleNotif={toggleNotif}
              onExport={() => window.print()}
              onShowEmbed={() => setShowEmbedModal(true)}
              onShareUrl={copyShareUrl}
              onHelp={() => setShowHelpModal(true)}
              incidentCount24h={incidentCount24h}
              showLegend={showLegend} onToggleLegend={() => setShowLegend((v) => !v)}
            />
            <OverlayToolbar open={openOverlays} onToggle={toggleOverlay} />

            {/* Floating panels (1–0 keyboard shortcuts, Esc = close all) */}
            {openOverlays.has("ais")      && <AISOverlay           vessels={vessels}                                                   onClose={() => toggleOverlay("ais")}      />}
            {openOverlays.has("trade")    && <TradeFlowsOverlay    trade={tradeData}                                                   onClose={() => toggleOverlay("trade")}    />}
            {openOverlays.has("routes")   && <SupplyRoutesOverlay  shipping={shipping} news={items} level={level} onMapFocus={requestMapFocus} onClose={() => toggleOverlay("routes")}   />}
            {openOverlays.has("rates")    && <FreightRatesOverlay  freight={freight} oil={oil} shipping={shipping} level={level}       onClose={() => toggleOverlay("rates")}    />}
            {openOverlays.has("zones")    && <ChokepointsOverlay   level={level} news={items} onMapFocus={requestMapFocus}            onClose={() => toggleOverlay("zones")}    />}
            {openOverlays.has("goods")    && <GoodsImpactedOverlay level={level} shipping={shipping}                                   onClose={() => toggleOverlay("goods")}    />}
            {openOverlays.has("risk")     && <CountryRiskOverlay   level={level} trade={tradeData}                                     onClose={() => toggleOverlay("risk")}     />}
            {openOverlays.has("signals")  && <MarketSignalsOverlay oil={oil} freight={freight} shipping={shipping} trade={tradeData} level={level} onClose={() => toggleOverlay("signals")}  />}
            {openOverlays.has("news")     && <NewsSearchOverlay    items={items}                                                        onClose={() => toggleOverlay("news")}     />}
            {openOverlays.has("timeline") && <TimelineOverlay      events={timelineEvents}                                             onClose={() => toggleOverlay("timeline")} />}
            {openOverlays.has("layers")   && <LayersOverlay        layers={layerConfig}    onChange={updateLayer}                        onClose={() => toggleOverlay("layers")} />}

            {/* Help modal */}
            {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}

            {/* Embed snippet modal */}
            {showEmbedModal && (
              <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowEmbedModal(false)}>
                <div className="bg-hormuz-navy border border-white/[0.12] rounded-lg p-6 w-[480px] max-w-[95vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="font-mono-data text-[11px] text-white/50 uppercase tracking-widest mb-0.5">Embed Widget</div>
                      <div className="font-semibold text-white text-sm">HORMUZ Status Embed</div>
                    </div>
                    <button onClick={() => setShowEmbedModal(false)} className="text-white/30 hover:text-white/70 font-mono-data text-lg">×</button>
                  </div>
                  <p className="font-mono-data text-[10px] text-white/40 mb-3">Paste this snippet into any webpage to embed the live threat status widget:</p>
                  <pre className="bg-black/40 border border-white/[0.08] rounded-sm px-3 py-3 font-mono-data text-[9px] text-hormuz-teal overflow-x-auto whitespace-pre mb-4">{embedSnippet}</pre>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { navigator.clipboard.writeText(embedSnippet); }}
                      className="flex-1 bg-hormuz-teal text-hormuz-deep font-semibold text-xs py-2 rounded-md hover:brightness-110 transition-all"
                    >Copy Snippet</button>
                    <a
                      href={`${SITE}/embed`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 text-center border border-white/[0.12] text-white/60 hover:text-white/80 text-xs py-2 rounded-md transition-colors"
                    >Preview →</a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Right logistics panel (hidden when map is expanded) ── */}
          {!mapExpanded && (
            <div className="w-full max-h-[38dvh] lg:max-h-none lg:w-[380px] xl:w-[420px] shrink-0 border-t lg:border-t-0 border-l-0 lg:border-l border-white/[0.08] flex flex-col overflow-hidden min-h-0" style={{ background: "rgba(10,14,26,0.97)" }}>
              <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: lc.chopkeyColor }} />
                  <span className="font-mono-data text-[10px] text-white/40 uppercase tracking-widest">Logistics Intelligence</span>
                </div>
                <span className="font-mono-data text-[10px] font-semibold truncate max-w-[42%] sm:max-w-none text-right" style={{ color: lc.chopkeyColor }}>{threat?.label ?? "—"}</span>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                <ImpactBar score={lc.impactScore} level={level} />
                <RouteStatus level={level} lc={lc} news={items} />
                <PortStatusPanel news={items} />
                <SupplyPanel lc={lc} oil={oil} shipping={shipping} />
                {/* ── Watchword alert configurator ── */}
                <div className="border-t border-white/[0.06] px-4 py-2.5">
                  <div className="font-mono-data text-[9px] text-white/30 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                    Custom Watchwords
                    <span className="text-white/15">— alert when headline matches</span>
                  </div>
                  <div className="flex gap-1 mb-1.5">
                    <input
                      type="text"
                      value={watchwordInput}
                      onChange={(e) => setWatchwordInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { addWatchword(watchwordInput); setWatchwordInput(""); } }}
                      placeholder="e.g. tanker, sanctions, blockade…"
                      className="flex-1 bg-black/30 border border-white/[0.08] rounded-sm font-mono-data text-[9px] text-white/70 placeholder-white/20 px-2 py-2 sm:py-1 outline-none focus:border-hormuz-teal/40 min-h-[44px] sm:min-h-0 touch-manipulation"
                    />
                    <button
                      onClick={() => { addWatchword(watchwordInput); setWatchwordInput(""); }}
                      className="font-mono-data text-[9px] bg-hormuz-teal/15 border border-hormuz-teal/30 text-hormuz-teal px-3 py-2 sm:px-2 sm:py-1 rounded-sm hover:bg-hormuz-teal/25 transition-colors min-h-[44px] sm:min-h-0 touch-manipulation shrink-0"
                    >+ Add</button>
                  </div>
                  {customWatchwords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {customWatchwords.map((w) => (
                        <span key={w} className="font-mono-data text-[8px] bg-hormuz-gold/10 border border-hormuz-gold/25 text-hormuz-gold/80 px-1.5 py-0.5 rounded-sm flex items-center gap-1">
                          {w}
                          <button onClick={() => removeWatchword(w)} className="text-hormuz-gold/40 hover:text-hormuz-gold/80 leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <IntelFeed
                  items={items}
                  mapHighlightId={mapIntelPinned?.id ?? mapIntelHover?.id ?? null}
                />
              </div>
              <div className="shrink-0 border-t border-white/[0.06] px-4 py-2.5 space-y-1.5">
                <div className="font-mono-data text-[8px] text-white/22 leading-relaxed">
                  <span className="text-white/30">Refresh:</span> threat 3m · oil 5m · AIS 2m · news 3m · freight 5m · shipping 5m · trade 30m.
                  {" "}Sources:{" "}
                  <a href="https://www.eia.gov/" target="_blank" rel="noreferrer" className="text-hormuz-teal/60 hover:text-hormuz-teal underline">EIA</a>
                  {" · "}
                  <a href="https://finance.yahoo.com" target="_blank" rel="noreferrer" className="text-hormuz-teal/60 hover:text-hormuz-teal underline">Yahoo Finance</a>
                  {" · "}
                  <a href="https://aisstream.io" target="_blank" rel="noreferrer" className="text-hormuz-teal/60 hover:text-hormuz-teal underline">AISstream</a>
                  {" · "}
                  <a href="https://www.reuters.com" target="_blank" rel="noreferrer" className="text-hormuz-teal/60 hover:text-hormuz-teal underline">Reuters</a>
                  /RSS.
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-data text-[9px] text-white/18">Not financial advice</span>
                  <Link href="/markets" className="font-mono-data text-[10px] text-hormuz-gold hover:text-hormuz-gold/80 transition-colors shrink-0">Predict → Markets ↗</Link>
                </div>
              </div>
            </div>
          )}

        </div>

        <div className="shrink-0 pb-[env(safe-area-inset-bottom,0px)]">
          <NewsTicker items={items} />
        </div>
      </div>
    </>
  );
}
