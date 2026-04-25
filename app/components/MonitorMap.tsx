import { useEffect, useRef } from "react";
import type { VesselData } from "../pages/api/monitor/vessels";

const CENTER: [number, number] = [26.2, 57.5];
const ZOOM = 6;

// Threat level → lane color
const LANE_COLORS = ["#00B4CC", "#C9A84C", "#f97316", "#CC2936"] as const;

// ─── Shipping lane geometry (approximate real-world maritime routing) ─────────

// Hormuz Traffic Separation Scheme (TSS) — simplified
// Inbound lane: ships entering Persian Gulf (along Oman coast, southern side)
const TSS_INBOUND: [number, number][] = [
  [22.0, 61.5], [23.5, 59.8], [24.8, 58.4], [25.7, 57.6],
  [26.1, 57.1], [26.3, 56.75], [26.45, 56.4], [26.6, 56.05], [26.8, 55.7],
];

// Outbound lane: ships leaving Gulf (along Iranian coast, northern side)
const TSS_OUTBOUND: [number, number][] = [
  [26.9, 55.5], [26.75, 55.9], [26.55, 56.3], [26.4, 56.65],
  [26.2, 57.0], [25.5, 57.8], [24.2, 58.8], [22.8, 60.2], [22.0, 61.5],
];

// Persian Gulf main shipping corridor (inbound: Kuwait/Saudi/Qatar/UAE)
const GULF_LANE: [number, number][] = [
  [29.0, 48.5], [27.5, 49.5], [26.5, 51.0], [25.0, 53.5], [24.2, 55.0],
  [24.8, 56.3], [26.45, 56.4],
];

// Arabian Sea approach (from Indian Ocean to strait)
const ARABIAN_SEA_APPROACH: [number, number][] = [
  [16.0, 66.0], [18.5, 63.5], [20.5, 62.0], [22.0, 61.5],
];

// Alternative route 1: Red Sea → Bab el-Mandeb (Gulf of Aden to Suez)
const RED_SEA_ROUTE: [number, number][] = [
  [22.0, 61.5], [19.0, 59.0], [16.0, 54.0], [13.0, 48.0], [12.6, 43.3], [12.0, 42.5],
];

// Alternative route 2: India / Asia eastbound — extended to Singapore/Malacca
const ASIA_ROUTE: [number, number][] = [
  [22.0, 61.5], [20.0, 65.0], [17.5, 70.0], [14.0, 74.5],
  [10.0, 78.0], [6.0, 80.5], [2.5, 82.5], [2.5, 102.0], // → Malacca Strait
];

// Full Cape of Good Hope bypass (Arabian Sea → around Africa → NW Europe)
const CAPE_BYPASS: [number, number][] = [
  [22.0, 61.5],   // Hormuz exit
  [15.0, 60.0],   // Arabian Sea south
  [12.0, 54.0],   // Gulf of Aden
  [11.5, 50.5],   // Horn of Africa
  [7.0, 48.5],
  [2.0, 44.5],
  [-5.0, 41.0],   // Kenya coast
  [-12.0, 41.0],  // Tanzania
  [-20.0, 38.0],  // Mozambique
  [-26.0, 34.0],  // South Africa east
  [-34.4, 26.5],  // Cape Agulhas
  [-34.8, 18.4],  // Cape of Good Hope
  [-30.0, 15.0],
  [-25.0, 8.0],
  [-15.0, 2.0],
  [0.0,  -5.0],   // Gulf of Guinea
  [10.0, -17.0],  // West Africa
  [20.0, -17.0],
  [28.0, -13.5],
  [35.9,  -5.8],  // Gibraltar
  [43.0,  -9.0],  // Portugal
  [51.0,   1.0],  // English Channel
];

// ─── Pipeline alternatives (Hormuz bypass — oil only) ────────────────────────

// Saudi Arabia: East-West Pipeline (SCPX/Petroline) Abqaiq → Yanbu
// Capacity: ~4.8M bbl/day | Operational since 1981 | Key strategic bypass
const SAUDI_PIPELINE: [number, number][] = [
  [25.93, 49.66], // Abqaiq (near Dhahran — Saudi oil processing hub)
  [25.50, 46.80],
  [24.80, 43.50],
  [24.09, 38.05], // Yanbu (Red Sea terminal)
];

