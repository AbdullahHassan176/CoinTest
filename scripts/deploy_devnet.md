# HORMUZ Devnet Deployment Guide

## Prerequisites

Install the toolchain (Windows users: use WSL2 or Git Bash for best results)

```bash
# 1. Install Rust
curl --proto '=https' --tlsv1.2 -sSf --ssl-no-revoke https://sh.rustup.rs | sh
source $HOME/.cargo/env

# 2. Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# 3. Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install latest
avm use latest

# 4. Install Node deps (root — for scripts and tests)
npm install

# 5. Install frontend deps
cd app && npm install && cd ..
```

## Step 1 — Configure Solana CLI for Devnet

```bash
solana config set --url devnet
solana-keygen new --outfile ~/.config/solana/id.json   # skip if you have one
solana airdrop 2     # get free devnet SOL (may need multiple times)
solana balance       # confirm balance
```

## Step 2 — Build the Anchor Program

```bash
anchor build
```

This compiles the Rust programs and generates:
- `target/deploy/hormuz.so` — the compiled program
- `target/idl/hormuz.json` — the IDL (used by frontend + tests)
- `target/types/hormuz.ts` — TypeScript types

## Step 3 — Get the Program ID

```bash
solana address -k target/deploy/hormuz-keypair.json
```

Copy this address and update TWO places:
1. `programs/hormuz/src/lib.rs` → `declare_id!("YOUR_PROGRAM_ID")`
2. `Anchor.toml` → `[programs.devnet] hormuz = "YOUR_PROGRAM_ID"`

Then rebuild:
```bash
anchor build
```

## Step 4 — Deploy the Program

```bash
anchor deploy --provider.cluster devnet
```

## Step 5 — Create the HORMUZ Token

```bash
# Set env vars
export ANCHOR_WALLET=~/.config/solana/id.json
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export PROGRAM_ID=YOUR_PROGRAM_ID_HERE

# Run the token creation script
npm run create-token
```

This will:
- Create the HORMUZ SPL mint
- Attach Metaplex metadata
- Distribute 100B tokens across all allocation wallets
- Revoke mint authority (fixed supply)
- Save addresses to `scripts/.addresses.json`

## Step 6 — Update Frontend Config

Copy the mint address from `scripts/.addresses.json` and create `app/.env.local`:

```
NEXT_PUBLIC_CLUSTER=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PROGRAM_ID=YOUR_PROGRAM_ID_HERE
NEXT_PUBLIC_HORMUZ_MINT=YOUR_MINT_ADDRESS_HERE
```

## Step 7 — Initialize the Program

Create `scripts/initialize.ts` and call the `initialize` instruction with the Anchor client,
passing the HORMUZ mint address and the program state PDA. This sets up:
- Program state PDA
- Staking vault token account
- Rewards treasury token account
- DAO treasury token account

## Step 8 — Run the Tests

```bash
anchor test --provider.cluster devnet
```

## Step 9 — Start the Frontend

```bash
cd app
npm run dev
```

Open http://localhost:3000 — connect Phantom (set to Devnet in settings).

## Step 10 — Seed Raydium Liquidity

```bash
npm run seed-liquidity
```

Follow the instructions printed to the console to create the Raydium CPMM pool.

## Step 11 — Lock Tokens

1. Go to https://app.streamflow.finance
2. Lock the Liquidity Pool tokens for 1 year
3. Lock the Team tokens for 12 months with 3-month cliff
4. Share the Streamflow lock URLs publicly as proof

## Mainnet Checklist

Before deploying to mainnet:
- [ ] Smart contract audit (Neodyme, OtterSec, or similar)
- [ ] Legal review (crypto lawyer in your jurisdiction)
- [ ] Community of at least 1,000 members before launch
- [ ] Liquidity ready ($5,000+ USD minimum)
- [ ] Logo uploaded to Arweave (permanent storage)
- [ ] Website + whitepaper live
- [ ] Social media active (Twitter/X, Telegram)
- [ ] All disclaimers in place
