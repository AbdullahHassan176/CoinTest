/**
 * vest_team.ts
 *
 * Creates a Streamflow vesting contract locking the 15B team HORMUZ with:
 *   - 90-day cliff  (no tokens released for 3 months)
 *   - 270-day linear vest daily after cliff (12 months total)
 *   - Irrevocable: not cancellable by sender or recipient
 *
 * The sender wallet must HOLD the HORMUZ to be locked.
 * That is the TEAM wallet (D2BsaNzFyPPewvmdrJzxNbmp3NPSoBUkvZ1PP3zmsN5a).
 *
 * Export private key from Phantom → Settings → Security → Export Private Key.
 * Then run the base58→JSON conversion (same as for the liquidity wallet).
 *
 * Run:
 *   $env:SENDER_KEYPAIR="C:\tmp\ct\deploy\team-keypair.json"
 *   $env:CLUSTER="devnet"
 *   node_modules\.bin\ts-node scripts/vest_team.ts
 *
 * Dry-run (no tx sent):
 *   $env:DRY_RUN="true"  ... same command
 */

import { Connection, Keypair, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { SolanaStreamClient, getBN, ICluster } from "@streamflow/stream";
import BN from "bn.js";
import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const CLUSTER_ENV = process.env.CLUSTER ?? "devnet";
const RPC_URL     = process.env.ANCHOR_PROVIDER_URL ?? clusterApiUrl(
  CLUSTER_ENV as "devnet" | "mainnet-beta"
);
const DRY_RUN = process.env.DRY_RUN === "true";

const SENDER_KEYPAIR_PATH =
  process.env.SENDER_KEYPAIR ??
  path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", "team-keypair.json");

// Vesting parameters
const HORMUZ_DECIMALS = 6;
const TEAM_AMOUNT     = 15_000_000_000;  // 15B tokens

const CLIFF_DAYS   = 90;    // no tokens for 90 days
const VEST_DAYS    = 270;   // daily linear vest for 270 days after cliff

// The recipient: default = same wallet (self-lock proves tokens locked)
// Change to a separate address if desired
const RECIPIENT_ADDRESS = process.env.RECIPIENT ?? "";

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
  const sender     = loadKeypair(SENDER_KEYPAIR_PATH);
  const addresses  = loadAddresses();
  const mint       = new PublicKey(addresses.mint);
  const recipient  = RECIPIENT_ADDRESS ? new PublicKey(RECIPIENT_ADDRESS) : sender.publicKey;

  const now      = Math.floor(Date.now() / 1000);
  const startTime = now + 60; // stream starts in 60 seconds

  const cliffSec = CLIFF_DAYS * 86400;
  const period   = 86400; // daily unlock after cliff
  const totalRaw = getBN(TEAM_AMOUNT, HORMUZ_DECIMALS);
  // Amount released per daily period after cliff:
  const amountPerPeriod = getBN(TEAM_AMOUNT / VEST_DAYS, HORMUZ_DECIMALS);

  const solBal = await connection.getBalance(sender.publicKey);

  console.log(`\nStreamflow Team Vesting ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`Cluster:        ${CLUSTER_ENV}`);
  console.log(`Sender:         ${sender.publicKey.toBase58()}`);
  console.log(`Recipient:      ${recipient.toBase58()}`);
  console.log(`Token:          ${mint.toBase58()}`);
  console.log(`SOL balance:    ${(solBal / 1e9).toFixed(4)} SOL`);
  console.log(`\nSchedule:`);
  console.log(`  Total:        ${TEAM_AMOUNT.toLocaleString()} HORMUZ`);
  console.log(`  Cliff:        ${CLIFF_DAYS} days — no unlock`);
  console.log(`  Vesting:      ${VEST_DAYS} days daily linear after cliff`);
  console.log(`  Total period: ${CLIFF_DAYS + VEST_DAYS} days (~12 months)`);
  console.log(`  Starts:       ${new Date(startTime * 1000).toISOString()}`);
  console.log(`  Cliff end:    ${new Date((startTime + cliffSec) * 1000).toISOString()}`);
  console.log(`  Fully vested: ${new Date((startTime + cliffSec + VEST_DAYS * 86400) * 1000).toISOString()}\n`);

  if (solBal < 0.05e9) {
    throw new Error(
      `Need ≥ 0.05 SOL for Streamflow fees. Have ${(solBal / 1e9).toFixed(4)} SOL.`
    );
  }

  if (DRY_RUN) {
    console.log("DRY RUN — transaction not sent.");
    return;
  }

  // ── Streamflow client ───────────────────────────────────────────────────────
  const sfCluster = CLUSTER_ENV === "devnet" ? ICluster.Devnet : ICluster.Mainnet;
  const client = new SolanaStreamClient(RPC_URL, sfCluster);

  // ── Stream config ───────────────────────────────────────────────────────────
  const streamData = {
    recipient:               recipient.toBase58(),
    tokenId:                 mint.toBase58(),
    start:                   startTime,
    amount:                  totalRaw,
    period,
    cliff:                   startTime + cliffSec,
    cliffAmount:             getBN(0, HORMUZ_DECIMALS),
    amountPerPeriod,
    name:                    "HORMUZ Team — 12m Vesting",
    canTopup:                false,
    cancelableBySender:      false,   // irrevocable
    cancelableByRecipient:   false,
    transferableBySender:    false,
    transferableByRecipient: false,
    automaticWithdrawal:     true,
    withdrawalFrequency:     period,
  };

  console.log("Sending to Streamflow...");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { txId, metadataId } = await client.create(streamData, { sender: sender as any });

  const explorer = CLUSTER_ENV === "devnet" ? "?cluster=devnet" : "";
  const sfBase   = CLUSTER_ENV === "devnet" ? "https://app.streamflow.finance/devnet" : "https://app.streamflow.finance";

  console.log(`\nVesting contract created!`);
  console.log(`  Tx:       https://explorer.solana.com/tx/${txId}${explorer}`);
  console.log(`  Contract: ${sfBase}/vesting/${metadataId}`);
  console.log(`\nShare this URL as public proof of team token lock:`);
  console.log(`  ${sfBase}/vesting/${metadataId}\n`);

  // Save for reference
  const out = path.resolve("scripts/.vesting.json");
  const existing = fs.existsSync(out)
    ? JSON.parse(fs.readFileSync(out, "utf-8"))
    : [];
  existing.push({
    cluster:     CLUSTER_ENV,
    txId,
    contractId:  metadataId,
    sender:      sender.publicKey.toBase58(),
    recipient:   recipient.toBase58(),
    amount:      TEAM_AMOUNT,
    cliffDays:   CLIFF_DAYS,
    vestDays:    VEST_DAYS,
    createdAt:   new Date().toISOString(),
  });
  fs.writeFileSync(out, JSON.stringify(existing, null, 2));
  console.log(`  Saved to scripts/.vesting.json`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message ?? e);
  process.exit(1);
});
