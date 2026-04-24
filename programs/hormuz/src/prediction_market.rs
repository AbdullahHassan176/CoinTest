use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::HormuzError;
use crate::state::ProgramState;
use crate::staking::StakeRecord;

pub const MARKET_QUESTION_MAX_LEN: usize = 200;
/// House cut in basis points (200 = 2%). Burned on resolution.
pub const HOUSE_CUT_BPS: u64 = 200;

// ─── Enums ────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MarketStatus {
    Active,
    Resolved,
    Cancelled,
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

/// Global counter for markets. Separate PDA to avoid modifying ProgramState
/// and breaking existing deployed accounts.
#[account]
pub struct MarketConfig {
    pub market_count: u64,
    pub bump: u8,
}

impl MarketConfig {
    // 8 discriminator + 8 u64 + 1 bump
    pub const LEN: usize = 8 + 8 + 1;
}

/// One prediction market.
#[account]
pub struct Market {
    pub creator: Pubkey,
    pub market_id: u64,
    pub question: String,       // max MARKET_QUESTION_MAX_LEN bytes
    pub resolution_end: i64,
    pub status: MarketStatus,   // 1 byte enum
    pub yes_pool: u64,
    pub no_pool: u64,
    /// Set to true (YES won) or false (NO won) on resolution.
    pub outcome: bool,
    pub bump: u8,
}

impl Market {
    pub const LEN: usize = 8
        + 32                              // creator
        + 8                               // market_id
        + 4 + MARKET_QUESTION_MAX_LEN     // question (String prefix + max content)
        + 8                               // resolution_end
        + 1                               // status enum
        + 8 + 8                           // yes_pool, no_pool
        + 1                               // outcome
        + 1;                              // bump
}

/// A single user's position in a market. One per (user, market) pair.
#[account]
pub struct MarketPosition {
    pub owner: Pubkey,
    pub market_id: u64,
    pub side: bool,     // true = YES, false = NO
    pub amount: u64,    // raw HORMUZ placed (6 decimals)
    pub claimed: bool,
    pub bump: u8,
}

impl MarketPosition {
    pub const LEN: usize = 8 + 32 + 8 + 1 + 8 + 1 + 1;
}

// ─── Instruction: init_market_config ─────────────────────────────────────────

/// One-time setup. Authority-only. Creates the market counter PDA.
pub fn init_market_config(ctx: Context<InitMarketConfig>) -> Result<()> {
    let config = &mut ctx.accounts.market_config;
    config.market_count = 0;
    config.bump = ctx.bumps.market_config;
    Ok(())
}

#[derive(Accounts)]
pub struct InitMarketConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = MarketConfig::LEN,
        seeds = [b"market-config"],
        bump
    )]
    pub market_config: Account<'info, MarketConfig>,

    #[account(seeds = [b"program-state"], bump = program_state.bump)]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        mut,
        constraint = authority.key() == program_state.authority @ HormuzError::Unauthorized
    )]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ─── Instruction: create_market ──────────────────────────────────────────────

/// Creates a new prediction market. Caller must have an active stake record.
pub fn create_market(
    ctx: Context<CreateMarket>,
    question: String,
    resolution_end: i64,
) -> Result<()> {
    require!(question.len() <= MARKET_QUESTION_MAX_LEN, HormuzError::QuestionTooLong);

    let clock = Clock::get()?;
    require!(resolution_end > clock.unix_timestamp, HormuzError::InvalidResolutionEnd);

    let market_id = ctx.accounts.market_config.market_count;

    let market = &mut ctx.accounts.market;
    market.creator = ctx.accounts.creator.key();
    market.market_id = market_id;
    market.question = question;
    market.resolution_end = resolution_end;
    market.status = MarketStatus::Active;
    market.yes_pool = 0;
    market.no_pool = 0;
    market.outcome = false;
    market.bump = ctx.bumps.market;

    ctx.accounts.market_config.market_count = market_id
        .checked_add(1)
        .ok_or(HormuzError::Overflow)?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(question: String, resolution_end: i64)]
pub struct CreateMarket<'info> {
    #[account(mut, seeds = [b"market-config"], bump = market_config.bump)]
    pub market_config: Box<Account<'info, MarketConfig>>,

    #[account(
        init,
        payer = creator,
        space = Market::LEN,
        seeds = [b"market", market_config.market_count.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Box<Account<'info, Market>>,

    /// Creator must hold an active stake record (stakers only).
    #[account(
        seeds = [b"stake-record", creator.key().as_ref()],
        bump = stake_record.bump,
        constraint = stake_record.owner == creator.key() @ HormuzError::Unauthorized
    )]
    pub stake_record: Box<Account<'info, StakeRecord>>,

    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ─── Instruction: create_market_vault ────────────────────────────────────────

