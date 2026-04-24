/**
 * POST /api/airdrop/signup
 *
 * Validates a Solana wallet address and records it in Upstash Redis
 * (Vercel KV). Uses the Upstash REST API directly — no npm package needed.
 *
 * Required env vars (set in Vercel dashboard → Storage → KV):
 *   KV_REST_API_URL    e.g. https://caring-doe-12345.upstash.io
 *   KV_REST_API_TOKEN  e.g. AXxx...
 *
 * Body:  { address: string, tasks: string[] }
 * 200:   { ok: true }
 * 200:   { ok: true, kvMissing: true }   ← KV not configured, client uses localStorage
 * 400:   { error: string }
 * 409:   { error: "already_registered" }
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { PublicKey } from "@solana/web3.js";

const REQUIRED_TASKS = ["telegram", "bluesky", "share"];

// ── Upstash REST helpers ──────────────────────────────────────────────────────

async function upstash(token: string, url: string, command: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Upstash error: ${res.status}`);
  const json = await res.json() as { result: unknown };
  return json.result;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { address, tasks } = req.body as { address?: string; tasks?: string[] };

  // Validate address
  if (!address || typeof address !== "string") return res.status(400).json({ error: "Missing address" });
  try { new PublicKey(address.trim()); }
  catch { return res.status(400).json({ error: "Invalid Solana address" }); }

  // Validate tasks
  const done = Array.isArray(tasks) ? tasks : [];
  const missing = REQUIRED_TASKS.filter(t => !done.includes(t));
  if (missing.length > 0) return res.status(400).json({ error: `Incomplete tasks: ${missing.join(", ")}` });

  const clean = address.trim();

  // Check KV is configured
  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    // KV not set up yet — let client fall back to localStorage
    return res.status(200).json({ ok: true, kvMissing: true });
  }

  try {
    // SADD airdrop:addresses <address> — returns 1 (added) or 0 (duplicate)
    const added = await upstash(kvToken, kvUrl, ["SADD", "airdrop:addresses", clean]);
    if (added === 0) return res.status(409).json({ error: "already_registered" });

    // Store metadata
    await upstash(kvToken, kvUrl, [
      "HSET", `airdrop:meta:${clean}`,
      "registeredAt", new Date().toISOString(),
      "ip", String(req.headers["x-forwarded-for"] ?? "unknown"),
    ]);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("KV error:", e);
    return res.status(200).json({ ok: true, kvMissing: true });
  }
}
