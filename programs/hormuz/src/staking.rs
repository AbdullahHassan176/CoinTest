use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::HormuzError;
use crate::state::ProgramState;

// Basis points for 1% burn rate
pub const BURN_RATE_BPS: u64 = 100;
pub const BPS_DENOMINATOR: u64 = 10_000;

// Lock duration tiers in seconds
pub const LOCK_30_DAYS: i64 = 30 * 24 * 60 * 60;
pub const LOCK_90_DAYS: i64 = 90 * 24 * 60 * 60;
pub const LOCK_180_DAYS: i64 = 180 * 24 * 60 * 60;

// Annual yield per tier in basis points (10%, 20%, 40%)
pub const APY_30_DAYS_BPS: u64 = 1_000;
pub const APY_90_DAYS_BPS: u64 = 2_000;
pub const APY_180_DAYS_BPS: u64 = 4_000;

#[account]
pub struct StakeRecord {
    pub owner: Pubkey,
    /// Tokens held in the vault for this stake (after burn)
    pub amount_staked: u64,
    pub lock_start: i64,
    pub lock_duration_secs: i64,
    /// Pre-calculated reward owed at unlock
    pub rewards_owed: u64,
    pub bump: u8,
}

impl StakeRecord {
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 8 + 1;

    pub fn lock_end(&self) -> i64 {
        self.lock_start
            .checked_add(self.lock_duration_secs)
            .unwrap_or(i64::MAX)
    }
}

/// Calculate the 1% burn amount for a given transfer
pub fn burn_amount(amount: u64) -> u64 {
    amount.saturating_mul(BURN_RATE_BPS) / BPS_DENOMINATOR
}

/// Calculate the reward for a stake over its full lock period
pub fn calculate_reward(amount: u64, lock_duration_secs: i64) -> Result<u64> {
    let apy_bps = match lock_duration_secs {
        d if d == LOCK_30_DAYS => APY_30_DAYS_BPS,
        d if d == LOCK_90_DAYS => APY_90_DAYS_BPS,
        d if d == LOCK_180_DAYS => APY_180_DAYS_BPS,
        _ => return err!(HormuzError::InvalidLockDuration),
    };

    // reward = amount * (apy_bps / 10000) * (lock_days / 365)
    // Use integer arithmetic: reward = amount * apy_bps * lock_secs / (BPS_DENOMINATOR * 365 * 86400)
    let seconds_per_year: u64 = 365 * 24 * 60 * 60;
    let reward = (amount as u128)
        .checked_mul(apy_bps as u128)
        .ok_or(HormuzError::Overflow)?
        .checked_mul(lock_duration_secs as u128)
        .ok_or(HormuzError::Overflow)?
        .checked_div((BPS_DENOMINATOR as u128).checked_mul(seconds_per_year as u128).ok_or(HormuzError::Overflow)?)
        .ok_or(HormuzError::Overflow)? as u64;

    Ok(reward)
}

// ─── Instructions ────────────────────────────────────────────────────────────

