/**
 * create_pool.ts
 *
 * Creates a HORMUZ/SOL CPMM pool on Raydium devnet or mainnet.
 *
 * Prerequisites:
 *   - Liquidity wallet keypair JSON (exported from Phantom:
 *     Settings → Security → Export Private Key → base58 string,
 *     then converted to JSON array via the instructions in README)
 *   - Liquidity wallet must hold:
 *       • 40,000,000,000 HORMUZ  (already distributed)
 *       • ≥ 1.2 SOL              (already funded by deployer)
 *
 * Run (devnet):
 *   $env:LIQUIDITY_KEYPAIR="C:\tmp\ct\deploy\liquidity-keypair.json"
 *   $env:CLUSTER="devnet"
 *   node_modules\.bin\ts-node scripts/create_pool.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
} from "@solana/spl-token";
import {
  Raydium,
  TxVersion,
  DEVNET_PROGRAM_ID,
  ApiCpmmConfigInfo,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

// Raydium SDK uses 'mainnet' (not 'mainnet-beta')
const CLUSTER_ENV = process.env.CLUSTER ?? "devnet";
const RAYDIUM_CLUSTER = CLUSTER_ENV === "mainnet-beta" ? "mainnet" : "devnet";
const RPC_URL = process.env.ANCHOR_PROVIDER_URL ?? clusterApiUrl(
  CLUSTER_ENV as "devnet" | "mainnet-beta"
);

const LIQUIDITY_KEYPAIR_PATH =
  process.env.LIQUIDITY_KEYPAIR ??
  path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", "liquidity-keypair.json");

// ── Pool amounts ──────────────────────────────────────────────────────────────
//
// Devnet: 1 SOL + 40B HORMUZ → price ≈ 0.000000000025 SOL/HORMUZ (test only)
// Mainnet: Adjust SOL_LAMPORTS to target your launch FDV.
//   Example at $160/SOL: 10 SOL → ~$1600 initial liquidity
//     price = 10 SOL / 40B HORMUZ ≈ $0.000000004/HORMUZ → FDV ≈ $400
const INITIAL_SOL_LAMPORTS = CLUSTER_ENV === "devnet"
  ? 1_000_000_000   // 1 SOL — devnet test
  : 5_000_000_000;  // 5 SOL — mainnet (adjust)

const HORMUZ_DECIMALS = 6;
const HORMUZ_AMOUNT = 40_000_000_000; // 40B tokens

// ── Mainnet CPMM program addresses ───────────────────────────────────────────
const MAINNET_CPMM_PROGRAM  = new PublicKey("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");
const MAINNET_CPMM_FEE_ACC  = new PublicKey("DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8");

// 0.25% fee config (index 0 — the standard tier for new tokens)
// These IDs come from the Raydium API /main/cpmm-config endpoint.
const MAINNET_FEE_CONFIG: ApiCpmmConfigInfo = {
  id: "D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2",
  index: 0,
  protocolFeeRate: 120000,
  tradeFeeRate: 2500,      // 0.25%
  fundFeeRate: 40000,
  createPoolFee: "150000000",
  creatorFeeRate: 500,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(p: string): Keypair {
  const resolved = p.startsWith("~")
    ? path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", p.slice(2))
    : p;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(resolved, "utf-8")))
  );
}

function loadAddresses() {
  const p = path.resolve("scripts/.addresses.json");
  if (!fs.existsSync(p)) throw new Error("Run create_token.ts first.");
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const owner      = loadKeypair(LIQUIDITY_KEYPAIR_PATH);
  const addresses  = loadAddresses();
  const hormuzMint = new PublicKey(addresses.mint);

  // ── Pre-flight checks ───────────────────────────────────────────────────────
  const solBal  = await connection.getBalance(owner.publicKey);
  const ata     = await getAssociatedTokenAddress(hormuzMint, owner.publicKey);
  const tokInfo = await connection.getTokenAccountBalance(ata).catch(() => null);

  console.log(`\nCluster:        ${CLUSTER_ENV}`);
  console.log(`Owner:          ${owner.publicKey.toBase58()}`);
  console.log(`HORMUZ Mint:    ${hormuzMint.toBase58()}`);
  console.log(`SOL balance:    ${(solBal / 1e9).toFixed(4)} SOL`);
  console.log(`HORMUZ balance: ${tokInfo?.value.uiAmountString ?? "0"}\n`);

  if (solBal < INITIAL_SOL_LAMPORTS + 0.1e9) {
    throw new Error(
      `Need ≥ ${(INITIAL_SOL_LAMPORTS / 1e9 + 0.1).toFixed(1)} SOL. ` +
      `Have ${(solBal / 1e9).toFixed(4)} SOL.`
    );
  }
  const hormuzRaw = Number(tokInfo?.value.amount ?? "0");
  const needed = HORMUZ_AMOUNT * (10 ** HORMUZ_DECIMALS);
  if (hormuzRaw < needed) {
    throw new Error(`Need ${HORMUZ_AMOUNT.toLocaleString()} HORMUZ. Have ${tokInfo?.value.uiAmountString ?? 0}.`);
  }

  // ── Initialise Raydium SDK ──────────────────────────────────────────────────
  console.log("Initialising Raydium SDK...");
  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: RAYDIUM_CLUSTER,
    disableFeatureCheck: true,
    blockhashCommitment: "confirmed",
  });

  // ── Token info objects (SDK wants address + decimals + programId) ───────────
  // Sort mints: Raydium expects mintA.address < mintB.address lexicographically
  const hormuzAddr = hormuzMint.toBase58();
  const wsolAddr   = NATIVE_MINT.toBase58();
  const hormuzIsA  = hormuzAddr < wsolAddr;

  const mintA = hormuzIsA
    ? { address: hormuzAddr, decimals: HORMUZ_DECIMALS, programId: TOKEN_PROGRAM_ID.toBase58() }
    : { address: wsolAddr,   decimals: 9,               programId: TOKEN_PROGRAM_ID.toBase58() };
  const mintB = hormuzIsA
    ? { address: wsolAddr,   decimals: 9,               programId: TOKEN_PROGRAM_ID.toBase58() }
    : { address: hormuzAddr, decimals: HORMUZ_DECIMALS, programId: TOKEN_PROGRAM_ID.toBase58() };

  const amountA = new BN(hormuzIsA
    ? (HORMUZ_AMOUNT * (10 ** HORMUZ_DECIMALS)).toString()
    : INITIAL_SOL_LAMPORTS.toString()
  );
  const amountB = new BN(hormuzIsA
    ? INITIAL_SOL_LAMPORTS.toString()
    : (HORMUZ_AMOUNT * (10 ** HORMUZ_DECIMALS)).toString()
  );

  // ── Fee config ──────────────────────────────────────────────────────────────
  let feeConfig: ApiCpmmConfigInfo;
  let programId:   PublicKey;
  let feeAccount:  PublicKey;

  if (CLUSTER_ENV === "devnet") {
    // On devnet, fetch configs from the chain via Raydium API
    const configs = await raydium.api.getCpmmConfigs();
    feeConfig = configs.find((c: ApiCpmmConfigInfo) => c.tradeFeeRate === 2500) ?? configs[0];
    programId  = DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM;
    feeAccount = DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC;
    console.log(`Devnet fee config: ${feeConfig.id} (${feeConfig.tradeFeeRate / 100}% fee)`);
  } else {
    feeConfig  = MAINNET_FEE_CONFIG;
    programId  = MAINNET_CPMM_PROGRAM;
    feeAccount = MAINNET_CPMM_FEE_ACC;
    console.log(`Mainnet fee config: ${feeConfig.id} (${feeConfig.tradeFeeRate / 100}% fee)`);
  }

  // ── Create pool ─────────────────────────────────────────────────────────────
  const hormuzHuman = HORMUZ_AMOUNT.toLocaleString();
  const solHuman    = (INITIAL_SOL_LAMPORTS / 1e9).toFixed(4);
  console.log(`\nCreating CPMM pool: ${hormuzHuman} HORMUZ + ${solHuman} SOL`);

  const { execute, extInfo } = await (raydium.cpmm as any).createPool({
    programId,
    poolFeeAccount: feeAccount,
    mintA,
    mintB,
    mintAAmount: amountA,
    mintBAmount: amountB,
    startTime: new BN(0),
    feeConfig,
    associatedOnly: true,
    ownerInfo: { useSOLBalance: true },
    txVersion: TxVersion.LEGACY,
    computeBudgetConfig: {
      units: 600_000,
      microLamports: 1_000_000,
    },
  });

  console.log("Broadcasting transaction...");
  const { txId } = await execute({ sendAndConfirm: true });
  const explorer = CLUSTER_ENV === "devnet" ? "?cluster=devnet" : "";

  console.log(`\nPool created!`);
  console.log(`  Pool ID:  ${extInfo.address.poolId.toBase58()}`);
  console.log(`  LP Mint:  ${extInfo.address.lpMint.toBase58()}`);
  console.log(`  Tx:       https://explorer.solana.com/tx/${txId}${explorer}`);

  const poolInfo = {
    cluster: CLUSTER_ENV,
    poolId:  extInfo.address.poolId.toBase58(),
    lpMint:  extInfo.address.lpMint.toBase58(),
    txId,
    hormuzAmount: hormuzHuman,
    solAmount:    solHuman,
    feeConfig:    feeConfig.id,
    createdAt:    new Date().toISOString(),
  };
  const out = path.resolve("scripts/.pool.json");
  fs.writeFileSync(out, JSON.stringify(poolInfo, null, 2));
  console.log(`  Saved to scripts/.pool.json`);
  console.log(`\nNext: lock LP tokens → npx ts-node scripts/lock_lp.ts`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message ?? e);
  process.exit(1);
});
