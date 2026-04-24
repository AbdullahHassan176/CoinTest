/**
 * seed_liquidity.ts
 *
 * Creates a HORMUZ/SOL liquidity pool on Raydium (CPMM) and seeds it
 * with the 40% liquidity allocation from the token launch.
 *
 * Prerequisites:
 *   - create_token.ts must have been run (scripts/.addresses.json must exist)
 *   - The deployer wallet must hold both SOL and HORMUZ
 *   - RAYDIUM_CPMM_PROGRAM_ID set in env (defaults to devnet value)
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ts-node scripts/seed_liquidity.ts
 *
 * NOTE: This script outlines the Raydium CPMM pool creation flow.
 * On mainnet, Raydium's SDK (@raydium-io/raydium-sdk-v2) handles pool
 * creation. Refer to https://docs.raydium.io for the latest SDK docs.
 */

import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const CLUSTER = (process.env.CLUSTER ?? "devnet") as "devnet" | "mainnet-beta";
const RPC_URL = process.env.ANCHOR_PROVIDER_URL ?? clusterApiUrl(CLUSTER);
const WALLET_PATH =
  process.env.ANCHOR_WALLET ??
  path.resolve(process.env.HOME!, ".config/solana/id.json");

// How much SOL to pair with the liquidity allocation
// On mainnet set this to your target initial price × liquidity_hormuz_amount
const INITIAL_SOL_LIQUIDITY_LAMPORTS = 1_000_000_000; // 1 SOL (devnet)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(p: string): Keypair {
  const raw = fs.readFileSync(p, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function loadAddresses() {
  const p = path.resolve("scripts/.addresses.json");
  if (!fs.existsSync(p)) {
    throw new Error(
      "scripts/.addresses.json not found. Run create_token.ts first."
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(WALLET_PATH);
  const addresses = loadAddresses();

  const mint = new PublicKey(addresses.mint);
  const liquidityWallet = new PublicKey(addresses.wallets.liquidity);

  console.log(`\nSeeding Raydium CPMM liquidity pool`);
  console.log(`Cluster:           ${CLUSTER}`);
  console.log(`HORMUZ Mint:       ${mint.toBase58()}`);
  console.log(`Liquidity Wallet:  ${liquidityWallet.toBase58()}\n`);

  // Derive the liquidity wallet's HORMUZ ATA
  const liquidityAta = await getAssociatedTokenAddress(mint, liquidityWallet, true);
  console.log(`Liquidity ATA:     ${liquidityAta.toBase58()}`);

  // ── Raydium CPMM Pool Creation ─────────────────────────────────────────────
  //
  // Raydium's SDK v2 is required for mainnet. The flow is:
  //   1. Import Raydium SDK: @raydium-io/raydium-sdk-v2
  //   2. Call Raydium.load({ connection, owner: payer.publicKey, ... })
  //   3. Call raydium.cpmm.createPool({ mintA, mintB, mintAAmount, mintBAmount, ... })
  //   4. Send the returned transactions
  //
  // The actual SDK call on mainnet looks like:
  //
  //   const raydium = await Raydium.load({ connection, owner: payer.publicKey });
  //   const { execute } = await raydium.cpmm.createPool({
  //     programId: CREATE_CPMM_POOL_PROGRAM,
  //     poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC,
  //     mintA: { address: mint.toBase58(), decimals: 9 },
  //     mintB: { address: WSOL.mint, decimals: 9 },   // Wrapped SOL
  //     mintAAmount: new BN(liquidity_hormuz_amount),
  //     mintBAmount: new BN(INITIAL_SOL_LIQUIDITY_LAMPORTS),
  //     startTime: new BN(Math.floor(Date.now() / 1000)),
  //     ownerInfo: { useSOLBalance: true },
  //   });
  //   await execute({ sendAndConfirm: true });
  //
  // For devnet testing, Raydium's CPMM is available at:
  // https://docs.raydium.io/raydium/traders/sdk

  console.log("\nRAYDIUM POOL CREATION SUMMARY");
  console.log("════════════════════════════════════════");
  console.log("  Token A:  HORMUZ (40% of supply = 40,000,000,000 HORMUZ)");
  console.log(`  Token B:  SOL (${INITIAL_SOL_LIQUIDITY_LAMPORTS / 1e9} SOL)`);
  console.log("  Pool type: CPMM (Constant Product)");
  console.log("  Fee tier: 0.25%");
  console.log("  Initial price: (SOL_AMOUNT / HORMUZ_AMOUNT) per HORMUZ");
  console.log("════════════════════════════════════════");
  console.log("\nTo create the pool on devnet/mainnet:");
  console.log("  npm install @raydium-io/raydium-sdk-v2");
  console.log("  Then uncomment the SDK code block above in this script.");
  console.log("\nAfter pool creation:");
  console.log("  1. Note the pool ID and LP mint address");
  console.log("  2. Lock LP tokens via Streamflow: https://app.streamflow.finance");
  console.log("  3. Share the lock proof with the community\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
