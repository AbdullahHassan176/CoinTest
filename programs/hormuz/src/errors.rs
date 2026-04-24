use anchor_lang::prelude::*;

#[error_code]
pub enum HormuzError {
    #[msg("Stake is still locked — unlock time has not been reached")]
    StakeLocked,

    #[msg("Amount must be greater than zero")]
    ZeroAmount,

    #[msg("Invalid lock duration — choose 30, 90, or 180 days")]
    InvalidLockDuration,

    #[msg("Insufficient staking rewards in treasury")]
    InsufficientRewards,

    #[msg("Voting period has ended for this proposal")]
    VotingPeriodEnded,

    #[msg("Voting period is still active — cannot execute yet")]
    VotingPeriodActive,

    #[msg("Proposal did not pass (insufficient yes votes)")]
    ProposalNotPassed,

    #[msg("Proposal has already been executed")]
    ProposalAlreadyExecuted,

    #[msg("You have already voted on this proposal")]
    AlreadyVoted,

    #[msg("Proposal title exceeds maximum length of 100 characters")]
    TitleTooLong,

    #[msg("Proposal description exceeds maximum length of 500 characters")]
    DescriptionTooLong,

    #[msg("Arithmetic overflow")]
    Overflow,
}
