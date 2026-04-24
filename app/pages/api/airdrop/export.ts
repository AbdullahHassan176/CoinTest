/**
 * GET /api/airdrop/export?key=SECRET
 *
 * Downloads all airdrop registrations as CSV, including referral bonuses.
 * Compatible with scripts/airdrop.ts (address,amount format).
 *
 * Amount = base (50,000 HORMUZ) + referral bonuses earned (25,000 per referral).
 */

import type { NextApiRequest, NextApiResponse } from "next";

const BASE_AMOUNT_RAW = 50_000_000_000; // 50,000 HORMUZ

async function upstash(token: string, url: string, command: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { key } = req.query;
  const secret  = process.env.AIRDROP_EXPORT_KEY;

  if (!secret)        return res.status(503).json({ error: "AIRDROP_EXPORT_KEY not configured" });
  if (key !== secret) return res.status(401).json({ error: "Unauthorized" });

  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return res.status(503).json({ error: "KV not configured" });

  try {
    const addresses = (await upstash(kvToken, kvUrl, ["SMEMBERS", "airdrop:addresses"])) as string[];

    const rows: string[] = [];
    for (const addr of addresses) {
      const meta = (await upstash(kvToken, kvUrl, ["HGETALL", `airdrop:meta:${addr}`])) as string[];
      // HGETALL returns [key, val, key, val, ...]
      const metaMap: Record<string, string> = {};
      for (let i = 0; i < (meta?.length ?? 0); i += 2) {
        metaMap[meta[i]] = meta[i + 1];
      }
      const bonus  = parseInt(metaMap["referralBonus"] ?? "0", 10);
      const total  = BASE_AMOUNT_RAW + bonus;
      const refs   = metaMap["referralCount"] ?? "0";
      rows.push(`${addr},${total},${refs}`);
    }

    const date = new Date().toISOString().slice(0, 10);
    const csv  = `address,amount,referrals\n${rows.join("\n")}\n`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="hormuz_airdrop_${date}.csv"`);
    return res.status(200).send(csv);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
