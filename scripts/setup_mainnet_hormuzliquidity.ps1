# One-time: point Solana CLI + npm scripts at your HORMUZLiquidity keypair.
# 1) Create wallets/hormuz-liquidity-mainnet.json via scripts/import_phantom_key.ts
# 2) Run this script from repo root:  .\scripts\setup_mainnet_hormuzliquidity.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$wallet = Join-Path $root "wallets\hormuz-liquidity-mainnet.json"
if (-not (Test-Path $wallet)) {
  Write-Host "Missing $wallet"
  Write-Host "Create it: set PHANTOM_SECRET_BASE58, then:"
  Write-Host "  npx ts-node scripts/import_phantom_key.ts wallets/hormuz-liquidity-mainnet.json"
  exit 1
}

$env:HOME = $env:USERPROFILE
$env:CLUSTER = "mainnet-beta"
$env:ANCHOR_PROVIDER_URL = "https://api.mainnet-beta.solana.com"
$env:ANCHOR_WALLET = $wallet

solana config set --url mainnet-beta
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
solana config set --keypair $wallet
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
solana address
solana balance
Write-Host ""
Write-Host "Expected HORMUZLiquidity: 8HCeDkTKeqFW8wtaoaoaMu8p4VtBrvrLh1drUoUPVnjj"
Write-Host "Next: set TOKEN_METADATA_URI in scripts/create_token.ts, then from repo root:"
Write-Host "  npm run create-token"
Write-Host ""
