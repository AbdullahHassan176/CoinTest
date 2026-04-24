use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

pub mod dao;
pub mod errors;
pub mod staking;
pub mod state;

use dao::*;
use staking::*;
use state::ProgramState;

declare_id!("5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv");

// ─── Program Entry Points ─────────────────────────────────────────────────────

#[program]
pub mod hormuz {
    use super::*;

    /// Step 1: creates the program state PDA and records the mint.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let state = &mut ctx.accounts.program_state;
        state.authority = ctx.accounts.authority.key();
        state.hormuz_mint = ctx.accounts.hormuz_mint.key();
        state.total_staked = 0;
        state.total_burned = 0;
        state.proposal_count = 0;
        state.bump = ctx.bumps.program_state;
        Ok(())
    }

    /// Step 2a: creates the staking vault PDA token account.
    pub fn create_staking_vault(ctx: Context<CreateStakingVault>) -> Result<()> {
        ctx.accounts.program_state.staking_vault = ctx.accounts.staking_vault.key();
        Ok(())
    }

    /// Step 2b: creates the rewards treasury PDA token account.
    pub fn create_rewards_treasury(ctx: Context<CreateRewardsTreasury>) -> Result<()> {
        ctx.accounts.program_state.rewards_treasury = ctx.accounts.rewards_treasury.key();
        Ok(())
    }

    /// Step 2c: creates the DAO treasury PDA token account.
    pub fn create_dao_treasury(ctx: Context<CreateDaoTreasury>) -> Result<()> {
        ctx.accounts.program_state.dao_treasury = ctx.accounts.dao_treasury.key();
        Ok(())
    }

    /// Stake HORMUZ tokens. Burns 1% on entry, vaults the rest.
    /// Rewards are pre-calculated and locked from the rewards treasury.
    pub fn stake(ctx: Context<Stake>, amount: u64, lock_duration_secs: i64) -> Result<()> {
        staking::stake(ctx, amount, lock_duration_secs)
    }

    /// Unstake after lock period expires. Returns principal + rewards.
    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        staking::unstake(ctx)
    }

    /// Create a DAO proposal. Proposer must be staked.
    pub fn create_proposal(
        ctx: Context<CreateProposal>,
        title: String,
        description: String,
        execution_amount: u64,
        execution_target: Pubkey,
    ) -> Result<()> {
        dao::create_proposal(ctx, title, description, execution_amount, execution_target)
    }

    /// Vote on an active proposal. Voting power = staked balance.
    pub fn vote(ctx: Context<Vote>, support: bool) -> Result<()> {
        dao::vote(ctx, support)
    }

    /// Finalize a proposal after voting period ends (sets Passed/Rejected).
    pub fn finalize_proposal(ctx: Context<FinalizeProposal>) -> Result<()> {
        dao::finalize_proposal(ctx)
    }

    /// Execute a passed proposal — releases treasury funds to target.
    pub fn execute_proposal(ctx: Context<ExecuteProposal>) -> Result<()> {
        dao::execute_proposal(ctx)
    }
}

// ─── Initialize Context (Step 1) ──────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = ProgramState::LEN,
        seeds = [b"program-state"],
        bump
    )]
    pub program_state: Account<'info, ProgramState>,

    pub hormuz_mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ─── Create Vaults Contexts (Steps 2a/2b/2c — one vault per tx to stay under BPF stack limit) ──

#[derive(Accounts)]
pub struct CreateStakingVault<'info> {
    #[account(mut, seeds = [b"program-state"], bump = program_state.bump)]
    pub program_state: Box<Account<'info, ProgramState>>,
    #[account(address = program_state.hormuz_mint)]
    pub hormuz_mint: Box<Account<'info, Mint>>,
    #[account(
        init, payer = authority,
        token::mint = hormuz_mint,
        token::authority = program_state,
        seeds = [b"staking-vault"], bump
    )]
    pub staking_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)] pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateRewardsTreasury<'info> {
    #[account(mut, seeds = [b"program-state"], bump = program_state.bump)]
    pub program_state: Box<Account<'info, ProgramState>>,
    #[account(address = program_state.hormuz_mint)]
    pub hormuz_mint: Box<Account<'info, Mint>>,
    #[account(
        init, payer = authority,
        token::mint = hormuz_mint,
        token::authority = program_state,
        seeds = [b"rewards-treasury"], bump
    )]
    pub rewards_treasury: Box<Account<'info, TokenAccount>>,
    #[account(mut)] pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateDaoTreasury<'info> {
    #[account(mut, seeds = [b"program-state"], bump = program_state.bump)]
    pub program_state: Box<Account<'info, ProgramState>>,
    #[account(address = program_state.hormuz_mint)]
    pub hormuz_mint: Box<Account<'info, Mint>>,
    #[account(
        init, payer = authority,
        token::mint = hormuz_mint,
        token::authority = program_state,
        seeds = [b"dao-treasury"], bump
    )]
    pub dao_treasury: Box<Account<'info, TokenAccount>>,
    #[account(mut)] pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
