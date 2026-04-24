/**
 * /api/monitor/vessels
 *
 * Tries two free AIS data sources in priority order:
 *
 * 1. AISstream.io (WebSocket) — best real-time streaming, but free tier
 *    uses terrestrial receivers only. Persian Gulf has NO coverage on the
 *    free plan. Requires satellite plan (~$49-99/mo) for Gulf data.
 *    Set AISSTREAM_API_KEY in .env.local.
 *
 * 2. AISHub (REST) — community AIS network. Free to join at aishub.net.
 *    Coverage depends on volunteer receivers; sparse but possible in Gulf.
 *    Set AISHUB_USERNAME in .env.local after registering at aishub.net.
 *    Rate limit: max 1 request/minute (we cache for 2 minutes so it's fine).
 *
 * Without any key, returns { noKey: true } and the frontend shows links to
 * MarineTraffic / VesselFinder for live vessel viewing in a new tab.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import WebSocket from "ws";

// Strait of Hormuz bounding box
const BBOX_AISSTREAM = [[25.0, 55.0], [27.5, 59.5]]; // [minLat, minLon], [maxLat, maxLon]
const BBOX_AISHUB = { latmin: 25.0, latmax: 27.5, lonmin: 55.0, lonmax: 59.5 };

// How long to collect AIS messages before closing the WS (ms)
// Hormuz is busy — 6s should capture 5–20+ position reports
const COLLECT_MS = 6000;

// Maximum vessels to return
const MAX_VESSELS = 80;

export type Vessel = {
  mmsi:     string;
  name:     string;
  shipType: string;
  lat:      number;
  lon:      number;
  speed:    number;
  course:   number;
  heading:  number;
  navStatus:string;
};

export type VesselData = {
  count:    number | null;
  vessels:  Vessel[];
  updatedAt:string;
  noKey?:   boolean;
  error?:   string;
};

// Map AIS navigation status code → human label
const NAV_STATUS: Record<number, string> = {
  0: "Under way (engine)",
  1: "At anchor",
  2: "Not under command",
  3: "Restricted manoeuvrability",
  4: "Constrained by draught",
  5: "Moored",
  6: "Aground",
  7: "Engaged in fishing",
  8: "Under way (sailing)",
  15: "Default",
};

// Map AIS ship type number → readable category
function shipCategory(typeNum: number): string {
  if (typeNum >= 80 && typeNum <= 89) return "Tanker";
  if (typeNum >= 70 && typeNum <= 79) return "Cargo";
  if (typeNum >= 60 && typeNum <= 69) return "Passenger";
  if (typeNum === 30)                 return "Fishing";
  if (typeNum >= 50 && typeNum <= 59) return "Service/Tug";
  if (typeNum >= 35 && typeNum <= 39) return "Military";
  if (typeNum >= 40 && typeNum <= 49) return "HSC";
  if (typeNum === 1 || typeNum === 2) return "Reserved";
  return "Other";
}

type CollectResult = { vessels: Vessel[]; closeReason?: string };

function collectVessels(apiKey: string): Promise<CollectResult> {
  return new Promise((resolve) => {
    const seen = new Map<string, Vessel>();
    let settled = false;
    let closeReason: string | undefined;

    function done() {
      if (settled) return;
      settled = true;
      try { ws.terminate(); } catch { /* ignore */ }
      resolve({ vessels: [...seen.values()].slice(0, MAX_VESSELS), closeReason });
    }

    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
    const timer = setTimeout(done, COLLECT_MS);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        APIKey:             apiKey,
        BoundingBoxes:      [BBOX_AISSTREAM],
        FilterMessageTypes: ["PositionReport", "ExtendedClassBPositionReport"],
      }));
    });

    ws.on("message", (raw) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg: any = JSON.parse(raw.toString());

        // AISstream sends an error object on auth failure
        if (msg.error || msg.Error) {
          closeReason = String(msg.error ?? msg.Error);
          clearTimeout(timer);
          done();
          return;
        }

        const meta = msg.MetaData ?? {};
        const pos  = msg.Message?.PositionReport
                  ?? msg.Message?.ExtendedClassBPositionReport
                  ?? {};

        const mmsi = String(meta.MMSI ?? "");
        if (!mmsi) return;

        const lat = Number(meta.latitude  ?? pos.Latitude  ?? 0);
        const lon = Number(meta.longitude ?? pos.Longitude ?? 0);
        if (!lat && !lon) return;

        seen.set(mmsi, {
          mmsi,
          name:      String(meta.ShipName ?? "").trim() || "Unknown",
          shipType:  shipCategory(Number(meta.ShipType ?? 0)),
          lat,
          lon,
          speed:     Number(pos.Sog ?? pos.SOG ?? 0),
          course:    Number(pos.Cog ?? pos.COG ?? 0),
          heading:   Number(pos.Hdg ?? pos.TrueHeading ?? 511),
          navStatus: NAV_STATUS[Number(pos.NavigationalStatus)] ?? "Unknown",
        });
      } catch { /* skip malformed messages */ }
    });

    ws.on("error", (err) => {
      closeReason = `WS error: ${err.message}`;
      clearTimeout(timer);
      done();
    });

    ws.on("close", (code, reason) => {
      if (code !== 1000) closeReason = `WS closed: code=${code} ${reason.toString()}`;
      clearTimeout(timer);
      done();
    });
  });
}

