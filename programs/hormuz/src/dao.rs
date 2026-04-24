use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::HormuzError;
use crate::state::ProgramState;
use crate::staking::StakeRecord;

pub const VOTING_PERIOD_SECS: i64 = 7 * 24 * 60 * 60; // 7 days
pub const PROPOSAL_TITLE_MAX_LEN: usize = 100;
pub const PROPOSAL_DESC_MAX_LEN: usize = 500;

// Minimum yes_votes required to pass: 0.1% of total supply (in raw units, 6 decimals)
// 100B total supply * 0.001 = 100M tokens = 100_000_000 * 10^6 = 100_000_000_000_000 raw
// This ensures a single dust staker cannot drain the DAO treasury on their own.
pub const QUORUM_MIN_RAW: u64 = 100_000_000_000_000;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ProposalStatus {
    Active,
    Passed,
    Rejected,
    Executed,
}

#[account]
pub struct Proposal {
    pub proposer: Pubkey,
    pub proposal_id: u64,
    pub title: String,
    pub description: String,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub status: ProposalStatus,
    pub created_at: i64,
    pub voting_ends_at: i64,
    /// Amount of HORMUZ to release from DAO treasury if executed
    pub execution_amount: u64,
    /// Destination for treasury funds if executed
    pub execution_target: Pubkey,
    pub bump: u8,
}

impl Proposal {
    pub const LEN: usize = 8
        + 32               // proposer
        + 8                // proposal_id
        + 4 + PROPOSAL_TITLE_MAX_LEN  // title (String prefix + content)
        + 4 + PROPOSAL_DESC_MAX_LEN   // description
        + 8 + 8            // yes_votes, no_votes
        + 1                // status enum
        + 8 + 8            // created_at, voting_ends_at
        + 8                // execution_amount
        + 32               // execution_target
        + 1;               // bump

}

#[account]
pub struct VoteRecord {
    pub voter: Pubkey,
    pub proposal_id: u64,
    pub support: bool,
    pub voting_power: u64,
    pub bump: u8,
}

impl VoteRecord {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 8 + 1;
}

// ─── Instructions ─────────────────────────────────────────────────────────────

pub fn create_proposal(
    ctx: Context<CreateProposal>,
    title: String,
    description: String,
    execution_amount: u64,
    execution_target: Pubkey,
) -> Result<()> {
    require!(title.len() <= PROPOSAL_TITLE_MAX_LEN, HormuzError::TitleTooLong);
    require!(description.len() <= PROPOSAL_DESC_MAX_LEN, HormuzError::DescriptionTooLong);

    let state = &mut ctx.accounts.program_state;
    let now = Clock::get()?.unix_timestamp;

    let proposal = &mut ctx.accounts.proposal;
    proposal.proposer = ctx.accounts.proposer.key();
    proposal.proposal_id = state.proposal_count;
    proposal.title = title.clone();
    proposal.description = description;
    proposal.yes_votes = 0;
    proposal.no_votes = 0;
    proposal.status = ProposalStatus::Active;
    proposal.created_at = now;
    proposal.voting_ends_at = now.saturating_add(VOTING_PERIOD_SECS);
    proposal.execution_amount = execution_amount;
    proposal.execution_target = execution_target;
    proposal.bump = ctx.bumps.proposal;

    state.proposal_count = state.proposal_count.saturating_add(1);

    emit!(ProposalCreatedEvent {
        proposal_id: proposal.proposal_id,
        proposer: proposal.proposer,
        title,
        voting_ends_at: proposal.voting_ends_at,
    });

    Ok(())
}

pub fn vote(ctx: Context<Vote>, support: bool) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    let now = Clock::get()?.unix_timestamp;

    require!(now < proposal.voting_ends_at, HormuzError::VotingPeriodEnded);
    require!(proposal.status == ProposalStatus::Active, HormuzError::VotingPeriodEnded);

    // Voting power = staked token balance (must be staked to vote)
    let voting_power = ctx.accounts.stake_record.amount_staked;

    if support {
        proposal.yes_votes = proposal.yes_votes.saturating_add(voting_power);
    } else {
        proposal.no_votes = proposal.no_votes.saturating_add(voting_power);
    }

    let vote_record = &mut ctx.accounts.vote_record;
    vote_record.voter = ctx.accounts.voter.key();
    vote_record.proposal_id = proposal.proposal_id;
    vote_record.support = support;
    vote_record.voting_power = voting_power;
    vote_record.bump = ctx.bumps.vote_record;

    emit!(VoteEvent {
        proposal_id: proposal.proposal_id,
        voter: ctx.accounts.voter.key(),
        support,
        voting_power,
    });

    Ok(())
}

pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    let now = Clock::get()?.unix_timestamp;

    require!(now >= proposal.voting_ends_at, HormuzError::VotingPeriodActive);
    require!(proposal.status == ProposalStatus::Active, HormuzError::ProposalAlreadyExecuted);

    // Must meet quorum AND have more yes than no votes to pass
    proposal.status = if proposal.yes_votes > proposal.no_votes
        && proposal.yes_votes >= QUORUM_MIN_RAW
    {
        ProposalStatus::Passed
    } else {
        ProposalStatus::Rejected
    };

    Ok(())
}

pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
    let proposal = &mut ctx.accounts.proposal;
    let now = Clock::get()?.unix_timestamp;

    require!(now >= proposal.voting_ends_at, HormuzError::VotingPeriodActive);
    require!(proposal.status == ProposalStatus::Passed, HormuzError::ProposalNotPassed);

    // Verify execution target holds the same mint as the DAO treasury
    require!(
        ctx.accounts.execution_target.mint == ctx.accounts.dao_treasury.mint,
        HormuzError::WrongMint
    );

    let state_seeds: &[&[u8]] = &[b"program-state", &[ctx.accounts.program_state.bump]];
    let signer_seeds = &[state_seeds];

    // Transfer execution_amount from DAO treasury to the designated target
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.dao_treasury.to_account_info(),
                to: ctx.accounts.execution_target.to_account_info(),
                authority: ctx.accounts.program_state.to_account_info(),
            },
            signer_seeds,
        ),
        proposal.execution_amount,
    )?;

    proposal.status = ProposalStatus::Executed;

    emit!(ProposalExecutedEvent {
        proposal_id: proposal.proposal_id,
        execution_amount: proposal.execution_amount,
        execution_target: proposal.execution_target,
    });

    Ok(())
}

// ─── Account Contexts ─────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(title: String, description: String)]
pub struct CreateProposal<'info> {
    #[account(
        init,
        payer = proposer,
        space = Proposal::LEN,
        seeds = [b"proposal", program_state.proposal_count.to_le_bytes().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        mut,
        seeds = [b"program-state"],
        bump = program_state.bump
    )]
    pub program_state: Account<'info, ProgramState>,

    /// Proposer must be staked to create a proposal
    #[account(
        seeds = [b"stake-record", proposer.key().as_ref()],
        bump = stake_record.bump,
        has_one = owner @ HormuzError::Unauthorized
    )]
    pub stake_record: Account<'info, crate::staking::StakeRecord>,

    #[account(mut)]
    pub proposer: Signer<'info>,

    /// CHECK: this is validated in the instruction against stake_record.owner
    pub owner: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Vote<'info> {
    #[account(
        mut,
        seeds = [b"proposal", proposal.proposal_id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        init,
        payer = voter,
        space = VoteRecord::LEN,
        seeds = [b"vote-record", voter.key().as_ref(), proposal.proposal_id.to_le_bytes().as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,

    /// Voter must be staked — their staked balance = voting power
    #[account(
        seeds = [b"stake-record", voter.key().as_ref()],
        bump = stake_record.bump,
        has_one = owner @ HormuzError::Unauthorized
    )]
    pub stake_record: Account<'info, StakeRecord>,

    #[account(mut)]
    pub voter: Signer<'info>,

    /// CHECK: validated via stake_record has_one
    pub owner: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeProposal<'info> {
    #[account(
        mut,
        seeds = [b"proposal", proposal.proposal_id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,

    /// Anyone can finalize once voting period ends
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct ExecuteProposal<'info> {
    #[account(
        mut,
        seeds = [b"proposal", proposal.proposal_id.to_le_bytes().as_ref()],
        bump = proposal.bump
    )]
    pub proposal: Account<'info, Proposal>,

    #[account(
        seeds = [b"program-state"],
        bump = program_state.bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        mut,
        seeds = [b"dao-treasury"],
        bump
    )]
    pub dao_treasury: Account<'info, TokenAccount>,

    #[account(
        mut,
        address = proposal.execution_target
    )]
    pub execution_target: Account<'info, TokenAccount>,

    pub executor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct ProposalCreatedEvent {
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub title: String,
    pub voting_ends_at: i64,
}

#[event]
pub struct VoteEvent {
    pub proposal_id: u64,
    pub voter: Pubkey,
    pub support: bool,
    pub voting_power: u64,
}

#[event]
pub struct ProposalExecutedEvent {
    pub proposal_id: u64,
    pub execution_amount: u64,
    pub execution_target: Pubkey,
}
