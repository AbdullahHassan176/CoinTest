use anchor_lang::prelude::*;

#[account]
pub struct ProgramState {
    pub authority: Pubkey,
    pub hormuz_mint: Pubkey,
    pub staking_vault: Pubkey,
    pub rewards_treasury: Pubkey,
    pub dao_treasury: Pubkey,
    pub total_staked: u64,
    pub total_burned: u64,
    pub proposal_count: u64,
    pub bump: u8,
}

impl ProgramState {
    // 8 discriminator + 5×32 pubkeys + 3×8 u64s + 1 bump
    pub const LEN: usize = 8 + (5 * 32) + (3 * 8) + 1;
}
