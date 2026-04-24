/**
 * airdrop.ts
 *
 * Batch-sends HORMUZ from the airdrop wallet to a list of recipients.
 *
 * Recipient list format — CSV file (default: scripts/airdrop_list.csv):
 *   address,amount
 *   Abc123...,1000000      ← raw token units (6 decimals); 1 HORMUZ = 1000000
 *   Xyz456...,500000
 *
 * Alternatively use whole HORMUZ units with --whole flag.
 *
 * Features:
 *   - Dry-run mode (default) — prints plan, sends nothing
 *   - --send flag actually executes
 *   - Skips invalid addresses and zero amounts
 *   - Creates recipient ATAs if they don't exist (paid by airdrop wallet)
 *   - Batches up to BATCH_SIZE transfers per transaction (stays under tx size limit)
 *   - Retries failed batches once
 *   - Saves a receipt file: scripts/.airdrop_receipt_<timestamp>.json
 *
 * Run (dry-run):
 *   node_modules\.bin\ts-node scripts/airdrop.ts --list scripts/airdrop_list.csv
 *
 * Run (live):
 *   $env:AIRDROP_KEYPAIR="C:\tmp\ct\deploy\airdrop-keypair.json"
 *   $env:CLUSTER="devnet"
 *   node_modules\.bin\ts-node scripts/airdrop.ts --list scripts/airdrop_list.csv --send
 *
 * Run with whole HORMUZ amounts (not raw):
 *   node_modules\.bin\ts-node scripts/airdrop.ts --list scripts/airdrop_list.csv --whole --send
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  clusterApiUrl,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const CLUSTER_ENV = process.env.CLUSTER ?? "devnet";
const RPC_URL     = process.env.ANCHOR_PROVIDER_URL ?? clusterApiUrl(
  CLUSTER_ENV as "devnet" | "mainnet-beta"
);
const AIRDROP_KEYPAIR_PATH =
  process.env.AIRDROP_KEYPAIR ?? "C:\\tmp\\ct\\deploy\\airdrop-keypair.json";

const HORMUZ_MINT = new PublicKey(
  process.env.HORMUZ_MINT ?? "D6i3vdtzYWuTxEVBobSYegqHane3u6kzvBYXDTHxvLN2"
);
const DECIMALS = 6;

// Max transfers per transaction (stay well under 1232-byte tx limit)
const BATCH_SIZE = 5;

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN  = !args.includes("--send");
const WHOLE    = args.includes("--whole");
const listIdx  = args.indexOf("--list");
const LIST_PATH = listIdx >= 0 ? args[listIdx + 1] : "scripts/airdrop_list.csv";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8")))
  );
}

function parseCsv(filePath: string): { address: string; amount: bigint }[] {
  const raw = fs.readFileSync(path.resolve(filePath), "utf-8");
  const lines = raw.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
  const results: { address: string; amount: bigint }[] = [];

  for (const line of lines) {
    const [addrRaw, amtRaw] = line.split(",").map(s => s.trim());
    if (!addrRaw || !amtRaw || addrRaw.toLowerCase() === "address") continue; // skip header

    let pubkey: PublicKey;
    try { pubkey = new PublicKey(addrRaw); }
    catch { console.warn(`  SKIP — invalid address: ${addrRaw}`); continue; }

    let rawAmount: bigint;
    try {
      rawAmount = WHOLE
        ? BigInt(Math.round(parseFloat(amtRaw) * 10 ** DECIMALS))
        : BigInt(amtRaw);
    } catch { console.warn(`  SKIP — invalid amount: ${amtRaw}`); continue; }

    if (rawAmount <= 0n) { console.warn(`  SKIP — zero amount: ${addrRaw}`); continue; }
    results.push({ address: pubkey.toBase58(), amount: rawAmount });
  }
  return results;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nHORMUZ Airdrop — ${DRY_RUN ? "DRY RUN (pass --send to execute)" : "LIVE"}`);
  console.log(`Cluster: ${CLUSTER_ENV}`);
  console.log(`List:    ${LIST_PATH}`);
  console.log(`Amounts: ${WHOLE ? "whole HORMUZ" : "raw units (6 decimals)"}\n`);

  if (!fs.existsSync(path.resolve(LIST_PATH))) {
    throw new Error(`Recipient list not found: ${LIST_PATH}`);
  }

  const recipients = parseCsv(LIST_PATH);
  if (recipients.length === 0) throw new Error("No valid recipients found.");

  const totalRaw = recipients.reduce((s, r) => s + r.amount, 0n);
  const totalHormuz = Number(totalRaw) / 10 ** DECIMALS;

  console.log(`Recipients: ${recipients.length}`);
  console.log(`Total:      ${totalHormuz.toLocaleString()} HORMUZ`);

  const connection = new Connection(RPC_URL, "confirmed");
  const sender     = loadKeypair(AIRDROP_KEYPAIR_PATH);

  console.log(`Sender:     ${sender.publicKey.toBase58()}`);

  // Check sender token balance
  const senderAta = await getAssociatedTokenAddress(HORMUZ_MINT, sender.publicKey);
  const senderBal = await connection.getTokenAccountBalance(senderAta).catch(() => null);
  const senderRaw = BigInt(senderBal?.value.amount ?? "0");
  console.log(`Balance:    ${senderBal?.value.uiAmountString ?? "0"} HORMUZ\n`);

  if (senderRaw < totalRaw) {
    console.error(`Insufficient balance: need ${totalHormuz.toLocaleString()}, have ${senderBal?.value.uiAmountString}`);
    if (!DRY_RUN) process.exit(1);
  }

  // Print plan
  console.log("─── Airdrop plan ────────────────────────────────────────────");
  for (const r of recipients) {
    const human = (Number(r.amount) / 10 ** DECIMALS).toLocaleString();
    console.log(`  ${r.address.slice(0,8)}...  →  ${human} HORMUZ`);
  }
  console.log("─────────────────────────────────────────────────────────────\n");

  if (DRY_RUN) {
    console.log("Dry run complete. Re-run with --send to execute.");
    return;
  }

  // ── Execute in batches ───────────────────────────────────────────────────────
  const receipt: { address: string; amount: string; txId: string; status: string }[] = [];
  const batches: typeof recipients[] = [];
  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    batches.push(recipients.slice(i, i + BATCH_SIZE));
  }

  console.log(`Executing ${batches.length} batch(es) of up to ${BATCH_SIZE} transfers each...\n`);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    console.log(`Batch ${bi + 1}/${batches.length} — ${batch.length} recipient(s)`);

    const tx = new Transaction();

    for (const { address, amount } of batch) {
      const dest = new PublicKey(address);
      const destAta = await getAssociatedTokenAddress(HORMUZ_MINT, dest);

      // Create ATA if needed
      const ataExists = await getAccount(connection, destAta).catch(() => null);
      if (!ataExists) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            sender.publicKey, // payer
            destAta,
            dest,
            HORMUZ_MINT,
            TOKEN_PROGRAM_ID
          )
        );
      }

      tx.add(
        createTransferInstruction(
          senderAta,
          destAta,
          sender.publicKey,
          amount,
          [],
          TOKEN_PROGRAM_ID
        )
      );
    }

    let txId: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        txId = await sendAndConfirmTransaction(connection, tx, [sender], {
          commitment: "confirmed",
          maxRetries: 5,
        });
        break;
      } catch (err) {
        if (attempt === 2) {
          console.error(`  Batch ${bi + 1} failed after 2 attempts:`, (err as Error).message);
          for (const r of batch) {
            receipt.push({ address: r.address, amount: String(r.amount), txId: "", status: "FAILED" });
          }
          continue;
        }
        console.warn(`  Attempt ${attempt} failed, retrying in 3s...`);
        await sleep(3000);
      }
    }

    if (txId) {
      const explorer = CLUSTER_ENV === "devnet" ? "?cluster=devnet" : "";
      console.log(`  OK — https://explorer.solana.com/tx/${txId}${explorer}`);
      for (const r of batch) {
        receipt.push({ address: r.address, amount: String(r.amount), txId, status: "OK" });
      }
    }

    if (bi < batches.length - 1) await sleep(1500); // avoid rate limits
  }

  // ── Save receipt ─────────────────────────────────────────────────────────────
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const receiptPath = path.resolve(`scripts/.airdrop_receipt_${timestamp}.json`);
  fs.writeFileSync(receiptPath, JSON.stringify({ sentAt: new Date().toISOString(), receipt }, null, 2));
  console.log(`\nReceipt saved: ${receiptPath}`);

  const ok    = receipt.filter(r => r.status === "OK").length;
  const fail  = receipt.filter(r => r.status === "FAILED").length;
  console.log(`\nDone: ${ok} sent, ${fail} failed.`);
}

main().catch(e => { console.error("\nFATAL:", e.message ?? e); process.exit(1); });
