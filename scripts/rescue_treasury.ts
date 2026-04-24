/**
 * rescue_treasury.ts
 *
 * Calls the `rescue_ata_to_treasury` program instruction, which drains the
 * 20 000 000 000 HORMUZ that ended up in the rewards-treasury's ATA
 * (5CLeKkFmsdbqEhdJQswHDqvLya9T7YqobC6ShXDpbbX1) into the actual
 * rewards-treasury PDA token account that the staking program reads.
 *
 * The PDA signs for the transfer with its own seeds — no private key needed.
 *
 * Run (from project root, after program upgrade):
 *   ANCHOR_WALLET=/c/tmp/ct/deploy/hormuz-keypair.json \
 *   npx ts-node scripts/rescue_treasury.ts
 *
 * Or on Windows PowerShell:
 *   $env:ANCHOR_WALLET="C:\tmp\ct\deploy\hormuz-keypair.json"
 *   npx ts-node scripts/rescue_treasury.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  AccountMeta,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const PROGRAM_ID  = new PublicKey("5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv");
const HORMUZ_MINT = new PublicKey("D6i3vdtzYWuTxEVBobSYegqHane3u6kzvBYXDTHxvLN2");
const RPC_URL     = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";

// Resolve wallet path: env var, or fall back to the deployer keypair.
const WALLET_PATH =
  process.env.ANCHOR_WALLET ??
  "C:\\tmp\\ct\\deploy\\hormuz-keypair.json";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(p: string): Keypair {
  const resolved = p.startsWith("~")
    ? path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", p.slice(2))
    : p;
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(resolved, "utf-8")))
  );
}

/** Anchor instruction discriminator = first 8 bytes of SHA256("global:<name>") */
function discriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const payer      = loadKeypair(WALLET_PATH);

  console.log(`\nCaller:  ${payer.publicKey.toBase58()}`);
  console.log(`Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`Mint:    ${HORMUZ_MINT.toBase58()}\n`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`SOL balance: ${balance / 1e9} SOL`);
  if (balance < 0.01e9) throw new Error("Need at least 0.01 SOL for fees");

  // ── Derive the rewards-treasury PDA ─────────────────────────────────────────
  const [rewardsTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("rewards-treasury")],
    PROGRAM_ID
  );
  console.log(`\nrewardsTreasury PDA:  ${rewardsTreasury.toBase58()}`);

  // ── Derive the mistaken ATA (ATA of the rewards-treasury PDA) ───────────────
  const ata = await getAssociatedTokenAddress(HORMUZ_MINT, rewardsTreasury, true);
  console.log(`Mistaken ATA address: ${ata.toBase58()}`);

  // ── Check balances before rescue ─────────────────────────────────────────────
  const ataInfo      = await connection.getTokenAccountBalance(ata).catch(() => null);
  const treasuryInfo = await connection.getTokenAccountBalance(rewardsTreasury).catch(() => null);

  console.log(`\nBefore rescue:`);
  console.log(`  ATA balance:      ${ataInfo?.value.uiAmountString ?? "—"} HORMUZ`);
  console.log(`  Treasury balance: ${treasuryInfo?.value.uiAmountString ?? "—"} HORMUZ`);

  if (!ataInfo || Number(ataInfo.value.amount) === 0) {
    console.log("\nATA is already empty — nothing to rescue.");
    return;
  }

  // ── Build the instruction ─────────────────────────────────────────────────────
  const disc = discriminator("rescue_ata_to_treasury");

  const accounts: AccountMeta[] = [
    { pubkey: rewardsTreasury, isSigner: false, isWritable: true },
    { pubkey: ata,             isSigner: false, isWritable: true },
    { pubkey: payer.publicKey, isSigner: true,  isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys:      accounts,
    data:      disc,
  });

  const tx = new Transaction().add(ix);

  console.log("\nSending rescue_ata_to_treasury transaction...");
  const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
    maxRetries: 5,
  });
  console.log(`Confirmed: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  // ── Check balances after rescue ───────────────────────────────────────────────
  const ataAfter      = await connection.getTokenAccountBalance(ata).catch(() => null);
  const treasuryAfter = await connection.getTokenAccountBalance(rewardsTreasury).catch(() => null);

  console.log(`\nAfter rescue:`);
  console.log(`  ATA balance:      ${ataAfter?.value.uiAmountString ?? "—"} HORMUZ`);
  console.log(`  Treasury balance: ${treasuryAfter?.value.uiAmountString ?? "—"} HORMUZ`);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
