/**
 * POST /api/airdrop/signup
 *
 * Validates a Solana wallet address and records it in Upstash Redis.
 * Supports referrals — if ref= is provided and valid, the referrer
 * gets credited +25,000 HORMUZ bonus (tracked in KV).
 *
 * Body:  { address: string, tasks: string[], ref?: string }
 * 200:   { ok: true }
 * 200:   { ok: true, kvMissing: true }
 * 400:   { error: string }
 * 409:   { error: "already_registered" }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { PublicKey } from "@solana/web3.js";

const REQUIRED_TASKS     = ["telegram", "bluesky", "share"];
const BASE_AMOUNT_RAW    = 50_000_000_000;   // 50,000 HORMUZ
const REFERRAL_BONUS_RAW = 25_000_000_000;   // 25,000 HORMUZ bonus per referral

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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { address, tasks, ref } = req.body as {
    address?: string;
    tasks?: string[];
    ref?: string;
  };

  // Validate address
  if (!address || typeof address !== "string")
    return res.status(400).json({ error: "Missing address" });
  try { new PublicKey(address.trim()); }
  catch { return res.status(400).json({ error: "Invalid Solana address" }); }

  // Validate tasks
  const done    = Array.isArray(tasks) ? tasks : [];
  const missing = REQUIRED_TASKS.filter(t => !done.includes(t));
  if (missing.length > 0)
    return res.status(400).json({ error: `Incomplete tasks: ${missing.join(", ")}` });

  // Validate referrer address if provided
  let cleanRef: string | null = null;
  if (ref && typeof ref === "string") {
    try {
      new PublicKey(ref.trim());
      if (ref.trim() !== address.trim()) cleanRef = ref.trim(); // can't refer yourself
    } catch { /* ignore invalid ref */ }
  }

  const clean = address.trim();
  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return res.status(200).json({ ok: true, kvMissing: true });
  }

  try {
    // SADD returns 1 if added, 0 if duplicate
    const added = await upstash(kvToken, kvUrl, ["SADD", "airdrop:addresses", clean]);
    if (added === 0) return res.status(409).json({ error: "already_registered" });

    // Store metadata
    const meta: Record<string, string> = {
      registeredAt: new Date().toISOString(),
      amount:       String(BASE_AMOUNT_RAW),
      ip:           String(req.headers["x-forwarded-for"] ?? "unknown"),
    };
    if (cleanRef) meta.referredBy = cleanRef;

    await upstash(kvToken, kvUrl, [
      "HSET", `airdrop:meta:${clean}`,
      ...Object.entries(meta).flat(),
    ]);

    // Credit referrer
    if (cleanRef) {
      // Check referrer is actually registered
      const refExists = await upstash(kvToken, kvUrl, ["SISMEMBER", "airdrop:addresses", cleanRef]);
      if (refExists === 1) {
        // Increment referrer's bonus counter
        await upstash(kvToken, kvUrl, ["HINCRBY", `airdrop:meta:${cleanRef}`, "referralBonus", String(REFERRAL_BONUS_RAW)]);
        await upstash(kvToken, kvUrl, ["HINCRBY", `airdrop:meta:${cleanRef}`, "referralCount", "1"]);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("KV error:", e);
    return res.status(200).json({ ok: true, kvMissing: true });
  }
}