/// Creates the token vault for a market. Split from create_market to stay
/// under the BPF stack limit (matches pattern of create_staking_vault etc.).
pub fn create_market_vault(ctx: Context<CreateMarketVault>, _market_id: u64) -> Result<()> {
    // The init constraint already sets up the token account.
    // Record the vault pubkey on the market account.
    ctx.accounts.market_vault.key();
    Ok(())
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CreateMarketVault<'info> {
    #[account(mut, seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,

    #[account(
        init,
        payer = payer,
        token::mint = hormuz_mint,
        token::authority = program_state,
        seeds = [b"market-vault", market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub market_vault: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"program-state"], bump = program_state.bump)]
    pub program_state: Box<Account<'info, ProgramState>>,

    #[account(address = program_state.hormuz_mint)]
    pub hormuz_mint: Box<Account<'info, Mint>>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// ─── Instruction: place_bet ───────────────────────────────────────────────────

/// Place a YES or NO bet on an active market. One position per user per market.
pub fn place_bet(ctx: Context<PlaceBet>, _market_id: u64, side: bool, amount: u64) -> Result<()> {
    require!(amount > 0, HormuzError::ZeroAmount);

    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Active, HormuzError::MarketNotActive);

    let clock = Clock::get()?;
    require!(clock.unix_timestamp < market.resolution_end, HormuzError::VotingPeriodEnded);

    // Transfer HORMUZ from bettor's ATA to market vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.user_ata.to_account_info(),
                to:        ctx.accounts.market_vault.to_account_info(),
                authority: ctx.accounts.bettor.to_account_info(),
            },
        ),
        amount,
    )?;

    if side {
        market.yes_pool = market.yes_pool.checked_add(amount).ok_or(HormuzError::Overflow)?;
    } else {
        market.no_pool = market.no_pool.checked_add(amount).ok_or(HormuzError::Overflow)?;
    }

    let position = &mut ctx.accounts.position;
    position.owner = ctx.accounts.bettor.key();
    position.market_id = market.market_id;
    position.side = side;
    position.amount = amount;
    position.claimed = false;
    position.bump = ctx.bumps.position;

    Ok(())
}

#[derive(Accounts)]
#[instruction(market_id: u64, side: bool, amount: u64)]
pub struct PlaceBet<'info> {
    #[account(mut, seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,

    #[account(
        init,
        payer = bettor,
        space = MarketPosition::LEN,
        seeds = [b"market-position", bettor.key().as_ref(), market_id.to_le_bytes().as_ref()],
        bump
    )]
    pub position: Box<Account<'info, MarketPosition>>,

    #[account(
        mut,
        seeds = [b"market-vault", market_id.to_le_bytes().as_ref()],
        bump,
        token::mint = program_state.hormuz_mint,
        token::authority = program_state
    )]
    pub market_vault: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"program-state"], bump = program_state.bump)]
    pub program_state: Box<Account<'info, ProgramState>>,

    #[account(mut, token::mint = program_state.hormuz_mint)]
    pub user_ata: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub bettor: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// ─── Instruction: resolve_market ─────────────────────────────────────────────

/// Authority resolves the market and burns the house cut immediately.
/// Winners then call claim_winnings to receive their proportional payout.
pub fn resolve_market(ctx: Context<ResolveMarket>, _market_id: u64, outcome: bool) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Active, HormuzError::MarketNotActive);

    let total_pool = market
        .yes_pool
        .checked_add(market.no_pool)
        .ok_or(HormuzError::Overflow)?;

    // Burn house cut immediately from vault so claim_winnings is simple transfers only
    if total_pool > 0 {
        let house_cut = total_pool
            .checked_mul(HOUSE_CUT_BPS)
            .ok_or(HormuzError::Overflow)?
            .checked_div(10_000)
            .ok_or(HormuzError::Overflow)?;

        if house_cut > 0 {
            let bump = ctx.accounts.program_state.bump;
            let seeds: &[&[u8]] = &[b"program-state", &[bump]];
            token::burn(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Burn {
                        mint:      ctx.accounts.hormuz_mint.to_account_info(),
                        from:      ctx.accounts.market_vault.to_account_info(),
                        authority: ctx.accounts.program_state.to_account_info(),
                    },
                    &[seeds],
                ),
                house_cut,
            )?;
        }
    }

    market.status = MarketStatus::Resolved;
    market.outcome = outcome;

    Ok(())
}

#[derive(Accounts)]
#[instruction(market_id: u64, outcome: bool)]
pub struct ResolveMarket<'info> {
    #[account(mut, seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [b"market-vault", market_id.to_le_bytes().as_ref()],
        bump,
        token::mint = program_state.hormuz_mint,
        token::authority = program_state
    )]
    pub market_vault: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"program-state"], bump = program_state.bump)]
    pub program_state: Box<Account<'info, ProgramState>>,

    #[account(mut, address = program_state.hormuz_mint)]
    pub hormuz_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = authority.key() == program_state.authority @ HormuzError::Unauthorized
    )]
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ─── Instruction: claim_winnings ─────────────────────────────────────────────

