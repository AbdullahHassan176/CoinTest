/**
 * One-time: Phantom "Export Private Key" (base58) → Solana CLI keypair JSON.
 *
 * NEVER commit the output file. Run locally, then delete shell history if you used env var.
 *
 * Usage (PowerShell):
 *   $env:PHANTOM_SECRET_BASE58="paste_base58_here"
 *   npx ts-node scripts/import_phantom_key.ts wallets/hormuz-liquidity-mainnet.json
 *
 * Verify public key matches Phantom before mainnet mint:
 *   solana-keygen pubkey wallets/hormuz-liquidity-mainnet.json
 */

import * as fs from "fs";
import * as path from "path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const outFile = process.argv[2];
if (!outFile) {
  console.error("Usage: PHANTOM_SECRET_BASE58=<base58> npx ts-node scripts/import_phantom_key.ts <out.json>");
  process.exit(1);
}

const secret = process.env.PHANTOM_SECRET_BASE58?.trim();
if (!secret) {
  console.error("Missing PHANTOM_SECRET_BASE58 (export from Phantom → Security & Privacy).");
  process.exit(1);
}

let secretKey: Uint8Array;
try {
  secretKey = bs58.decode(secret);
} catch {
  console.error("Invalid base58.");
  process.exit(1);
}

if (secretKey.length !== 64) {
  console.error(`Expected 64-byte secret key after base58 decode, got length ${secretKey.length}.`);
  process.exit(1);
}

const kp = Keypair.fromSecretKey(secretKey);
const abs = path.resolve(outFile);
fs.mkdirSync(path.dirname(abs), { recursive: true });
fs.writeFileSync(abs, JSON.stringify(Array.from(kp.secretKey)));
console.log("Wrote:", abs);
console.log("Public key (must match Phantom HORMUZLiquidity):", kp.publicKey.toBase58());