// UAE: Habshan-Fujairah Pipeline | Capacity: ~1.5M bbl/day | Operational since 2012
const UAE_PIPELINE: [number, number][] = [
  [24.15, 53.70], // Habshan (Abu Dhabi interior)
  [24.40, 55.00],
  [24.80, 55.80],
  [25.12, 56.34], // Fujairah (outside Hormuz — Indian Ocean facing)
];

// Iraq-Turkey: Kirkuk-Ceyhan pipeline | Capacity: ~0.75M bbl/day (intermittent)
const IRAQ_TURKEY_PIPELINE: [number, number][] = [
  [35.47, 44.39], // Kirkuk (Northern Iraq oil fields)
  [36.20, 42.80],
  [36.90, 40.20],
  [37.20, 38.00],
  [36.90, 36.30],
  [36.85, 35.80], // Ceyhan (Turkey Mediterranean terminal)
];

// ─── Iran's 12 nm territorial water boundary (approximate) ──────────────────
// Key points along Iran's Persian Gulf / Strait coast — 12 nm seaward
const IRAN_TERRITORIAL: [number, number][] = [
  [27.10, 52.50], [27.30, 53.20], [27.45, 54.10], [27.55, 54.80],
  [27.65, 55.40], [27.72, 56.00], [27.55, 56.35], [27.20, 56.55],
  [27.00, 56.80], [26.78, 57.05], [26.55, 57.30], [26.30, 57.55],
  [26.10, 57.80], [25.90, 58.10], [25.60, 58.50], [25.30, 58.90],
  [25.00, 59.30], [24.80, 59.80], [24.60, 60.20],
];

// ─── Key port positions ───────────────────────────────────────────────────────

const PORTS = [
  { name: "Jebel Ali",     country: "UAE",  lat: 24.997, lon: 55.062, role: "Largest port in ME · ~22M TEU/yr",        color: "#00B4CC" },
  { name: "Fujairah",      country: "UAE",  lat: 25.122, lon: 56.336, role: "Oil terminal · Outside Hormuz — UAE pipeline terminus", color: "#00B4CC" },
  { name: "Bandar Abbas",  country: "Iran", lat: 27.183, lon: 56.289, role: "Iran's main commercial port",              color: "#CC2936" },
  { name: "Muscat",        country: "Oman", lat: 23.614, lon: 58.593, role: "Port Sultan Qaboos · Regional hub",        color: "#22c55e" },
  { name: "Abu Dhabi",     country: "UAE",  lat: 24.451, lon: 54.376, role: "Capital · Major oil loading terminal",     color: "#00B4CC" },
  { name: "Sohar",         country: "Oman", lat: 24.353, lon: 56.706, role: "Industrial port · Steel, chemicals",       color: "#22c55e" },
  { name: "Ras al-Khair",  country: "KSA",  lat: 27.017, lon: 49.326, role: "Saudi phosphate & bauxite export terminal", color: "#C9A84C" },
  { name: "Yanbu",         country: "KSA",  lat: 24.09,  lon: 38.05,  role: "Saudi SCPX pipeline terminus · Red Sea oil export · ~4.8M bbl/day capacity", color: "#C9A84C" },
  { name: "Abqaiq",        country: "KSA",  lat: 25.93,  lon: 49.66,  role: "World's largest oil processing facility · SCPX pipeline origin", color: "#C9A84C" },
  { name: "Ras Tanura",    country: "KSA",  lat: 26.64,  lon: 50.16,  role: "Saudi Aramco's primary crude export terminal · ~6M bbl/day", color: "#C9A84C" },
  { name: "Kharg Island",  country: "Iran", lat: 29.26,  lon: 50.32,  role: "Iran's main oil export terminal · ~90% of crude exports", color: "#CC2936" },
];

// ─── Global strategic chokepoints & canals (diamond markers when layer on) ──
// Representative positions for logistics risk awareness — not pilot charts.

