/**
 * Approximate coordinates for major ports (schematic routing / map corridor).
 * Keys are matched case-insensitively against user-entered port text.
 */

import type { LatLon } from "./greatCircle";
import { greatCirclePolyline } from "./greatCircle";

export type ResolvedPort = LatLon & { label: string };

type PortRow = { keys: string[]; lat: number; lon: number; label: string };

/** Expand over time; fuzzy substring match on normalized input. */
const PORT_TABLE: PortRow[] = [
  { keys: ["fujairah"], lat: 25.12, lon: 56.34, label: "Fujairah" },
  { keys: ["jebel ali", "jebelali"], lat: 24.997, lon: 55.062, label: "Jebel Ali" },
  { keys: ["abu dhabi", "khalifa", "zayed port"], lat: 24.52, lon: 54.43, label: "Abu Dhabi area" },
  { keys: ["dubai"], lat: 25.27, lon: 55.3, label: "Dubai" },
  { keys: ["muscat", "sultan qaboos"], lat: 23.62, lon: 58.55, label: "Muscat" },
  { keys: ["sohar"], lat: 24.37, lon: 56.71, label: "Sohar" },
  { keys: ["bandar abbas"], lat: 27.18, lon: 56.28, label: "Bandar Abbas" },
  { keys: ["basrah", "basra", "umm qasr"], lat: 30.55, lon: 47.82, label: "Basrah / Umm Qasr" },
  { keys: ["kuwait", "shuaiba", "shuwaiikh"], lat: 29.34, lon: 47.92, label: "Kuwait" },
  { keys: ["doha", "hamad"], lat: 25.01, lon: 51.55, label: "Hamad / Doha" },
  { keys: ["bahrain", "khalifa bin salman"], lat: 26.24, lon: 50.62, label: "Bahrain" },
  { keys: ["jeddah"], lat: 21.48, lon: 39.18, label: "Jeddah" },
  { keys: ["king abdullah", "kaec"], lat: 22.35, lon: 39.08, label: "King Abdullah Port" },
  { keys: ["aden"], lat: 12.79, lon: 44.99, label: "Aden" },
  { keys: ["salalah"], lat: 16.95, lon: 54.00, label: "Salalah" },
  { keys: ["colombo"], lat: 6.94, lon: 79.85, label: "Colombo" },
  { keys: ["chennai", "ennore"], lat: 13.12, lon: 80.30, label: "Chennai / Ennore" },
  { keys: ["mumbai", "nhava sheva", "jnpt"], lat: 18.95, lon: 72.95, label: "Nhava Sheva / Mumbai" },
  { keys: ["mundra"], lat: 22.84, lon: 69.72, label: "Mundra" },
  { keys: ["pipavav"], lat: 20.97, lon: 71.52, label: "Pipavav" },
  { keys: ["hazira"], lat: 21.10, lon: 72.65, label: "Hazira" },
  { keys: ["kandla"], lat: 23.03, lon: 70.22, label: "Kandla" },
  { keys: ["coega", "ngqura", "port elizabeth", "gqeberha"], lat: -33.87, lon: 25.67, label: "Coega / Ngqura" },
  { keys: ["cape town"], lat: -33.91, lon: 18.44, label: "Cape Town" },
  { keys: ["durban"], lat: -29.87, lon: 31.05, label: "Durban" },
  { keys: ["singapore"], lat: 1.26, lon: 103.85, label: "Singapore" },
  { keys: ["tanjung pelepas"], lat: 1.37, lon: 103.55, label: "Tanjung Pelepas" },
  { keys: ["port kelang", "klang"], lat: 3.0, lon: 101.39, label: "Port Klang" },
  { keys: ["hong kong"], lat: 22.32, lon: 114.12, label: "Hong Kong" },
  { keys: ["shanghai", "yangshan"], lat: 31.23, lon: 121.47, label: "Shanghai" },
  { keys: ["busan"], lat: 35.09, lon: 129.04, label: "Busan" },
  { keys: ["rotterdam"], lat: 51.95, lon: 4.12, label: "Rotterdam" },
  { keys: ["hamburg"], lat: 53.55, lon: 9.98, label: "Hamburg" },
  { keys: ["antwerp"], lat: 51.23, lon: 4.42, label: "Antwerp" },
  { keys: ["felixstowe"], lat: 51.95, lon: 1.35, label: "Felixstowe" },
  { keys: ["algeciras"], lat: 36.13, lon: -5.45, label: "Algeciras" },
  { keys: ["piraeus", "athens"], lat: 37.94, lon: 23.64, label: "Piraeus" },
  { keys: ["suez"], lat: 29.97, lon: 32.55, label: "Suez" },
  { keys: ["port said"], lat: 31.27, lon: 32.31, label: "Port Said" },
  { keys: ["new york", "newark", "nynj"], lat: 40.67, lon: -74.04, label: "NY / NJ" },
  { keys: ["los angeles", "long beach", "san pedro"], lat: 33.75, lon: -118.27, label: "LA / Long Beach" },
  { keys: ["savannah"], lat: 32.13, lon: -81.15, label: "Savannah" },
  { keys: ["santos"], lat: -23.96, lon: -46.31, label: "Santos" },
];

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resolve user-entered port text to coordinates, or null if unknown. */
export function resolvePortCoordinates(raw: string): ResolvedPort | null {
  const q = normalize(raw);
  if (!q) return null;
  for (const row of PORT_TABLE) {
    for (const k of row.keys) {
      if (q.includes(k)) {
        return { lat: row.lat, lon: row.lon, label: row.label };
      }
    }
  }
  /** Whole-query match on first token */
  const first = q.split(" ")[0];
  if (first.length >= 4) {
    for (const row of PORT_TABLE) {
      if (row.keys.some((k) => k.startsWith(first) || first.startsWith(k.slice(0, 5)))) {
        return { lat: row.lat, lon: row.lon, label: row.label };
      }
    }
  }
  return null;
}

export type ShipmentRouteGeo = {
  from: ResolvedPort;
  to: ResolvedPort;
  path: [number, number][];
};

/** Full great-circle path for map + fitting bounds. */
export function buildShipmentRoute(fromRaw: string, toRaw: string): ShipmentRouteGeo | null {
  const from = resolvePortCoordinates(fromRaw);
  const to = resolvePortCoordinates(toRaw);
  if (!from || !to) return null;
  const path = greatCirclePolyline(from, to, 128);
  return { from, to, path };
}
