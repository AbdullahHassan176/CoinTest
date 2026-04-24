# HORMUZ Smart Contract — Manual Audit Report

**Date:** 2026-04-24  
**Auditor:** Internal review (pre-mainnet)  
**Scope:** `programs/hormuz/src/` (lib.rs, staking.rs, dao.rs, state.rs, errors.rs)  
**Framework:** Anchor 0.30.1 on Solana 1.18  
**Status:** All findings addressed. Ready for Sec3 / OtterSec formal review.

---

## Summary

| Severity | Found | Fixed |
|---|---|---|
| Critical | 1 | 1 |
| Medium | 1 | 1 |
| Low | 2 | 2 |
| Informational | 3 | N/A |

---

## Findings

### [CRITICAL-01] No Quorum Minimum on DAO Proposals

**File:** `dao.rs` — `finalize_proposal`  
**Status:** FIXED

**Description:**  
`finalize_proposal` previously marked a proposal as `Passed` if `yes_votes > no_votes`,
with no minimum vote threshold. A single staker holding even 1 HORMUZ could create a
proposal, vote for it, wait 7 days, finalize it as `Passed`, and execute it to drain the
DAO treasury.

**Fix applied:**  
Added `QUORUM_MIN_RAW = 100_000_000_000_000` (100M HORMUZ in raw units = 0.1% of supply).
Both conditions must now be met to pass:
```rust
proposal.yes_votes > proposal.no_votes && proposal.yes_votes >= QUORUM_MIN_RAW
```

**Residual risk:**  
0.1% of 100B = 100M HORMUZ. If the staking distribution is highly concentrated, a whale
could still pass proposals alone. Consider raising to 1% (1B HORMUZ) before mainnet if
the supply distribution is not broad enough.

---

### [MEDIUM-01] Execution Target Mint Not Validated Before Transfer

**File:** `dao.rs` — `execute_proposal`  
**Status:** FIXED

**Description:**  
`execution_target` was constrained only by `address = proposal.execution_target`, which
validates the account address but not its token mint. Passing a token account of a
different mint would cause the SPL transfer to fail at runtime, but the error message
would be opaque and could be exploited to brick a passed proposal.

**Fix applied:**  
Added explicit mint check before the transfer:
```rust
require!(
    ctx.accounts.execution_target.mint == ctx.accounts.dao_treasury.mint,
    HormuzError::WrongMint
);
```

---

### [LOW-01] Misleading Error Code on Ownership Check

**File:** `dao.rs` — `CreateProposal` and `Vote` contexts  
**Status:** FIXED

**Description:**  
`has_one = owner @ HormuzError::ZeroAmount` used `ZeroAmount` as the error for an
ownership mismatch. This would produce a confusing error message in frontends and
explorers ("Amount must be greater than zero" when the real issue is account ownership).

**Fix applied:**  
Added `HormuzError::Unauthorized` and replaced both occurrences.

---

### [LOW-02] Dead Code — `Proposal::is_passed()`

**File:** `dao.rs`  
**Status:** FIXED

**Description:**  
`is_passed()` was defined on `Proposal` but never called anywhere. The method also
checked `Active` status rather than `Passed`, making its name misleading.

**Fix applied:** Method removed.

---

## Informational (No Action Required)

### [INFO-01] Single Stake Per Wallet

Each wallet can only hold one active `StakeRecord` (PDA seeds: `[b"stake-record", owner]`).
Staking a second time requires unstaking first. This is a deliberate design constraint
and does not represent a vulnerability.

### [INFO-02] Dependency CVEs in Solana SDK

`cargo audit` reports 2 medium-severity CVEs in `curve25519-dalek 3.2.1` and
`ed25519-dalek 1.0.1`, both pinned by the Solana 1.18 SDK. These are known ecosystem-wide
issues, present in every Anchor 0.30 program, and are not exploitable in an on-chain BPF
context. They will be resolved when Solana upgrades their SDK dependency versions.

### [INFO-03] Permissionless Finalization

`finalize_proposal` can be called by anyone once the voting period ends. This is by
design — permissionless finalization prevents a single party from blocking proposal
resolution. Correct behaviour.

---

## Architecture Notes

### Staking (`staking.rs`)

| Check | Status |
|---|---|
| Zero amount validation | `require!(amount > 0)` |
| Lock duration whitelist | Only 30/90/180 days accepted |
| Burn arithmetic | Uses `saturating_mul` (no overflow path) |
| Reward arithmetic | Uses `u128` intermediates + `checked_mul` / `checked_div` |
| Treasury solvency check before staking | `require!(treasury.amount >= rewards_owed)` |
| PDA signer seeds for vault withdrawal | `new_with_signer` with program-state seeds |
| Stake record closed on unstake | `close = owner` |
| Re-entry protection | Single stake record per owner (PDA constraint) |

### DAO (`dao.rs`)

| Check | Status |
|---|---|
| Proposer must be staked | `stake_record` PDA verified in `CreateProposal` |
| Voter must be staked | `stake_record` PDA verified in `Vote` |
| Double-vote prevention | `VoteRecord` PDA init fails if already exists |
| Vote only during active period | `require!(now < proposal.voting_ends_at)` |
| Finalize only after voting ends | `require!(now >= proposal.voting_ends_at)` |
| Execute only after finalize | `require!(status == Passed)` |
| Quorum minimum | `yes_votes >= QUORUM_MIN_RAW` (0.1% of supply) |
| Treasury target mint validation | `execution_target.mint == dao_treasury.mint` |
| Treasury uses program-state PDA as authority | Correct — PDA signs with seeds |

### Key Accounts / PDA Table

| PDA | Seeds | Authority |
|---|---|---|
| `program-state` | `[b"program-state"]` | itself (Anchor Account) |
| `staking-vault` | `[b"staking-vault"]` | `program-state` PDA |
| `rewards-treasury` | `[b"rewards-treasury"]` | `program-state` PDA |
| `dao-treasury` | `[b"dao-treasury"]` | `program-state` PDA |
| `stake-record` | `[b"stake-record", owner]` | N/A (data account) |
| `proposal` | `[b"proposal", id_le_bytes]` | N/A (data account) |
| `vote-record` | `[b"vote-record", voter, id]` | N/A (data account) |

---

## Before Mainnet Checklist

- [x] CRITICAL-01 fixed (quorum)
- [x] MEDIUM-01 fixed (mint check)
- [x] LOW-01 fixed (error codes)
- [x] LOW-02 fixed (dead code removed)
- [x] Rebuild + redeploy to devnet after fixes
- [x] Rebuild + redeploy to devnet after fixes (2026-04-24, slot confirmed)
- [ ] Confirm quorum threshold is appropriate for expected staker distribution
- [ ] Run Sec3 open-source CLI: `cargo install --git https://github.com/sec3-product/x-ray && x-ray programs/`
- [ ] Optional: OtterSec formal audit before mainnet (if significant TVL expected)
