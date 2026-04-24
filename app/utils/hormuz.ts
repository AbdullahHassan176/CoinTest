/**
 * hormuz.ts — Client helpers for interacting with the HORMUZ Anchor program.
 *
 * Wraps Anchor instruction calls so React components stay clean.
 */

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
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

// ─── Prediction Market PDA derivations ───────────────────────────────────────

function marketIdBuffer(marketId: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(marketId));
  return buf;
}

export function deriveMarketConfig() {
  return PublicKey.findProgramAddressSync([Buffer.from("market-config")], PROGRAM_ID);
}

export function deriveMarket(marketId: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), marketIdBuffer(marketId)],
    PROGRAM_ID
  );
}

export function deriveMarketVault(marketId: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market-vault"), marketIdBuffer(marketId)],
    PROGRAM_ID
  );
}

export function deriveMarketPosition(owner: PublicKey, marketId: number) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market-position"), owner.toBuffer(), marketIdBuffer(marketId)],
    PROGRAM_ID
  );
}

// ─── Prediction Market fetch helpers ─────────────────────────────────────────

export async function fetchMarketConfig(program: AnyProgram) {
  const [pda] = deriveMarketConfig();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (program.account as any).marketConfig.fetch(pda);
  } catch {
    return null;
  }
}

export async function fetchAllMarkets(program: AnyProgram) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (program.account as any).market.all();
  } catch {
    return [];
  }
}

export async function fetchMarket(program: AnyProgram, marketId: number) {
  const [pda] = deriveMarket(marketId);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (program.account as any).market.fetch(pda);
  } catch {
    return null;
  }
}

export async function fetchMarketPosition(
  program: AnyProgram,
  owner: PublicKey,
  marketId: number
) {
  const [pda] = deriveMarketPosition(owner, marketId);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (program.account as any).marketPosition.fetch(pda);
  } catch {
    return null;
  }
}

export async function fetchUserPositions(program: AnyProgram, owner: PublicKey) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (program.account as any).marketPosition.all([
      {
        memcmp: {
          offset: 8, // skip discriminator
          bytes: owner.toBase58(),
        },
      },
    ]);
  } catch {
    return [];
  }
}

// ─── Prediction Market instructions ──────────────────────────────────────────

const DECIMALS = 6;

export async function createMarket(
  program: AnyProgram,
  creator: PublicKey,
  question: string,
  resolutionEndUnixSecs: number,
  currentMarketCount: number
) {
  const [marketConfig] = deriveMarketConfig();
  const [market] = deriveMarket(currentMarketCount);
  const [stakeRecord] = deriveStakeRecord(creator);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program as any).methods
    .createMarket(question, new BN(resolutionEndUnixSecs))
    .accounts({
      marketConfig,
      market,
      stakeRecord,
      creator,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function createMarketVault(
  program: AnyProgram,
  payer: PublicKey,
  marketId: number
) {
  const [market] = deriveMarket(marketId);
  const [marketVault] = deriveMarketVault(marketId);
  const [programState] = deriveProgramState();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program as any).methods
    .createMarketVault(new BN(marketId))
    .accounts({
      market,
      marketVault,
      programState,
      hormuzMint: HORMUZ_MINT,
      payer,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
}

export async function placeBet(
  program: AnyProgram,
  bettor: PublicKey,
  userAta: PublicKey,
  marketId: number,
  side: boolean,
  amountTokens: number
) {
  const [market] = deriveMarket(marketId);
  const [position] = deriveMarketPosition(bettor, marketId);
  const [marketVault] = deriveMarketVault(marketId);
  const [programState] = deriveProgramState();
  const amountBN = new BN(Math.floor(amountTokens * 10 ** DECIMALS));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program as any).methods
    .placeBet(new BN(marketId), side, amountBN)
    .accounts({
      market,
      position,
      marketVault,
      programState,
      userAta,
      bettor,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();
}

export async function claimWinnings(
  program: AnyProgram,
  winner: PublicKey,
  userAta: PublicKey,
  marketId: number
) {
  const [market] = deriveMarket(marketId);
  const [position] = deriveMarketPosition(winner, marketId);
  const [marketVault] = deriveMarketVault(marketId);
  const [programState] = deriveProgramState();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program as any).methods
    .claimWinnings(new BN(marketId))
    .accounts({
      market,
      position,
      marketVault,
      programState,
      userAta,
      winner,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

export async function refundBet(
  program: AnyProgram,
  bettor: PublicKey,
  userAta: PublicKey,
  marketId: number
) {
  const [market] = deriveMarket(marketId);
  const [position] = deriveMarketPosition(bettor, marketId);
  const [marketVault] = deriveMarketVault(marketId);
  const [programState] = deriveProgramState();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (program as any).methods
    .refundBet(new BN(marketId))
    .accounts({
      market,
      position,
      marketVault,
      programState,
      userAta,
      bettor,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

// ─── Market UI helpers ────────────────────────────────────────────────────────

export function marketStatusLabel(status: { active?: Record<string, never>; resolved?: Record<string, never>; cancelled?: Record<string, never> }): string {
  if (status.active !== undefined) return "Active";
  if (status.resolved !== undefined) return "Resolved";
  if (status.cancelled !== undefined) return "Cancelled";
  return "Unknown";
}

export function yesOdds(yesPool: number, noPool: number): number {
  const total = yesPool + noPool;
  if (total === 0) return 50;
  return Math.round((yesPool / total) * 100);
}

export function noOdds(yesPool: number, noPool: number): number {
  return 100 - yesOdds(yesPool, noPool);
}

