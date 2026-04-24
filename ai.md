# HORMUZ Coin — AI Project Guide

## Overview
HORMUZ is a Solana-based meme/utility token themed around the Strait of Hormuz.
It combines a deflationary SPL token with on-chain staking and DAO governance,
built using the Anchor framework (Rust) and a Next.js frontend.

**Tagline:** "Control the strait. Hold the coin."

## Key Technologies
- **Blockchain:** Solana (Devnet → Mainnet)
- **Smart contracts:** Anchor v0.30.1 (Rust)
- **Token standard:** SPL Token (Metaplex metadata)
- **Frontend:** Next.js 14 + Tailwind CSS + `@solana/wallet-adapter-react`
- **DEX:** Raydium CPMM (liquidity pool)
- **Vesting:** Streamflow (lock LP + team tokens)

## Directory Structure
```
CoinTest/
├── programs/hormuz/src/
│   ├── lib.rs          # Anchor program entry, declare_id!, Initialize context
│   ├── state.rs        # ProgramState account (global state PDA)
│   ├── staking.rs      # Stake/Unstake instructions + StakeRecord account
│   ├── dao.rs          # Proposal/Vote/Execute + Proposal+VoteRecord accounts
│   └── errors.rs       # HormuzError enum
├── app/                # Next.js frontend (see app/README below)
├── scripts/
│   ├── create_token.ts     # Mint HORMUZ, attach metadata, distribute supply
│   ├── seed_liquidity.ts   # Raydium pool creation guide
│   └── deploy_devnet.md    # Full step-by-step deployment guide
├── tests/hormuz.ts         # Anchor integration tests (Mocha/Chai)
├── Anchor.toml
├── Cargo.toml
└── package.json
```

## Current Deployment State (Devnet)
- **Program ID:** `5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv` (upgrade authority: `cNfZjajJyuVCrMYd6QBEcJ61kAKvme6HpUjPtsLXSrH`)
- **Mint:** `D6i3vdtzYWuTxEVBobSYegqHane3u6kzvBYXDTHxvLN2` (6 decimals, mint authority burned)
- **Frontend:** https://stateofhormuz.org (Vercel, coin-test-one.vercel.app)
- **Rewards treasury:** `AYEYmdrhefumR7wozcz6kEsXxKykzGDick1rdGSmKHgS` — 21B HORMUZ (funded via `rescue_ata_to_treasury`)
- **Raydium CPMM pool:** `A6h82ySkHntYn65RK3VknTDzbGXKQcZHpFReyU4E8W9H` — 40B HORMUZ + 1 SOL · LP Mint: `6jWTAQesxHU1DrS9yeHXsdmN5uD5SD1Bk6LJu81MJdxY`
- **LP locked:** all 6324 LP tokens locked via Raydium lock program · NFT: `4ZhyMnAF92QFmLVAxp1iJHZ22E44cceew5nPoJMH4FTS` · lock record at `scripts/.lp_lock.json`
- **Team vesting:** 15B HORMUZ locked via Streamflow — 90-day cliff, 270-day linear · [proof](https://app.streamflow.finance/devnet/vesting/5Cn6xgN1r9kDA52udrjvGkAPGu4JF77MxJpwK5hz9Dqw)
- **Bot:** `bot/main.py` — Telegram (@StateOfHormuzBot → @StateOfHormuz), Bluesky, Mastodon (account suspended — needs new token), Discord (disabled — no webhooks yet)
- **Build note:** use `anchor build` (without `--no-idl`); IDL step fails but `.so` builds fine. IDL is maintained manually at `app/utils/idl.json`.

## Tokenomics
- **Total Supply:** 100,000,000,000 (100 billion, **6 decimals**) — fixed, mint authority burned
- **Distribution:** 40% Liquidity · 20% Staking Rewards · 20% Marketing · 15% Team (vested) · 5% Airdrop

## Core Features
1. **1% Burn** — on every stake interaction (protocol-level, not transfer hook)
2. **Staking** — 30/90/180-day locks at 10/20/40% APY; rewards from treasury
3. **DAO** — stakers create proposals, vote (1 HORMUZ staked = 1 vote), 7-day voting
4. **DAO execution** — passed proposals release treasury funds to a target wallet

## PDAs (seeds)
| PDA | Seeds |
|---|---|
| `program-state` | `[b"program-state"]` |
| `staking-vault` | `[b"staking-vault"]` |
| `rewards-treasury` | `[b"rewards-treasury"]` |
| `dao-treasury` | `[b"dao-treasury"]` |
| `stake-record` | `[b"stake-record", owner.key()]` |
| `proposal` | `[b"proposal", proposal_id.to_le_bytes()]` |
| `vote-record` | `[b"vote-record", voter.key(), proposal_id.to_le_bytes()]` |

## Frontend Config (`app/.env.local`)
```
NEXT_PUBLIC_CLUSTER=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=<deployed program ID>
NEXT_PUBLIC_HORMUZ_MINT=<mint address from create_token.ts>
```

## Development Workflow (Windows)

### Build Command (required env vars every session)
```powershell
$env:PATH += ";$env:USERPROFILE\.cargo\bin;$env:USERPROFILE\.avm\bin;$env:USERPROFILE\.local\share\solana\install\active_release\bin"
$env:HOME = $env:USERPROFILE
$env:CARGO_TARGET_DIR = "C:\tmp\ct"   # avoid \\?\ extended-path issues
anchor build --no-idl                  # IDL skipped; proc_macro2 source_file() broken on stable
```

### Other Steps
2. `npm run create-token` — mint HORMUZ on devnet
3. `anchor test --provider.cluster devnet` — run integration tests
4. `cd app && npm run dev` — run frontend at localhost:3000

## Windows Build Notes (see docs/windows-build.md)
- Platform-tools symlink requires **Windows Developer Mode** enabled.
- `CARGO_TARGET_DIR=C:\tmp\ct` prevents `\\?\`-prefix path corruption in build scripts.
- Cargo.lock must stay at version 3; regenerate with `cargo +solana generate-lockfile`.
- Several dependency pins in Cargo.lock prevent edition2024/MSRV mismatches (blake3, borsh, indexmap, proc-macro-crate, rayon, web-sys, unicode-segmentation, proc-macro2).
- IDL generation (`anchor build` without `--no-idl`) fails due to `proc_macro2::Span::source_file()` removal in proc_macro2 ≥ 1.0.83. Use `--no-idl` and create IDL manually.
- `programs/*` glob in Cargo.toml replaced with explicit `programs/hormuz` (glob breaks under \\?\ paths).
- `initialize` was split into `initialize` + `create_vaults` to avoid 4096-byte SBF stack limit.

## Important Notes
- Update `declare_id!` in `lib.rs` and `Anchor.toml` after getting the program ID.
- See `scripts/deploy_devnet.md` for full deployment checklist.
- Legal: No promises of returns in any marketing. Clear disclaimers on site.
- See `docs/risks.md` for full risk mitigation details.
- See `docs/audit.md` for pre-mainnet audit checklist (Sec3 X-ray, cargo-audit, manual Anchor checklist).
- Bluesky: session cached at `bot/.bluesky_session` — delete file to force re-login.
- Mastodon: account at mastodon.social was suspended (403). Create a new account/token and update `MASTODON_ACCESS_TOKEN` in `bot/.env`.
- To redeploy after Rust changes: `anchor build` → `solana program write-buffer` → `solana program deploy --buffer`. See deploy history for commands.
- `rescue_ata_to_treasury` instruction added in lib.rs to move misplaced ATA funds; already executed on devnet.
