/**
 * GET /api/airdrop/export?key=SECRET
 *
 * Admin-only endpoint. Downloads all registered addresses as a CSV
 * ready to feed into scripts/airdrop.ts.
 *
 * Required env vars:
 *   AIRDROP_EXPORT_KEY   any secret string you choose
 *   KV_REST_API_URL
 *   KV_REST_API_TOKEN
 *
 * Usage:
 *   Visit: https://stateofhormuz.org/api/airdrop/export?key=YOUR_SECRET
 *   Save the CSV, then run:
 *     node_modules\.bin\ts-node scripts/airdrop.ts --list hormuz_airdrop_2026-xx-xx.csv --send
 */

import type { NextApiRequest, NextApiResponse } from "next";

const AMOUNT_RAW = "50000000000"; // 50,000 HORMUZ in raw units (6 decimals)

async function upstash(token: string, url: string, command: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const json = await res.json() as { result: unknown };
  return json.result;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { key } = req.query;
  const secret  = process.env.AIRDROP_EXPORT_KEY;

  if (!secret)       return res.status(503).json({ error: "AIRDROP_EXPORT_KEY not configured" });
  if (key !== secret) return res.status(401).json({ error: "Unauthorized" });

  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return res.status(503).json({ error: "KV not configured" });

  try {
    const addresses = (await upstash(kvToken, kvUrl, ["SMEMBERS", "airdrop:addresses"])) as string[];

    const date = new Date().toISOString().slice(0, 10);
    const csv  = addresses.length === 0
      ? "address,amount\n"
      : `address,amount\n${addresses.map(a => `${a},${AMOUNT_RAW}`).join("\n")}\n`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="hormuz_airdrop_${date}.csv"`);
    return res.status(200).send(csv);
  } catch (e) {
    console.error("KV export error:", e);
    return res.status(500).json({ error: String(e) });
  }
}
