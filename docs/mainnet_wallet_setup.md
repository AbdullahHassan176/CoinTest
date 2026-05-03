# Mainnet wallet setup (HORMUZLiquidity → CLI keypair)

You control Phantom; the repo cannot export your key. Do this **once** on your PC.

## 1. Export Phantom private key (same account as **HORMUZLiquidity**)

1. Phantom → **Settings** → **Security & Privacy** → **Export Private Key** for the account that shows address  
   `8HCeDkTKeqFW8wtaoaoaMu8p4VtBrvrLh1drUoUPVnjj`.
2. Copy the **base58** string. **Do not** paste it into Discord, GitHub, or chat.

## 2. Write CLI keypair JSON (gitignored)

From **repo root** (`CoinTest`):

```powershell
cd D:\Experimentation\CoinTest
$env:PHANTOM_SECRET_BASE58="paste_here_then_delete_this_line_from_history"
npx ts-node scripts/import_phantom_key.ts wallets/hormuz-liquidity-mainnet.json
```

Check the printed **Public key** matches `8HCeDkTKeqFW8wtaoaoaMu8p4VtBrvrLh1drUoUPVnjj`.

Clear the env var after:

```powershell
Remove-Item Env:PHANTOM_SECRET_BASE58 -ErrorAction SilentlyContinue
```

## 3. Aim Solana CLI + scripts at that file

Still from repo root:

```powershell
.\scripts\setup_mainnet_hormuzliquidity.ps1
```

You should see `solana address` = `8HCeD…` and `solana balance` ≈ your Phantom balance.

## 4. Metadata URI before mint

**Default (recommended):** `scripts/create_token.ts` uses **`https://stateofhormuz.org/strait-token-metadata.json`**, which is served from `app/public/strait-token-metadata.json` — **deploy the site** so that URL returns 200 before or immediately after mint (explorers fetch it).

**Override:** permanent Arweave/IPFS JSON:

```powershell
$env:TOKEN_METADATA_URI = "https://arweave.net/<your_transaction_id>"
```

## 5. Mainnet mint command

In the **same PowerShell window** (so `CLUSTER` / `ANCHOR_*` are set), or set them again:

```powershell
$env:HOME = $env:USERPROFILE
$env:CLUSTER = "mainnet-beta"
$env:ANCHOR_PROVIDER_URL = "https://api.mainnet-beta.solana.com"
$env:ANCHOR_WALLET = "$(Resolve-Path .\wallets\hormuz-liquidity-mainnet.json)"
# Optional Option B: staking bucket to a normal wallet until Anchor on mainnet:
# $env:REWARDS_TREASURY_PUBKEY = "<solana_pubkey_you_control>"
npm run create-token
```

### Mint stopped mid-way (`TokenAccountNotFoundError` after mint printed)

Usually **not enough SOL left** after mint + metadata — creating the first recipient **ATA** fails.

1. **Do not** loud-launch until fixed. Keep the **mint address** from the log.
2. **Top up** the same payer wallet — aim **≥ ~0.05 SOL** for five ATAs + revoke + buffer.
3. Finish allocation + revoke:

```powershell
$env:HOME = $env:USERPROFILE
$env:CLUSTER = "mainnet-beta"
$env:ANCHOR_PROVIDER_URL = "https://api.mainnet-beta.solana.com"
$env:ANCHOR_WALLET = "$(Resolve-Path .\wallets\hormuz-liquidity-mainnet.json)"
$env:STRAIT_MINT = "<paste_mint_from_create_token_log>"
npm run complete-distribution
```

Uses `scripts/complete_strait_distribution.ts` (supply must still be **0**).

Override minimum SOL check only if you know what you’re doing: `$env:MIN_MAINNET_SOL = "0.01"`.

## Budget (~0.018 SOL)

- `create_token.ts` allows **≥ ~0.012 SOL** by default (`MIN_MAINNET_SOL`) so you can **try** a shoestring mainnet run.
- Real costs: mint + metadata + several ATAs often land closer to **~0.03–0.08+ SOL**. If a step fails with insufficient lamports, **top up** the same wallet (Phantom → already funded address) and rerun.

**Staged approach:** mint first when balance allows; add **micro LP** after another small SOL top-up (playbook: pool + test swap before loud announcement).

## Security

- `wallets/*.json` is **gitignored** — never commit keypairs.
- Prefer deleting `wallets/hormuz-liquidity-mainnet.json` after launch and keeping only Phantom if you no longer need CLI signing.
