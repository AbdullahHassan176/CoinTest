/**
 * initialize.ts
 *
 * Calls the two-step program initialization:
 *   1. `initialize`     — creates the ProgramState PDA and records the mint
 *   2. `create_vaults`  — creates staking_vault, rewards_treasury, dao_treasury PDAs
 *
 * Run:
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ts-node scripts/initialize.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  AccountMeta,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createHash } from "crypto";
import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const PROGRAM_ID    = new PublicKey("5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv");
const HORMUZ_MINT   = new PublicKey("D6i3vdtzYWuTxEVBobSYegqHane3u6kzvBYXDTHxvLN2");
const RPC_URL       = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
const WALLET_PATH   = process.env.ANCHOR_WALLET
  ?? path.resolve(process.env.HOME!, ".config/solana/id.json");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(p: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf-8")))
  );
}

/** Anchor instruction discriminator = first 8 bytes of SHA256("global:<name>") */
function discriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().slice(0, 8);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(WALLET_PATH);

  console.log(`\nAuthority: ${payer.publicKey.toBase58()}`);
  console.log(`Program:   ${PROGRAM_ID.toBase58()}`);
  console.log(`Mint:      ${HORMUZ_MINT.toBase58()}\n`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance:   ${balance / 1e9} SOL\n`);
  if (balance < 0.05e9) throw new Error("Insufficient SOL — need at least 0.05 SOL");

  // ── Derive PDAs ─────────────────────────────────────────────────────────────
  const [programState, stateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("program-state")],
    PROGRAM_ID
  );
  const [stakingVault] = PublicKey.findProgramAddressSync(
    [Buffer.from("staking-vault")],
    PROGRAM_ID
  );
  const [rewardsTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("rewards-treasury")],
    PROGRAM_ID
  );
  const [daoTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("dao-treasury")],
    PROGRAM_ID
  );

  console.log("PDAs:");
  console.log(`  programState:    ${programState.toBase58()}`);
  console.log(`  stakingVault:    ${stakingVault.toBase58()}`);
  console.log(`  rewardsTreasury: ${rewardsTreasury.toBase58()}`);
  console.log(`  daoTreasury:     ${daoTreasury.toBase58()}\n`);

  // ── Check if already initialised ────────────────────────────────────────────
  const stateInfo = await connection.getAccountInfo(programState);
  if (stateInfo) {
    console.log("✓ ProgramState PDA already exists — skipping initialize.");
  } else {
    // ── Step 1: initialize ───────────────────────────────────────────────────
    console.log("Step 1: calling initialize...");
    const initAccounts: AccountMeta[] = [
      { pubkey: programState,      isSigner: false, isWritable: true  },
      { pubkey: HORMUZ_MINT,        isSigner: false, isWritable: false },
      { pubkey: payer.publicKey,   isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];

    const initIx = new TransactionInstruction({
      keys: initAccounts,
      programId: PROGRAM_ID,
      data: discriminator("initialize"),
    });

    const initTx = new Transaction().add(initIx);
    const initSig = await sendAndConfirmTransaction(connection, initTx, [payer], {
      commitment: "confirmed",
    });
    console.log(`✓ initialize tx: ${initSig}\n`);
  }

  // ── Helper: create one vault ─────────────────────────────────────────────────
  async function createVaultIfNeeded(
    label: string,
    ixName: string,
    vaultPda: PublicKey
  ) {
    const info = await connection.getAccountInfo(vaultPda);
    if (info) { console.log(`✓ ${label} already exists — skipping.`); return; }
    console.log(`Creating ${label}...`);
    const accounts: AccountMeta[] = [
      { pubkey: programState,            isSigner: false, isWritable: true  },
      { pubkey: HORMUZ_MINT,              isSigner: false, isWritable: false },
      { pubkey: vaultPda,                isSigner: false, isWritable: true  },
      { pubkey: payer.publicKey,         isSigner: true,  isWritable: true  },
      { pubkey: TOKEN_PROGRAM_ID,        isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY,      isSigner: false, isWritable: false },
    ];
    const ix = new TransactionInstruction({ keys: accounts, programId: PROGRAM_ID, data: discriminator(ixName) });
    const sig = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer], { commitment: "confirmed" });
    console.log(`✓ ${label} tx: ${sig}`);
  }

  await createVaultIfNeeded("staking_vault",      "create_staking_vault",      stakingVault);
  await createVaultIfNeeded("rewards_treasury",   "create_rewards_treasury",   rewardsTreasury);
  await createVaultIfNeeded("dao_treasury",        "create_dao_treasury",       daoTreasury);

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log(" Program Initialized Successfully");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  ProgramState:    ${programState.toBase58()}`);
  console.log(`  StakingVault:    ${stakingVault.toBase58()}`);
  console.log(`  RewardsTreasury: ${rewardsTreasury.toBase58()}`);
  console.log(`  DaoTreasury:     ${daoTreasury.toBase58()}`);
  console.log("═══════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
