# HORMUZ Smart Contract Audit Guide

## Option A — Sec3 X-ray (Free, recommended first step)

Sec3 X-ray is a static analysis scanner for Solana/Anchor programs. It detects
50+ vulnerability classes (integer overflow, missing signer checks, bump seed
issues, account confusion attacks, etc.).

### Step 1 — Sign up

Go to **https://pro.sec3.dev** and create a free account.

### Step 2 — Connect your GitHub repo

The scanner integrates with GitHub CI. Push the repo to GitHub if you haven't
already, then link it in the Sec3 dashboard.

Alternatively use the **open-source CLI** (no account needed for basic scan):

```bash
# Requires Rust + Cargo installed
cargo install --git https://github.com/sec3-product/x-ray

# Run in the repo root (scans programs/hormuz/src/)
x-ray programs/hormuz/src/lib.rs
```

### Step 3 — Interpret results

The free plan detects a subset of issues. Pay attention to:

| Severity | Examples for Anchor programs |
|---|---|
| Critical | Missing signer check, missing ownership check |
| High | Integer overflow (use `checked_add`), unchecked arithmetic |
| Medium | Bump seed not validated, account not reloaded after CPI |
| Low | Unused accounts, dead code |

### Step 4 — Fix & re-scan

Fix reported issues in `programs/hormuz/src/`, rebuild (`anchor build --no-idl`),
redeploy, and re-run the scan until clean.

---

## Option B — cargo-audit (dependency vulnerabilities)

Checks your Rust dependencies against the RustSec advisory database.

```powershell
cargo install cargo-audit
cargo audit
```

---

## Option C — Manual checklist (Anchor-specific)

Before mainnet, manually verify these in `programs/hormuz/src/`:

- [ ] All `#[account(mut)]` accounts have ownership validated (Anchor does this automatically via `Account<>`)
- [ ] All `Signer<'info>` fields are actually required signers
- [ ] PDA seeds are deterministic and not user-controlled
- [ ] `require!` used instead of raw `if/panic` for custom errors
- [ ] No `unwrap()` / `expect()` in instruction handlers (use `?` or `require!`)
- [ ] Integer arithmetic uses `checked_add` / `checked_mul` or `u128` intermediates
- [ ] CPI calls use `new_with_signer` when a PDA signs
- [ ] No lamport-based ownership checks (use `Account<>` type wrappers)
- [ ] DAO execution: target account ownership is validated before transferring funds

---

## Option D — OtterSec / Halborn (paid, pre-mainnet)

For a full manual audit before mainnet launch:

- **OtterSec** — https://osec.io (competitive pricing, Solana-native team)
- **Halborn** — https://halborn.com (enterprise, slower)
- **Neodyme** — https://neodyme.io (specialist Solana team)

Budget estimate: $5,000–$20,000 depending on scope and turnaround.
Timeline: 2–4 weeks.

---

## Current risk surface

The HORMUZ program is relatively small (~500 LOC across lib.rs, staking.rs, dao.rs):

| Component | Risk notes |
|---|---|
| `initialize` / `create_vaults` | One-time setup, admin only |
| `stake` / `unstake` | Token CPI, time-lock math — check overflow |
| `claim_rewards` | Treasury drain — verify reward rate arithmetic |
| `create_proposal` / `vote` | Replay attack (VoteRecord PDA prevents double-vote) |
| `execute_proposal` | Funds transfer to arbitrary target — most critical, verify quorum logic |
| `rescue_ata_to_treasury` | One-off utility, funds only flow to treasury PDA |

**Highest priority manual review:** `execute_proposal` and `claim_rewards`.