/// Winners call this after resolution to receive their proportional payout.
/// House cut was already burned in resolve_market, so this is a simple transfer.
pub fn claim_winnings(ctx: Context<ClaimWinnings>, _market_id: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    let position = &mut ctx.accounts.position;

    require!(market.status == MarketStatus::Resolved, HormuzError::MarketNotResolved);
    require!(!position.claimed, HormuzError::AlreadyClaimed);
    require!(position.side == market.outcome, HormuzError::PositionLost);

    let total_pool = market
        .yes_pool
        .checked_add(market.no_pool)
        .ok_or(HormuzError::Overflow)?;

    let winning_pool = if market.outcome { market.yes_pool } else { market.no_pool };
    require!(winning_pool > 0, HormuzError::ZeroAmount);

    // Payout pool = total_pool - house_cut (already burned)
    let house_cut = total_pool
        .checked_mul(HOUSE_CUT_BPS)
        .ok_or(HormuzError::Overflow)?
        .checked_div(10_000)
        .ok_or(HormuzError::Overflow)?;
    let payout_pool = total_pool.checked_sub(house_cut).ok_or(HormuzError::Overflow)?;

    // Proportional payout via u128 to prevent overflow
    let payout = (position.amount as u128)
        .checked_mul(payout_pool as u128)
        .ok_or(HormuzError::Overflow)?
        .checked_div(winning_pool as u128)
        .ok_or(HormuzError::Overflow)? as u64;

    let bump = ctx.accounts.program_state.bump;
    let seeds: &[&[u8]] = &[b"program-state", &[bump]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.market_vault.to_account_info(),
                to:        ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.program_state.to_account_info(),
            },
            &[seeds],
        ),
        payout,
    )?;

    position.claimed = true;

    Ok(())
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct ClaimWinnings<'info> {
    #[account(seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [b"market-position", winner.key().as_ref(), market_id.to_le_bytes().as_ref()],
        bump = position.bump,
        constraint = position.owner == winner.key() @ HormuzError::Unauthorized
    )]
    pub position: Box<Account<'info, MarketPosition>>,

    #[account(
        mut,
        seeds = [b"market-vault", market_id.to_le_bytes().as_ref()],
        bump,
        token::mint = program_state.hormuz_mint,
        token::authority = program_state
    )]
    pub market_vault: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"program-state"], bump = program_state.bump)]
    pub program_state: Box<Account<'info, ProgramState>>,

    #[account(mut, token::mint = program_state.hormuz_mint)]
    pub user_ata: Box<Account<'info, TokenAccount>>,

    pub winner: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

// ─── Instruction: cancel_market ──────────────────────────────────────────────

/// Authority cancels a market. All bettors may then call refund_bet.
pub fn cancel_market(ctx: Context<CancelMarket>, _market_id: u64) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Active, HormuzError::MarketNotActive);
    market.status = MarketStatus::Cancelled;
    Ok(())
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CancelMarket<'info> {
    #[account(mut, seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Account<'info, Market>,

    #[account(seeds = [b"program-state"], bump = program_state.bump)]
    pub program_state: Account<'info, ProgramState>,

    #[account(
        mut,
        constraint = authority.key() == program_state.authority @ HormuzError::Unauthorized
    )]
    pub authority: Signer<'info>,
}

// ─── Instruction: refund_bet ─────────────────────────────────────────────────

/// Bettor reclaims their tokens after a market is cancelled (no house cut).
pub fn refund_bet(ctx: Context<RefundBet>, _market_id: u64) -> Result<()> {
    let market = &ctx.accounts.market;
    let position = &mut ctx.accounts.position;

    require!(market.status == MarketStatus::Cancelled, HormuzError::MarketNotCancelled);
    require!(!position.claimed, HormuzError::AlreadyClaimed);

    let bump = ctx.accounts.program_state.bump;
    let seeds: &[&[u8]] = &[b"program-state", &[bump]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from:      ctx.accounts.market_vault.to_account_info(),
                to:        ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.program_state.to_account_info(),
            },
            &[seeds],
        ),
        position.amount,
    )?;

    position.claimed = true;

    Ok(())
}

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct RefundBet<'info> {
    #[account(seeds = [b"market", market_id.to_le_bytes().as_ref()], bump = market.bump)]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [b"market-position", bettor.key().as_ref(), market_id.to_le_bytes().as_ref()],
        bump = position.bump,
        constraint = position.owner == bettor.key() @ HormuzError::Unauthorized
    )]
    pub position: Box<Account<'info, MarketPosition>>,

    #[account(
        mut,
        seeds = [b"market-vault", market_id.to_le_bytes().as_ref()],
        bump,
        token::mint = program_state.hormuz_mint,
        token::authority = program_state
    )]
    pub market_vault: Box<Account<'info, TokenAccount>>,

    #[account(seeds = [b"program-state"], bump = program_state.bump)]
    pub program_state: Box<Account<'info, ProgramState>>,

    #[account(mut, token::mint = program_state.hormuz_mint)]
    pub user_ata: Box<Account<'info, TokenAccount>>,

    pub bettor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}