pub fn stake(ctx: Context<Stake>, amount: u64, lock_duration_secs: i64) -> Result<()> {
    require!(amount > 0, HormuzError::ZeroAmount);
    require!(
        lock_duration_secs == LOCK_30_DAYS
            || lock_duration_secs == LOCK_90_DAYS
            || lock_duration_secs == LOCK_180_DAYS,
        HormuzError::InvalidLockDuration
    );

    // 1% burn on stake — deducted from user's wallet before vaulting
    let burn = burn_amount(amount);
    let vault_amount = amount.saturating_sub(burn);

    // Burn 1% from user's token account
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.hormuz_mint.to_account_info(),
                from: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        burn,
    )?;

    // Transfer remaining 99% to staking vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_account.to_account_info(),
                to: ctx.accounts.staking_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        vault_amount,
    )?;

    // Pre-calculate reward owed at unlock
    let rewards_owed = calculate_reward(vault_amount, lock_duration_secs)?;

    // Verify treasury has enough to cover future rewards
    require!(
        ctx.accounts.rewards_treasury.amount >= rewards_owed,
        HormuzError::InsufficientRewards
    );

    // Write stake record
    let record = &mut ctx.accounts.stake_record;
    record.owner = ctx.accounts.owner.key();
    record.amount_staked = vault_amount;
    record.lock_start = Clock::get()?.unix_timestamp;
    record.lock_duration_secs = lock_duration_secs;
    record.rewards_owed = rewards_owed;
    record.bump = ctx.bumps.stake_record;

    // Update global state
    let state = &mut ctx.accounts.program_state;
    state.total_staked = state.total_staked.saturating_add(vault_amount);
    state.total_burned = state.total_burned.saturating_add(burn);

    emit!(StakeEvent {
        owner: ctx.accounts.owner.key(),
        amount_staked: vault_amount,
        amount_burned: burn,
        lock_duration_secs,
        rewards_owed,
        lock_end: record.lock_end(),
    });

    Ok(())
}

pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
    let record = &ctx.accounts.stake_record;
    let now = Clock::get()?.unix_timestamp;

    require!(now >= record.lock_end(), HormuzError::StakeLocked);

    let amount_staked = record.amount_staked;
    let rewards_owed = record.rewards_owed;
    let owner_key = record.owner;

    // PDA signer seeds for program_state
    let state_seeds: &[&[u8]] = &[b"program-state", &[ctx.accounts.program_state.bump]];
    let signer_seeds = &[state_seeds];

    // Return principal from staking vault
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.staking_vault.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.program_state.to_account_info(),
            },
            signer_seeds,
        ),
        amount_staked,
    )?;

    // Pay rewards from treasury
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.rewards_treasury.to_account_info(),
                to: ctx.accounts.user_token_account.to_account_info(),
                authority: ctx.accounts.program_state.to_account_info(),
            },
            signer_seeds,
        ),
        rewards_owed,
    )?;

    // Update global state
    let state = &mut ctx.accounts.program_state;
    state.total_staked = state.total_staked.saturating_sub(amount_staked);

    emit!(UnstakeEvent {
        owner: owner_key,
        amount_returned: amount_staked,
        rewards_paid: rewards_owed,
    });

    Ok(())
}

// ─── Account Contexts ─────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(
        init,
        payer = owner,
        space = StakeRecord::LEN,
        seeds = [b"stake-record", owner.key().as_ref()],
        bump
    )]
    pub stake_record: Account<'info, StakeRecord>,

    #[account(
        mut,
        seeds = [b"program-state"],
        bump = program_state.bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(mut, address = program_state.hormuz_mint)]
    pub hormuz_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"staking-vault"],
        bump
    )]
    pub staking_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"rewards-treasury"],
        bump
    )]
    pub rewards_treasury: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = hormuz_mint,
        token::authority = owner
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(
        mut,
        seeds = [b"stake-record", owner.key().as_ref()],
        bump = stake_record.bump,
        has_one = owner,
        close = owner
    )]
    pub stake_record: Account<'info, StakeRecord>,

    #[account(
        mut,
        seeds = [b"program-state"],
        bump = program_state.bump
    )]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        mut,
        seeds = [b"staking-vault"],
        bump
    )]
    pub staking_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"rewards-treasury"],
        bump
    )]
    pub rewards_treasury: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = program_state.hormuz_mint,
        token::authority = owner
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub owner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct StakeEvent {
    pub owner: Pubkey,
    pub amount_staked: u64,
    pub amount_burned: u64,
    pub lock_duration_secs: i64,
    pub rewards_owed: u64,
    pub lock_end: i64,
}

#[event]
pub struct UnstakeEvent {
    pub owner: Pubkey,
    pub amount_returned: u64,
    pub rewards_paid: u64,
}
