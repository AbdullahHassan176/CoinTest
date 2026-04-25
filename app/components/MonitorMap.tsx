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

// ─── Global strategic chokepoints (marker only, not Hormuz) ──────────────────

const CHOKEPOINTS = [
  { name: "Suez Canal",      lat: 30.58, lon: 32.34, oil: "~1.25M bbl/day",  trade: "~12% global trade",  detail: "205 m wide canal · ~50 ships/day · Houthi threat via Red Sea" },
  { name: "Bab el-Mandeb",   lat: 12.60, lon: 43.30, oil: "~4.8M bbl/day",  trade: "~10% seaborne trade", detail: "29 km wide · Red Sea → Gulf of Aden · Active Houthi threat zone" },
  { name: "Malacca Strait",  lat:  2.50, lon:102.00, oil: "~15M bbl/day",   trade: "~25% world trade",    detail: "2.8 km min width · Busiest shipping lane · Piracy risk" },
];

export type NewsMarker = {
  lat: number; lon: number;
  title: string; source: string;
  severity: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  link: string;
};

export type LayerConfig = {
  lanes:       boolean;
  altRoutes:   boolean;
  capeRoute:   boolean;
  pipelines:   boolean;
  iranBorder:  boolean;
  ports:       boolean;
  chokepoints: boolean;
  newsMarkers: boolean;
};

export const DEFAULT_LAYERS: LayerConfig = {
  lanes: true, altRoutes: true, capeRoute: true,
  pipelines: true, iranBorder: true, ports: true,
  chokepoints: true, newsMarkers: true,
};

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "#CC2936", HIGH: "#f97316", NORMAL: "#C9A84C", LOW: "#22c55e",
};

const ZOOM_PRESETS = [
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
};

export default function MonitorMap({
  vesselData,
  threatLevel = 0,
  layers = DEFAULT_LAYERS,
  newsMarkers = [],
}: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstance = useRef<any>(null);

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
            `<b>⬦ ${c.name}</b><br>` +
            `Oil: ${c.oil} · Trade: ${c.trade}<br>` +
            `<span style="color:#555">${c.detail}</span></div>`
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
        return L.marker([nm.lat, nm.lon], { icon }).bindPopup(
          `<div style="font-family:IBM Plex Mono,monospace;font-size:11px;color:#0A0E1A;padding:4px;max-width:220px">` +
          `<span style="display:inline-block;background:${col};color:#fff;font-size:9px;padding:1px 5px;border-radius:2px;margin-bottom:4px">${nm.severity}</span> ` +
          `<span style="font-size:9px;color:#555">${srcLabel}</span><br>` +
          `<a href="${nm.link}" target="_blank" rel="noreferrer" style="color:#0A0E1A;text-decoration:underline;font-size:10px;line-height:1.4">${nm.title}</a></div>`
        );
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

      {/* ── Zoom preset buttons — positioned TOP-CENTER to avoid action bar collision ── */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1050] flex gap-1">
        {ZOOM_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => zoomTo(p.lat, p.lon, p.zoom)}
            title={`Zoom to ${p.label}`}
            className="font-mono-data text-[8px] uppercase tracking-wider px-2 py-1 rounded-sm transition-all whitespace-nowrap"
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