// ─── AISHub (free REST API, community receivers) ─────────────────────────────

async function fetchAISHub(username: string): Promise<Vessel[]> {
  const { latmin, latmax, lonmin, lonmax } = BBOX_AISHUB;
  const url = `https://data.aishub.net/ws.php?username=${username}&format=1&output=json&compress=0&latmin=${latmin}&latmax=${latmax}&lonmin=${lonmin}&lonmax=${lonmax}`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`AISHub HTTP ${resp.status}`);

  // AISHub returns: [{ ERROR, USERNAME, FORMAT, RECORDS }, [ ...vessel objects... ]]
  const body = await resp.json();
  if (!Array.isArray(body) || body.length < 2 || body[0]?.ERROR) {
    throw new Error(body[0]?.ERROR ?? "Unexpected AISHub response");
  }

  const raw: Record<string, unknown>[] = Array.isArray(body[1]) ? body[1] : [];
  return raw.map((v) => ({
    mmsi:      String(v.MMSI ?? ""),
    name:      String(v.NAME ?? "").trim() || "Unknown",
    shipType:  shipCategory(Number(v.TYPE ?? 0)),
    lat:       Number(v.LATITUDE  ?? 0),
    lon:       Number(v.LONGITUDE ?? 0),
    speed:     Number(v.SOG     ?? 0),
    course:    Number(v.COG     ?? 0),
    heading:   Number(v.HEADING ?? 511),
    navStatus: NAV_STATUS[Number(v.NAVSTAT)] ?? "Unknown",
  })).filter((v) => v.lat !== 0 || v.lon !== 0);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<VesselData>
) {
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");

  const aisstreamKey  = process.env.AISSTREAM_API_KEY;
  const aishubUser    = process.env.AISHUB_USERNAME;

  // ── 1. Try AISstream (WebSocket, best real-time) ──
  if (aisstreamKey) {
    try {
      const { vessels, closeReason } = await collectVessels(aisstreamKey);
      // If we got vessels, return them; otherwise fall through to AISHub
      if (vessels.length > 0) {
        return res.status(200).json({ count: vessels.length, vessels, updatedAt: new Date().toISOString() });
      }
      // Zero vessels most likely means no Gulf terrestrial coverage — try AISHub
      if (!aishubUser) {
        return res.status(200).json({
          count:    0,
          vessels:  [],
          updatedAt: new Date().toISOString(),
          error:    closeReason ?? "AISstream returned 0 vessels (no terrestrial coverage in Gulf). Add AISHUB_USERNAME to .env.local as a free fallback.",
        });
      }
    } catch { /* fall through to AISHub */ }
  }

  // ── 2. Try AISHub (REST, community receivers) ──
  if (aishubUser) {
    try {
      const vessels = await fetchAISHub(aishubUser);
      return res.status(200).json({
        count:    vessels.length,
        vessels,
        updatedAt: new Date().toISOString(),
        ...(vessels.length === 0 ? { error: "AISHub returned 0 vessels — Gulf coverage depends on volunteer receivers in the region." } : {}),
      });
    } catch (err) {
      return res.status(200).json({
        count: null, vessels: [], updatedAt: new Date().toISOString(),
        error: `AISHub error: ${String(err)}`,
      });
    }
  }

  // ── 3. No keys configured ──
  return res.status(200).json({
    count:    null,
    vessels:  [],
    updatedAt: new Date().toISOString(),
    noKey:    true,
    error:    "No AIS key configured. Add AISSTREAM_API_KEY (free at aisstream.io) or AISHUB_USERNAME (free at aishub.net) to app/.env.local",
  });
}
