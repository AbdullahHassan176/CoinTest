/**
 * lock_lp.ts
 *
 * Permanently locks all CPMM LP tokens using Raydium's native LP-lock program.
 * The LP owner (liquidity wallet) receives an NFT receipt representing the
 * locked position. Fees can still be harvested; liquidity can never be removed.
 *
 * This is on-chain proof that the HORMUZ/SOL pool cannot be rug-pulled.
 *
 * Prerequisites:
 *   - scripts/.pool.json must exist (created by create_pool.ts)
 *   - Liquidity wallet keypair at C:\tmp\ct\deploy\liquidity-keypair.json
 *   - Liquidity wallet must still hold the LP tokens
 *
 * Run:
 *   $env:LIQUIDITY_KEYPAIR="C:\tmp\ct\deploy\liquidity-keypair.json"
 *   $env:CLUSTER="devnet"
 *   node_modules\.bin\ts-node scripts/lock_lp.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  Raydium,
  TxVersion,
  DEVNET_PROGRAM_ID,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const CLUSTER_ENV    = process.env.CLUSTER ?? "devnet";
const RAYDIUM_CLUSTER = CLUSTER_ENV === "mainnet-beta" ? "mainnet" : "devnet";
const RPC_URL        = process.env.ANCHOR_PROVIDER_URL ?? clusterApiUrl(
  CLUSTER_ENV as "devnet" | "mainnet-beta"
);

const LIQUIDITY_KEYPAIR_PATH =
  process.env.LIQUIDITY_KEYPAIR ??
  "C:\\tmp\\ct\\deploy\\liquidity-keypair.json";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8")))
  );
}

function loadPool() {
  const p = path.resolve("scripts/.pool.json");
  if (!fs.existsSync(p)) throw new Error("scripts/.pool.json not found. Run create_pool.ts first.");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const owner      = loadKeypair(LIQUIDITY_KEYPAIR_PATH);
  const poolData   = loadPool();

  const poolId  = new PublicKey(poolData.poolId);
  const lpMint  = new PublicKey(poolData.lpMint);

  console.log(`\nLP Lock — Raydium CPMM`);
  console.log(`Cluster:  ${CLUSTER_ENV}`);
  console.log(`Owner:    ${owner.publicKey.toBase58()}`);
  console.log(`Pool ID:  ${poolId.toBase58()}`);
  console.log(`LP Mint:  ${lpMint.toBase58()}`);

  // ── Check LP balance ────────────────────────────────────────────────────────
  const lpAta  = await getAssociatedTokenAddress(lpMint, owner.publicKey);
  const lpInfo = await connection.getTokenAccountBalance(lpAta).catch(() => null);

  if (!lpInfo || Number(lpInfo.value.amount) === 0) {
    throw new Error(`No LP tokens found in ${owner.publicKey.toBase58()}`);
  }

  const lpAmount = new BN(lpInfo.value.amount);
  console.log(`LP balance: ${lpInfo.value.uiAmountString} LP tokens`);
  console.log(`Locking:    ALL (${lpInfo.value.amount} raw)\n`);

  // ── Initialise Raydium ──────────────────────────────────────────────────────
  console.log("Initialising Raydium SDK...");
  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: RAYDIUM_CLUSTER,
    disableFeatureCheck: true,
    blockhashCommitment: "confirmed",
  });

  // ── Fetch pool info from chain ──────────────────────────────────────────────
  // getPoolInfoFromRpc reads the pool account on-chain — no API indexing needed
  console.log("Fetching pool info from chain...");
  const { poolInfo, poolKeys } = await (raydium.cpmm as any).getPoolInfoFromRpc(
    poolId.toBase58()
  );

  // ── Lock LP ─────────────────────────────────────────────────────────────────
  console.log("Building lock transaction...");

  const lockParams: any = {
    poolInfo,
    poolKeys,
    lpAmount,
    withMetadata: true,           // mint an NFT receipt
    associatedOnly: true,
    ownerInfo: { useSOLBalance: true },
    txVersion: TxVersion.LEGACY,
    computeBudgetConfig: {
      units: 400_000,
      microLamports: 1_000_000,
    },
  };

  // Use devnet lock program IDs
  if (CLUSTER_ENV === "devnet") {
    lockParams.programId   = DEVNET_PROGRAM_ID.LOCK_CPMM_PROGRAM;
    lockParams.authProgram = DEVNET_PROGRAM_ID.LOCK_CPMM_AUTH;
  }

  const { execute, extInfo } = await (raydium.cpmm as any).lockLp(lockParams);

  console.log("Broadcasting lock transaction...");
  const { txId } = await execute({ sendAndConfirm: true });
  const explorer = CLUSTER_ENV === "devnet" ? "?cluster=devnet" : "";

  console.log(`\nLP locked!`);
  console.log(`  Tx:          https://explorer.solana.com/tx/${txId}${explorer}`);

  if (extInfo?.address?.nftMint) {
    const nft = extInfo.address.nftMint.toBase58();
    console.log(`  Lock NFT:    ${nft}`);
    console.log(`  Verify lock: https://explorer.solana.com/address/${nft}${explorer}`);

    // Save lock record
    const lockRecord = {
      cluster:    CLUSTER_ENV,
      poolId:     poolId.toBase58(),
      lpMint:     lpMint.toBase58(),
      lpAmount:   lpInfo.value.uiAmountString,
      nftMint:    nft,
      txId,
      lockedAt:   new Date().toISOString(),
    };
    const out = path.resolve("scripts/.lp_lock.json");
    fs.writeFileSync(out, JSON.stringify(lockRecord, null, 2));
    console.log(`  Saved to:    scripts/.lp_lock.json`);

    console.log(`\nShare as rug-proof with the community:`);
    console.log(`  Pool:      https://explorer.solana.com/address/${poolId.toBase58()}${explorer}`);
    console.log(`  Lock NFT:  https://explorer.solana.com/address/${nft}${explorer}`);
    console.log(`  Lock tx:   https://explorer.solana.com/tx/${txId}${explorer}`);
  }

  console.log(`\nDone. LP is permanently locked — liquidity cannot be removed.`);
  console.log(`Fees can still be harvested via: npx ts-node scripts/harvest_lp_fees.ts`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message ?? e);
  process.exit(1);
});
