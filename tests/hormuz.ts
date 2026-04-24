/**
 * hormuz.ts — Anchor integration tests
 *
 * Run against localnet:
 *   anchor test --provider.cluster localnet
 *
 * Or devnet (slower):
 *   anchor test --provider.cluster devnet
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Hormuz } from "../target/types/hormuz";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DECIMALS = 9;
const units = (n: number) => new BN(n * 10 ** DECIMALS);
const LOCK_30_DAYS = new BN(30 * 24 * 60 * 60);
const LOCK_90_DAYS = new BN(90 * 24 * 60 * 60);
const LOCK_180_DAYS = new BN(180 * 24 * 60 * 60);

async function pda(seeds: Buffer[], programId: PublicKey) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("hormuz", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Hormuz as Program<Hormuz>;
  const connection = provider.connection;
  const authority = (provider.wallet as anchor.Wallet).payer;

  let hormuzMint: PublicKey;
  let userKeypair: Keypair;
  let userAta: PublicKey;

  let programStatePda: PublicKey;
  let stakingVaultPda: PublicKey;
  let rewardsTreasuryPda: PublicKey;
  let daoTreasuryPda: PublicKey;

  before(async () => {
    // Derive PDAs
    [programStatePda] = await pda([Buffer.from("program-state")], program.programId);
    [stakingVaultPda] = await pda([Buffer.from("staking-vault")], program.programId);
    [rewardsTreasuryPda] = await pda([Buffer.from("rewards-treasury")], program.programId);
    [daoTreasuryPda] = await pda([Buffer.from("dao-treasury")], program.programId);

    // Create HORMUZ mint (authority = deployer, will be revoked in prod)
    hormuzMint = await createMint(connection, authority, authority.publicKey, null, DECIMALS);

    // Create test user
    userKeypair = Keypair.generate();
    await connection.requestAirdrop(userKeypair.publicKey, 2 * LAMPORTS_PER_SOL);
    await new Promise((r) => setTimeout(r, 500));

    // Give user HORMUZ tokens
    const userAtaAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      hormuzMint,
      userKeypair.publicKey
    );
    userAta = userAtaAccount.address;
    await mintTo(connection, authority, hormuzMint, userAta, authority, units(10_000).toNumber());
  });

  // ─── initialize ───────────────────────────────────────────────────────────

  it("initializes the program", async () => {
    await program.methods
      .initialize()
      .accounts({
        programState: programStatePda,
        hormuzMint,
        stakingVault: stakingVaultPda,
        rewardsTreasury: rewardsTreasuryPda,
        daoTreasury: daoTreasuryPda,
        authority: authority.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([authority])
      .rpc();

    const state = await program.account.programState.fetch(programStatePda);
    expect(state.authority.toBase58()).to.equal(authority.publicKey.toBase58());
    expect(state.hormuzMint.toBase58()).to.equal(hormuzMint.toBase58());
    expect(state.totalStaked.toNumber()).to.equal(0);
    expect(state.totalBurned.toNumber()).to.equal(0);
    expect(state.proposalCount.toNumber()).to.equal(0);
  });

  // ─── stake ────────────────────────────────────────────────────────────────

  it("stakes tokens with a 30-day lock", async () => {
    // Fund rewards treasury so rewards can be reserved
    const rewardsTreasuryAta = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      hormuzMint,
      rewardsTreasuryPda,
      true
    );
    await mintTo(
      connection,
      authority,
      hormuzMint,
      rewardsTreasuryAta.address,
      authority,
      units(1_000_000).toNumber() // seed 1M for rewards
    );

    const stakeAmount = units(1_000); // stake 1000 HORMUZ
    const [stakeRecordPda] = await pda(
      [Buffer.from("stake-record"), userKeypair.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .stake(stakeAmount, LOCK_30_DAYS)
      .accounts({
        stakeRecord: stakeRecordPda,
        programState: programStatePda,
        hormuzMint,
        stakingVault: stakingVaultPda,
        rewardsTreasury: rewardsTreasuryPda,
        userTokenAccount: userAta,
        owner: userKeypair.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    const record = await program.account.stakeRecord.fetch(stakeRecordPda);
    // 1% of 1000 burned = 10, so vaulted = 990
    expect(record.amountStaked.toNumber()).to.equal(units(990).toNumber());
    expect(record.lockDurationSecs.toNumber()).to.equal(LOCK_30_DAYS.toNumber());

    const state = await program.account.programState.fetch(programStatePda);
    expect(state.totalStaked.toNumber()).to.equal(units(990).toNumber());
    expect(state.totalBurned.toNumber()).to.equal(units(10).toNumber());
  });

  it("rejects staking with an invalid lock duration", async () => {
    const [stakeRecordPda] = await pda(
      [Buffer.from("stake-record"), userKeypair.publicKey.toBuffer()],
      program.programId
    );
    try {
      await program.methods
        .stake(units(100), new BN(999)) // invalid duration
        .accounts({
          stakeRecord: stakeRecordPda,
          programState: programStatePda,
          hormuzMint,
          stakingVault: stakingVaultPda,
          rewardsTreasury: rewardsTreasuryPda,
          userTokenAccount: userAta,
          owner: userKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("InvalidLockDuration");
    }
  });

  // ─── unstake (time-travel test — only works on localnet with clock manipulation) ──

  it("rejects unstaking before lock period ends", async () => {
    const [stakeRecordPda] = await pda(
      [Buffer.from("stake-record"), userKeypair.publicKey.toBuffer()],
      program.programId
    );
    try {
      await program.methods
        .unstake()
        .accounts({
          stakeRecord: stakeRecordPda,
          programState: programStatePda,
          stakingVault: stakingVaultPda,
          rewardsTreasury: rewardsTreasuryPda,
          userTokenAccount: userAta,
          owner: userKeypair.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([userKeypair])
        .rpc();
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.message).to.include("StakeLocked");
    }
  });

  // ─── DAO ──────────────────────────────────────────────────────────────────

  it("creates a DAO proposal", async () => {
    const proposalId = new BN(0);
    const [proposalPda] = await pda(
      [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [stakeRecordPda] = await pda(
      [Buffer.from("stake-record"), userKeypair.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .createProposal(
        "Burn 1 Billion HORMUZ",
        "Proposal to burn 1B HORMUZ from the DAO treasury to reduce supply and signal deflation.",
        units(1_000_000_000),
        userKeypair.publicKey // execution target (placeholder)
      )
      .accounts({
        proposal: proposalPda,
        programState: programStatePda,
        stakeRecord: stakeRecordPda,
        proposer: userKeypair.publicKey,
        owner: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    const proposal = await program.account.proposal.fetch(proposalPda);
    expect(proposal.title).to.equal("Burn 1 Billion HORMUZ");
    expect(proposal.yesVotes.toNumber()).to.equal(0);
    expect(proposal.noVotes.toNumber()).to.equal(0);
  });

  it("votes on a proposal", async () => {
    const proposalId = new BN(0);
    const [proposalPda] = await pda(
      [Buffer.from("proposal"), proposalId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [stakeRecordPda] = await pda(
      [Buffer.from("stake-record"), userKeypair.publicKey.toBuffer()],
      program.programId
    );
    const [voteRecordPda] = await pda(
      [
        Buffer.from("vote-record"),
        userKeypair.publicKey.toBuffer(),
        proposalId.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    await program.methods
      .vote(true) // vote YES
      .accounts({
        proposal: proposalPda,
        voteRecord: voteRecordPda,
        stakeRecord: stakeRecordPda,
        voter: userKeypair.publicKey,
        owner: userKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([userKeypair])
      .rpc();

    const proposal = await program.account.proposal.fetch(proposalPda);
    expect(proposal.yesVotes.toNumber()).to.be.greaterThan(0);

    const vote = await program.account.voteRecord.fetch(voteRecordPda);
    expect(vote.support).to.be.true;
  });
});
