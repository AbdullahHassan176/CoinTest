/**
 * hormuz.ts — Client helpers for interacting with the HORMUZ Anchor program.
 *
 * Wraps Anchor instruction calls so React components stay clean.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connection, PROGRAM_ID, HORMUZ_MINT } from "./connection";

// ─── PDA derivations ─────────────────────────────────────────────────────────

export function deriveProgramState() {
  return PublicKey.findProgramAddressSync([Buffer.from("program-state")], PROGRAM_ID);
}

export function deriveStakingVault() {
  return PublicKey.findProgramAddressSync([Buffer.from("staking-vault")], PROGRAM_ID);
}

export function deriveRewardsTreasury() {
  return PublicKey.findProgramAddressSync([Buffer.from("rewards-treasury")], PROGRAM_ID);
}

export function deriveDaoTreasury() {
  return PublicKey.findProgramAddressSync([Buffer.from("dao-treasury")], PROGRAM_ID);
}

export function deriveStakeRecord(owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stake-record"), owner.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveProposal(proposalId: number) {
  const idBuffer = Buffer.alloc(8);
  idBuffer.writeBigUInt64LE(BigInt(proposalId));
  return PublicKey.findProgramAddressSync([Buffer.from("proposal"), idBuffer], PROGRAM_ID);
}

export function deriveVoteRecord(voter: PublicKey, proposalId: number) {
  const idBuffer = Buffer.alloc(8);
  idBuffer.writeBigUInt64LE(BigInt(proposalId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vote-record"), voter.toBuffer(), idBuffer],
    PROGRAM_ID
  );
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProgram = Program<any>;

export async function fetchProgramState(program: AnyProgram) {
  const [pda] = deriveProgramState();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (program.account as any).programState.fetch(pda);
  } catch {
    return null;
  }
}

export async function fetchStakeRecord(program: AnyProgram, owner: PublicKey) {
  const [pda] = deriveStakeRecord(owner);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (program.account as any).stakeRecord.fetch(pda);
  } catch {
    return null;
  }
}

export async function fetchAllProposals(program: AnyProgram) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (program.account as any).proposal.all();
  } catch {
    return [];
  }
}

// ─── Public chain stats (no wallet required) ─────────────────────────────────

const INITIAL_SUPPLY = 100_000_000_000; // 100 billion — fixed at mint

export interface ChainStats {
  circulatingSupply: number; // current mint supply (post-burns)
  totalBurned: number;       // INITIAL_SUPPLY - circulatingSupply
  totalStaked: number;       // tokens currently locked in staking vault
  proposalCount: number;     // total proposals ever created (from programState)
}

export async function fetchChainStats(): Promise<ChainStats> {
  const [stakingVaultPda] = deriveStakingVault();
  const [programStatePda] = deriveProgramState();

  const [supplyResult, vaultResult, stateResult] = await Promise.allSettled([
    connection.getTokenSupply(HORMUZ_MINT),
    connection.getTokenAccountBalance(stakingVaultPda),
    // Read programState raw — no wallet needed for getAccountInfo
    connection.getAccountInfo(programStatePda),
  ]);

  // Circulating supply & burned
  const uiSupply =
    supplyResult.status === "fulfilled"
      ? Number(supplyResult.value.value.uiAmount ?? 0)
      : INITIAL_SUPPLY;
  const circulatingSupply = uiSupply;
  const totalBurned = Math.max(0, INITIAL_SUPPLY - uiSupply);

  // Total staked
  const totalStaked =
    vaultResult.status === "fulfilled"
      ? Number(vaultResult.value.value.uiAmount ?? 0)
      : 0;

  // Proposal count lives in programState at byte offset 8 (discriminator) + layout
  // Field order in ProgramState: is_initialized(1), authority(32), hormuz_mint(32),
  // staking_vault(32), rewards_treasury(32), dao_treasury(32), proposal_count(8 = u64)
  // total offset = 8 + 1 + 32*5 = 169
  let proposalCount = 0;
  if (stateResult.status === "fulfilled" && stateResult.value?.data) {
    try {
      const data = stateResult.value.data;
      const offset = 8 + 1 + 32 * 5; // discriminator + is_initialized + 5 pubkeys
      if (data.length >= offset + 8) {
        proposalCount = Number(data.readBigUInt64LE(offset));
      }
    } catch {
      // layout mismatch — leave as 0
    }
  }

  return { circulatingSupply, totalBurned, totalStaked, proposalCount };
}

// ─── Instructions ─────────────────────────────────────────────────────────────

export async function stake(
  program: AnyProgram,
  owner: PublicKey,
  userAta: PublicKey,
  amount: number,
  lockDurationSecs: number
) {
  const [programState] = deriveProgramState();
  const [stakingVault] = deriveStakingVault();
  const [rewardsTreasury] = deriveRewardsTreasury();
  const [stakeRecord] = deriveStakeRecord(owner);
  const DECIMALS = 6;
  const amountBN = new BN(Math.floor(amount * 10 ** DECIMALS));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program as any).methods
    .stake(amountBN, new BN(lockDurationSecs))
    .accounts({
      stakeRecord,
      programState,
      hormuzMint: HORMUZ_MINT,
      stakingVault,
      rewardsTreasury,
      userTokenAccount: userAta,
      owner,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function unstake(
  program: AnyProgram,
  owner: PublicKey,
  userAta: PublicKey
) {
  const [programState] = deriveProgramState();
  const [stakingVault] = deriveStakingVault();
  const [rewardsTreasury] = deriveRewardsTreasury();
  const [stakeRecord] = deriveStakeRecord(owner);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program as any).methods
    .unstake()
    .accounts({
      stakeRecord,
      programState,
      stakingVault,
      rewardsTreasury,
      userTokenAccount: userAta,
      owner,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

export async function createProposal(
  program: AnyProgram,
  proposer: PublicKey,
  title: string,
  description: string,
  executionAmount: number,
  executionTarget: PublicKey,
  currentProposalCount: number
) {
  const [programState] = deriveProgramState();
  const [proposal] = deriveProposal(currentProposalCount);
  const [stakeRecord] = deriveStakeRecord(proposer);
  const DECIMALS = 6;
  const amountBN = new BN(Math.floor(executionAmount * 10 ** DECIMALS));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program as any).methods
    .createProposal(title, description, amountBN, executionTarget)
    .accounts({
      proposal,
      programState,
      stakeRecord,
      proposer,
      owner: proposer,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function voteOnProposal(
  program: AnyProgram,
  voter: PublicKey,
  proposalId: number,
  support: boolean
) {
  const [proposal] = deriveProposal(proposalId);
  const [stakeRecord] = deriveStakeRecord(voter);
  const [voteRecord] = deriveVoteRecord(voter, proposalId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program as any).methods
    .vote(support)
    .accounts({
      proposal,
      voteRecord,
      stakeRecord,
      voter,
      owner: voter,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}