function escPopup(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

const CHOKEPOINTS = [
  { name: "Suez Canal",         lat: 30.58,  lon: 32.34,  oil: "~1.25M bbl/day",  trade: "~12% global trade",   detail: "205 m wide · Europe–Asia shortcut · Red Sea disruption risk" },
  { name: "Bab el-Mandeb",      lat: 12.60,  lon: 43.30,  oil: "~4.8M bbl/day",   trade: "~10% seaborne trade",   detail: "29 km · Indian Ocean ↔ Red Sea · Security corridor" },
  { name: "Malacca Strait",     lat: 2.50,   lon: 102.00, oil: "~15M bbl/day",    trade: "~25% world trade",     detail: "2.8 km min width · East–West trunk · Piracy / traffic risk" },
  { name: "Singapore Strait",   lat: 1.22,   lon: 103.82, oil: "High product flow", trade: "Top-3 box choke",     detail: "Malacca feeder · VLCC & container convergence" },
  { name: "Panama Canal",       lat: 9.08,   lon: -79.68, oil: "~0.5M bbl/day",   trade: "~5% seaborne trade",   detail: "Locks · Americas east–west · Neo-Panamax draft limits" },
  { name: "Strait of Gibraltar", lat: 36.14, lon: -5.35, oil: "~3M bbl/day",     trade: "Med ↔ Atlantic",       detail: "13 km min · LNG & crude into Med · ULCV routing" },
  { name: "Dover Strait",       lat: 51.05,  lon: 1.45,   oil: "Products / bunkers", trade: "UK–EU shortsea",    detail: "World’s busiest 2-way TSS · Weather & ferry density" },
  { name: "Turkish Straits",    lat: 41.12,  lon: 29.05, oil: "~2.4M bbl/day",   trade: "Black Sea grain & steel", detail: "Bosphorus + Dardanelles · Draft & winter closures" },
  { name: "Taiwan Strait",      lat: 24.20,  lon: 119.85, oil: "Major product lane", trade: "East Asia trunk",   detail: "110–130 nm wide · Contingency routing via Philippines" },
  { name: "Korea Strait",       lat: 34.60,  lon: 129.55, oil: "Russian + Mideast crude", trade: "NE Asia entry", detail: "Tsushima / Korea Strait TSS · Typhoon season" },
  { name: "Great Belt (Denmark)", lat: 54.95, lon: 11.10, oil: "Baltic crude products", trade: "Russian exports", detail: "Great Belt + Fehmarn · Draft / ice winter ops" },
  { name: "Saint Lawrence",     lat: 47.20,  lon: -70.50, oil: "US/Canada crude", trade: "Seaway locks",        detail: "St. Lawrence Seaway · Seasonal draft / ice" },
  { name: "Strait of Magellan", lat: -52.50, lon: -69.50, oil: "Fuel bunkers",   trade: "Cape alt routing",     detail: "Narrow passages · Weather · LNG carriers occasional" },
  { name: "Lombok Strait",      lat: -8.40,  lon: 115.90, oil: "VLCC deep draft", trade: "Deep-water Malacca alt", detail: "Deeper than Sunda · VLCC eastbound preference" },
  { name: "Sunda Strait",       lat: -6.00,  lon: 105.80, oil: "Shallow crude risk", trade: "Malacca shortcut alt", detail: "Shallower than Lombok · Draft-sensitive VLCC" },
  { name: "Torres Strait",      lat: -10.50, lon: 142.20, oil: "Coastal bunkers", trade: "Aus north coast",      detail: "Pilotage / under-keel clearance · Cyclone season" },
  { name: "Windward Passage",   lat: 20.20,  lon: -73.80, oil: "Americas bunkers", trade: "Caribbean trunk",     detail: "Cuba–Haiti gap · Hurricane corridor" },
  { name: "Mozambique Channel", lat: -16.0, lon: 42.00, oil: "East Africa bunkers", trade: "Cape route feeder", detail: "Wide but weather / piracy watch (historical)" },
];

// ─── World canal / lock-system geometry (schematic polylines — not for navigation) ─
const CANAL_GEOMETRIES: Array<{
  name: string;
  detail: string;
  coords: [number, number][];
  color: string;
  weight: number;
  opacity: number;
  dashArray?: string;
}> = [
  {
    name: "Panama Canal",
    detail: "Caribbean ↔ Pacific · Locks · Neo-Panamax draft limits · ~50M t/yr cargo",
    coords: [
      [9.38, -79.92], [9.28, -79.84], [9.15, -79.76], [9.08, -79.68], [8.98, -79.58], [8.88, -79.52], [8.78, -79.45],
    ],
    color: "#2dd4bf", weight: 2.2, opacity: 0.85, dashArray: "5 4",
  },
  {
    name: "Suez Canal",
    detail: "Mediterranean ↔ Red Sea · ~12% global trade · No locks (sea-level)",
    coords: [
      [31.26, 32.31], [30.85, 32.28], [30.45, 32.30], [30.10, 32.38], [30.00, 32.52], [29.97, 32.55],
    ],
    color: "#2dd4bf", weight: 2.2, opacity: 0.85, dashArray: "5 4",
  },
  {
    name: "Kiel Canal",
    detail: "North Sea ↔ Baltic · Brunsbüttel–Kiel · Saves ~250 nm around Jutland",
    coords: [
      [53.90, 9.15], [54.02, 9.32], [54.15, 9.52], [54.25, 9.82], [54.32, 10.15],
    ],
    color: "#38bdf8", weight: 2, opacity: 0.8, dashArray: "4 5",
  },
  {
    name: "Corinth Canal",
    detail: "Gulf of Corinth ↔ Saronic · ~6 km cut · Saves ~185 nm around Peloponnese",
    coords: [[37.935, 22.99], [37.955, 23.04], [37.975, 23.09], [37.99, 23.13]],
    color: "#a78bfa", weight: 2, opacity: 0.82, dashArray: "3 4",
  },
  {
    name: "Welland Canal",
    detail: "Lake Erie ↔ Lake Ontario · St. Lawrence Seaway system · Locks",
    coords: [
      [42.87, -79.25], [42.95, -79.18], [43.05, -79.14], [43.15, -79.12], [43.22, -79.16],
    ],
    color: "#38bdf8", weight: 1.8, opacity: 0.75, dashArray: "4 5",
  },
  {
    name: "Volga–Don Canal",
    detail: "Caspian ↔ Black Sea inland link · Volga–Don shipping route (schematic)",
    coords: [
      [45.85, 44.05], [46.45, 44.08], [47.35, 44.35], [48.20, 44.52], [48.52, 44.58],
    ],
    color: "#94a3b8", weight: 1.8, opacity: 0.65, dashArray: "6 5",
  },
  {
    name: "North Sea Canal",
    detail: "IJmuiden ↔ Amsterdam · North Sea inland port access",
    coords: [[52.47, 4.59], [52.42, 4.78], [52.38, 4.89]],
    color: "#38bdf8", weight: 1.6, opacity: 0.72, dashArray: "4 5",
  },
  {
    name: "Houston Ship Channel",
    detail: "US Gulf petchem & crude logistics · Sabine–Galveston corridor (upper reach)",
    coords: [
      [29.78, -95.28], [29.72, -95.15], [29.68, -95.05], [29.62, -94.95],
    ],
    color: "#64748b", weight: 1.8, opacity: 0.7, dashArray: "3 5",
  },
  {
    name: "White Sea–Baltic Canal",
    detail: "Russia inland waterway · White Sea ↔ Lake Onega (schematic trunk)",
    coords: [
      [61.10, 34.80], [62.40, 35.40], [63.60, 35.85], [64.50, 36.10],
    ],
    color: "#94a3b8", weight: 1.5, opacity: 0.55, dashArray: "8 6",
  },
];

export type NewsMarker = {
  id: string;
  lat: number; lon: number;
  title: string; source: string;
  snippet: string;
  pubDate: string;
  severity: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  link: string;
};

/** Parent requests map pan/zoom (e.g. chokepoint / route panel). `seq` increments so repeats re-trigger. */
export type MapViewportCommand = { lat: number; lon: number; zoom: number; seq: number };

export type LayerConfig = {
  lanes:        boolean;
  altRoutes:    boolean;
  capeRoute:    boolean;
  pipelines:    boolean;
  iranBorder:   boolean;
  ports:        boolean;
  chokepoints:  boolean;
  /** Schematic polylines: Panama, Suez, Kiel, Corinth, Welland, Volga–Don, etc. */
  canalRoutes:  boolean;
  newsMarkers:  boolean;
};

export const DEFAULT_LAYERS: LayerConfig = {
  lanes: true, altRoutes: true, capeRoute: true,
  pipelines: true, iranBorder: true, ports: true,
  chokepoints: true, canalRoutes: true, newsMarkers: true,
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "#CC2936", HIGH: "#f97316", NORMAL: "#C9A84C", LOW: "#22c55e",
};

const ZOOM_PRESETS = [
  { label: "World",    lat: 12.0,  lon: 25.0,  zoom: 2 },
  { label: "Strait",   lat: 26.56, lon: 56.15, zoom: 9 },
  { label: "Gulf",     lat: 26.0,  lon: 52.0,  zoom: 6 },
  { label: "Oman Sea", lat: 22.0,  lon: 59.0,  zoom: 7 },
  { label: "Red Sea",  lat: 20.0,  lon: 38.0,  zoom: 6 },
  { label: "Cape GH",  lat: -34.4, lon: 18.5,  zoom: 6 },
];

type Props = {
  vesselData:   VesselData | null;
  threatLevel?: number;
  layers?:      LayerConfig;
  newsMarkers?: NewsMarker[];
  /** Hover a geolocated news marker → parent shows live preview (Monitor the Situation–style). */
  onNewsIntelHover?: (marker: NewsMarker | null) => void;
  /** Click a marker → pin full intel card in parent panel. */
  onNewsIntelSelect?: (marker: NewsMarker | null) => void;
  /** Fly map to region when user picks a chokepoint / supply route in a panel. */
  mapViewport?: MapViewportCommand | null;
};

export default function MonitorMap({
  vesselData,
  threatLevel = 0,
  layers = DEFAULT_LAYERS,
  newsMarkers = [],
  onNewsIntelHover,
  onNewsIntelSelect,
  mapViewport,
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<any>(null);
  const hoverCb = useRef(onNewsIntelHover);
  const selectCb = useRef(onNewsIntelSelect);
  hoverCb.current = onNewsIntelHover;
  selectCb.current = onNewsIntelSelect;

  // Initialize map
  useEffect(() => {
    if (typeof window === "undefined" || !mapRef.current) return;
    if (mapInstance.current) return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstance.current) return;

      const map = L.map(mapRef.current, {
        center: CENTER,
        zoom: ZOOM,
        zoomControl: false,
        attributionControl: false,
      });

      // Zoom control — move to bottom-right to avoid toolbar collision
      L.control.zoom({ position: "bottomright" }).addTo(map);

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 19 }
      ).addTo(map);

      L.control
        .attribution({ prefix: false, position: "bottomright" })
        .addAttribution('© <a href="https://carto.com/">CARTO</a>')
        .addTo(map);

      // Strait centroid marker
      const straitIcon = L.divIcon({
        html: `<div style="
          width:10px;height:10px;border-radius:50%;
          background:#C9A84C;border:2px solid rgba(255,255,255,0.4);
          box-shadow:0 0 10px #C9A84C88,0 0 3px #C9A84C;
        "></div>`,
        className: "",
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });

      L.marker([26.56, 56.15], { icon: straitIcon })
        .addTo(map)
        .bindPopup(
          '<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px">' +
          "<b>Strait of Hormuz</b><br>26°33′N 56°15′E<br>Width: ~33 km<br>~21M bbl/day transit</div>"
        );

      mapInstance.current = map;
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Respond to parent viewport commands (chokepoints / supply routes UI)
  useEffect(() => {
    if (!mapInstance.current || !mapViewport) return;
    try {
      mapInstance.current.flyTo([mapViewport.lat, mapViewport.lon], mapViewport.zoom, { duration: 0.85, animate: true });
    } catch {
      /* map not ready */
    }
  }, [mapViewport]);

  // Draw / update shipping lanes and map layers
  useEffect(() => {
    if (!mapInstance.current) return;

    import("leaflet").then((L) => {
      const map = mapInstance.current;
      if (!map) return;

      if ((map as Record<string, unknown>)._laneLayerGroup) {
        ((map as Record<string, unknown>)._laneLayerGroup as ReturnType<typeof L.layerGroup>).remove();
      }

      const laneColor = LANE_COLORS[Math.min(threatLevel, 3)];
      const altColor = "#ffffff22";
      const flowStyle = { color: laneColor, weight: 2.5, opacity: 0.88, dashArray: "12 8", className: "lane-animated" };
      const flowStyleSlow = { color: laneColor, weight: 1.5, opacity: 0.55, dashArray: "8 6", className: "lane-animated-slow" };

      const layersList = [
        // ── Main shipping lanes ──
        ...(layers.lanes ? [
          L.polyline(TSS_INBOUND, flowStyle)
            .bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>TSS Inbound Lane →</b><br>Ships entering Persian Gulf<br>(Traffic Separation Scheme)<br>Max 25 kn · Oman coast side</div>'),
          L.polyline(TSS_OUTBOUND, flowStyle)
            .bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>TSS Outbound Lane ←</b><br>Ships leaving Persian Gulf<br>(Traffic Separation Scheme)<br>Iranian coast side</div>'),
          L.polyline(GULF_LANE, flowStyleSlow)
            .bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>Persian Gulf Main Channel</b><br>Kuwait / Saudi Arabia / Qatar / UAE → Hormuz</div>'),
          L.polyline(ARABIAN_SEA_APPROACH, flowStyleSlow)
            .bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>Arabian Sea Approach</b><br>Indian Ocean → Hormuz · Main transit corridor</div>'),
        ] : []),

        // ── Alternative maritime routes ──
        ...(layers.altRoutes ? [
          L.polyline(RED_SEA_ROUTE, { color: threatLevel >= 2 ? "#f97316" : altColor, weight: 1.5, opacity: threatLevel >= 2 ? 0.65 : 0.2, dashArray: "4 8" })
            .bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>Red Sea / Suez Alternative</b><br>Via Bab el-Mandeb → Suez Canal · +8 days</div>'),
          L.polyline(ASIA_ROUTE, { color: altColor, weight: 1, opacity: 0.18, dashArray: "4 8" })
            .bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>Eastbound — Indian Ocean → South Asia → Malacca</b></div>'),
        ] : []),

        // ── Cape of Good Hope bypass ──
        ...(layers.capeRoute ? [
          L.polyline(CAPE_BYPASS, {
            color: threatLevel >= 2 ? "#f97316" : "#ffffff18",
            weight: threatLevel >= 2 ? 1.5 : 1,
            opacity: threatLevel >= 2 ? 0.55 : 0.12,
            dashArray: "6 10",
          }).bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>Cape of Good Hope Bypass</b><br>Full rerouting via South Africa<br>+19 days · +6,400 nm · ~$4M extra/voyage</div>'),
        ] : []),

        // ── Pipelines ──
        ...(layers.pipelines ? [
          L.polyline(SAUDI_PIPELINE, { color: "#C9A84C", weight: 2, opacity: 0.75, dashArray: "2 4" })
            .bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>Saudi SCPX Pipeline</b><br>Abqaiq → Yanbu · ~4.8M bbl/day · Hormuz bypass</div>'),
          L.polyline(UAE_PIPELINE, { color: "#00B4CC", weight: 2, opacity: 0.75, dashArray: "2 4" })
            .bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>UAE Habshan-Fujairah Pipeline</b><br>Abu Dhabi → Fujairah · ~1.5M bbl/day · OPERATIONAL</div>'),
          L.polyline(IRAQ_TURKEY_PIPELINE, { color: "#a78bfa", weight: 1.5, opacity: 0.55, dashArray: "2 4" })
            .bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>Iraq-Turkey Pipeline (Kirkuk-Ceyhan)</b><br>Northern Iraq → Turkey · ~0.75M bbl/day</div>'),
        ] : []),

        // ── Iran 12 nm territorial waters ──
        ...(layers.iranBorder ? [
          L.polyline(IRAN_TERRITORIAL, { color: "#CC293688", weight: 1.5, opacity: 0.7, dashArray: "3 5" })
            .bindPopup('<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px"><b>Iran 12 nm Territorial Waters</b><br>IRGC Navy patrol zone · Seizure risk</div>'),
        ] : []),

        // ── World canal & lock-system geometry (schematic) ──
        ...(layers.canalRoutes
          ? CANAL_GEOMETRIES.map((c) =>
              L.polyline(c.coords, {
                color: c.color,
                weight: c.weight,
                opacity: c.opacity,
                dashArray: c.dashArray ?? "4 6",
              }).bindPopup(
                `<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px;max-width:240px">` +
                  `<b>${escPopup(c.name)}</b><br>` +
                  `<span style="color:#555">${escPopup(c.detail)}</span><br>` +
                  `<span style="font-size:9px;color:#888">Schematic path — not for navigation</span></div>`
              )
            )
          : []),
      ];

      const group = L.layerGroup(layersList).addTo(map);
      (map as Record<string, unknown>)._laneLayerGroup = group;
    });
  }, [threatLevel, layers]);

  // Draw / update port + chokepoint markers
  useEffect(() => {
    if (!mapInstance.current) return;

    import("leaflet").then((L) => {
      const map = mapInstance.current;
      if (!map) return;

      if ((map as Record<string, unknown>)._portLayerGroup) {
        ((map as Record<string, unknown>)._portLayerGroup as ReturnType<typeof L.layerGroup>).remove();
        delete (map as Record<string, unknown>)._portLayerGroup;
      }

      if (!layers.ports && !layers.chokepoints) return;

      const portMarkers = PORTS.map((p) => {
        const icon = L.divIcon({
          html: `<div style="
            width:8px;height:8px;border-radius:1px;
            background:${p.color};border:1px solid rgba(255,255,255,0.35);
            box-shadow:0 0 5px ${p.color}66;
          "></div>`,
          className: "",
          iconSize: [8, 8],
          iconAnchor: [4, 4],
        });
        return L.marker([p.lat, p.lon], { icon })
          .bindPopup(
            `<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px;min-width:160px">` +
            `<b>${p.name}</b> <span style="color:#666">(${p.country})</span><br>` +
            `<span style="color:#555">${p.role}</span></div>`
          );
      });

      // Global chokepoint markers — diamond shape, labeled
      const chopkeyMarkers = CHOKEPOINTS.map((c) => {
        const icon = L.divIcon({
          html: `<div style="
            width:10px;height:10px;
            background:#f9731688;
            border:1px solid #f97316;
            transform:rotate(45deg);
            box-shadow:0 0 8px #f9731644;
          "></div>`,
          className: "",
          iconSize: [10, 10],
          iconAnchor: [5, 5],
        });
        return L.marker([c.lat, c.lon], { icon })
          .bindPopup(
            `<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px;min-width:180px">` +
            `<b>${escPopup(c.name)}</b><br>` +
            `Oil: ${escPopup(c.oil)} · Trade: ${escPopup(c.trade)}<br>` +
            `<span style="color:#555">${escPopup(c.detail)}</span></div>`
          );
      });

      const allMarkers = [
        ...(layers.ports ? portMarkers : []),
        ...(layers.chokepoints ? chopkeyMarkers : []),
      ];
      const group = L.layerGroup(allMarkers).addTo(map);
      (map as Record<string, unknown>)._portLayerGroup = group;
    });
  }, [layers]);

  // Draw vessel dots
  useEffect(() => {
    if (!mapInstance.current || !vesselData?.vessels) return;

    import("leaflet").then((L) => {
      const map = mapInstance.current;
      if (!map) return;

      if ((map as Record<string, unknown>)._vesselMarkers) {
        ((map as Record<string, unknown>)._vesselMarkers as ReturnType<typeof L.marker>[])
          .forEach((m: ReturnType<typeof L.marker>) => map.removeLayer(m));
      }

      const vesselIcon = L.divIcon({
        html: `<div style="
          width:6px;height:6px;border-radius:50%;
          background:#00B4CC;border:1px solid rgba(255,255,255,0.3);
          box-shadow:0 0 4px #00B4CC88;
        "></div>`,
        className: "",
        iconSize: [6, 6],
        iconAnchor: [3, 3],
      });

      const markers = vesselData.vessels
        .filter((v) => v.lat && v.lon)
        .map((v) =>
          L.marker([v.lat, v.lon], { icon: vesselIcon })
            .addTo(map)
            .bindPopup(
              `<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px">` +
              `<b>${v.name || "Unknown"}</b><br>` +
              `Speed: ${v.speed.toFixed(1)} kn · Course: ${v.course.toFixed(0)}°<br>` +
              `MMSI: ${v.mmsi}</div>`
            )
        );

      (map as Record<string, unknown>)._vesselMarkers = markers;
    });
  }, [vesselData]);

  // Draw / update geolocated news markers
  useEffect(() => {
    if (!mapInstance.current) return;
    if (!newsMarkers.length || !layers.newsMarkers) {
      import("leaflet").then((L) => {
        if ((mapInstance.current as Record<string, unknown>)?._newsMarkerGroup)
          ((mapInstance.current as Record<string, unknown>)._newsMarkerGroup as ReturnType<typeof L.layerGroup>).remove();
      });
      return;
    }
    import("leaflet").then((L) => {
      const map = mapInstance.current;
      if (!map) return;
      if ((map as Record<string, unknown>)._newsMarkerGroup) {
        ((map as Record<string, unknown>)._newsMarkerGroup as ReturnType<typeof L.layerGroup>).remove();
      }
      const markers = newsMarkers.map((nm) => {
        const col = SEVERITY_COLOR[nm.severity] ?? "#C9A84C";
        const icon = L.divIcon({
          html: `<div style="
            position:relative;width:12px;height:12px;
          "><div style="
            position:absolute;inset:0;border-radius:50%;
            background:${col};opacity:0.25;
            animation:news-ping 1.8s ease-in-out infinite;
          "></div><div style="
            position:absolute;inset:2px;border-radius:50%;
            background:${col};border:1px solid rgba(255,255,255,0.6);
            box-shadow:0 0 5px ${col}99;
          "></div></div>`,
          className: "",
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });
        const srcLabel = (nm.source ?? "").split(" ")[0].toUpperCase().slice(0, 7) || "NEWS";
        const mk = L.marker([nm.lat, nm.lon], { icon });
        mk.bindPopup(
          `<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px;max-width:220px">` +
          `<span style="display:inline-block;background:${col};color:#fff;font-size:9px;padding:1px 5px;border-radius:2px;margin-bottom:4px">${nm.severity}</span> ` +
          `<span style="font-size:9px;color:#555">${srcLabel}</span><br>` +
          `<span style="font-size:10px;line-height:1.35;color:#0A0E1A">${(nm.title || "").replace(/</g, "&lt;").slice(0, 140)}</span><br>` +
          `<span style="font-size:8px;color:#888;margin-top:4px;display:block">Click marker for full intel panel · or open:</span> ` +
          `<a href="${nm.link}" target="_blank" rel="noreferrer" style="color:#0066cc;font-size:9px">article</a></div>`,
          { closeButton: true }
        );
        mk.on("mouseover", () => { hoverCb.current?.(nm); });
        mk.on("mouseout", () => { hoverCb.current?.(null); });
        mk.on("click", (ev: { originalEvent?: MouseEvent }) => {
          if (ev?.originalEvent) {
            ev.originalEvent.stopPropagation?.();
            ev.originalEvent.preventDefault?.();
          }
          selectCb.current?.(nm);
        });
        return mk;
      });
      const group = L.layerGroup(markers).addTo(map);
      (map as Record<string, unknown>)._newsMarkerGroup = group;
    });
  }, [newsMarkers, layers.newsMarkers]);

  function zoomTo(lat: number, lon: number, zoom: number) {
    if (mapInstance.current) mapInstance.current.setView([lat, lon], zoom, { animate: true });
  }

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />

      {/* ── Zoom preset buttons (full width wrap on phones; centered on lg+) ── */}
      <div className="absolute top-2 left-2 right-2 z-[1050] flex flex-wrap justify-center gap-1 touch-manipulation lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:px-0 max-w-none">
        {ZOOM_PRESETS.map((p) => (
          <button
            type="button"
            key={p.label}
            onClick={() => zoomTo(p.lat, p.lon, p.zoom)}
            title={`Zoom to ${p.label}`}
            className="font-mono-data text-[8px] uppercase tracking-wider px-2.5 py-2 sm:py-1 rounded-sm transition-all whitespace-nowrap min-h-[40px] sm:min-h-0"
            style={{
              background: "rgba(8,12,22,0.88)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(6px)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#00B4CC"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#00B4CC55"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.55)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)"; }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
