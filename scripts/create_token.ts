/**
 * create_token.ts
 *
 * Mints the HORMUZ SPL token with Metaplex on-chain metadata, then
 * distributes the initial supply according to the tokenomics table:
 *
 *   40% — Liquidity pool wallet  (LP locked e.g. Raydium)
 *   20% — Staking rewards treasury PDA
 *   20% — Marketing wallet
 *   15% — Team wallet             (Streamflow vesting)
 *    5% — Airdrop wallet
 *
 * Token symbol STRAIT (not HORMUZ) to avoid confusion with other Solana
 * "Hormuz" tickers. Full name: Strait of Hormuz. Brand: Strait of Hormuz + $STRAIT.
 *
 * After minting the mint authority is revoked so no new tokens can ever
 * be created, making the supply provably fixed at 100 billion.
 *
 * Usage (devnet):
 *   ANCHOR_WALLET=~/.config/solana/id.json \
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
 *   ts-node scripts/create_token.ts
 *
 * Mainnet (see docs/mainnet_wallet_setup.md):
 *   CLUSTER=mainnet-beta ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com \
 *   ANCHOR_WALLET=./wallets/hormuz-liquidity-mainnet.json \
 *   ts-node scripts/create_token.ts
 */

import * as anchor from "@coral-xyz/anchor";
import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  Connection,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createV1,
  TokenStandard,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  publicKey as umiPublicKey,
  generateSigner,
  percentAmount,
  signerIdentity,
  createSignerFromKeypair,
} from "@metaplex-foundation/umi";
import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const CLUSTER = (process.env.CLUSTER as anchor.web3.Cluster) ?? "devnet";
const RPC_URL = process.env.ANCHOR_PROVIDER_URL ?? clusterApiUrl(CLUSTER);

const TOTAL_SUPPLY = 100_000_000_000; // 100 billion
const DECIMALS = 6; // 6 decimals keeps total units (10^17) within u64 max (1.8×10^19)
const TOTAL_SUPPLY_UNITS = BigInt(TOTAL_SUPPLY) * BigInt(10 ** DECIMALS);

const TOKEN_NAME = "Strait of Hormuz";
const TOKEN_SYMBOL = "STRAIT";
/** Hosted JSON on the live hub (`app/public/strait-token-metadata.json`). Override with env for Arweave/IPFS. */
const TOKEN_METADATA_URI =
  process.env.TOKEN_METADATA_URI?.trim() ||
  "https://stateofhormuz.org/strait-token-metadata.json";

// Wallets for each allocation (replace with real keypairs on mainnet)
const WALLET_PATH =
  process.env.ANCHOR_WALLET ??
  path.resolve(process.env.HOME ?? process.env.USERPROFILE ?? "", ".config/solana/id.json");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadKeypair(p: string): Keypair {
  const raw = fs.readFileSync(p, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function bps(totalUnits: bigint, basisPoints: number): bigint {
  return (totalUnits * BigInt(basisPoints)) / BigInt(10_000);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(WALLET_PATH);

  console.log(`\nDeployer: ${payer.publicKey.toBase58()}`);
  console.log(`Cluster:  ${CLUSTER}`);

  // Check balance
  const balance = await connection.getBalance(payer.publicKey);
  const solBal = balance / LAMPORTS_PER_SOL;
  console.log(`Balance:  ${solBal} SOL\n`);

  const minDevnetSol = Number(process.env.MIN_DEVNET_SOL ?? "0.1");
  const minMainSol = Number(process.env.MIN_MAINNET_SOL ?? "0.012");
  const minLamports =
    CLUSTER === "mainnet-beta"
      ? Math.floor(minMainSol * LAMPORTS_PER_SOL)
      : Math.floor(minDevnetSol * LAMPORTS_PER_SOL);

  if (CLUSTER === "mainnet-beta" && solBal < 0.05) {
    console.warn(
      "\n⚠️  Below ~0.05 SOL on mainnet is risky: mint + metadata + 5 ATAs often needs more.\n" +
        "   See docs/mainnet_wallet_setup.md — add SOL before/after if transactions fail.\n"
    );
  }
  if (balance < minLamports) {
    const hint =
      CLUSTER === "mainnet-beta"
        ? `Need ≥ ${minMainSol} SOL on mainnet (override with MIN_MAINNET_SOL). Top up the payer wallet.`
        : `Insufficient SOL on devnet (need ≥ ${minDevnetSol}). Run: solana airdrop 2 --url devnet`;
    throw new Error(`Insufficient SOL balance. ${hint}`);
  }

  // ── 1. Create mint + metadata via Metaplex UMI (single unified call) ────────
  console.log("Creating HORMUZ mint + metadata via Metaplex...");
  const umi = createUmi(RPC_URL);
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(payer.secretKey);
  umi.use(signerIdentity(createSignerFromKeypair(umi, umiKeypair)));

  const mintSigner = generateSigner(umi);

  await createV1(umi, {
    mint: mintSigner,
    authority: umi.identity,
    name: TOKEN_NAME,
    symbol: TOKEN_SYMBOL,
    uri: TOKEN_METADATA_URI,
    sellerFeeBasisPoints: percentAmount(0), // no royalties
    tokenStandard: TokenStandard.Fungible,
    decimals: DECIMALS,
  }).sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });

  const mint = new PublicKey(mintSigner.publicKey.toString());
  console.log(`Mint address: ${mint.toBase58()}`);
  console.log("Metadata attached.\n");

  // ── 3. Program id + rewards destination ───────────────────────────────────
  // Devnet program (repo default). Override PROGRAM_ID for another deployment.
  const DEFAULT_PROGRAM_ID = "5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv";
  const programId = new PublicKey(process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID);

  // Option B (mainnet SPL before Anchor): send staking bucket to a normal wallet until the
  // program is live on mainnet — set REWARDS_TREASURY_PUBKEY; otherwise use on-chain PDA.
  const rewardsOverride = process.env.REWARDS_TREASURY_PUBKEY?.trim();
  const rewardsTreasury = rewardsOverride
    ? new PublicKey(rewardsOverride)
    : PublicKey.findProgramAddressSync([Buffer.from("rewards-treasury")], programId)[0];
  // ── 4. Create or derive destination token accounts ─────────────────────────
  const wallets = {
    liquidity:      new PublicKey("8HCeDkTKeqFW8wtaoaoaMu8p4VtBrvrLh1drUoUPVnjj"),
    stakingRewards: rewardsTreasury,
    marketing:      new PublicKey("5moL2DRU9pvfXsVGnmm6wPPkFWYvo6iYy6aAEesJxeNu"),
    team:           new PublicKey("D2BsaNzFyPPewvmdrJzxNbmp3NPSoBUkvZ1PP3zmsN5a"),
    airdrop:        new PublicKey("4UUPreJ17MdsYHM5CqKxMoPboLXTzHWjMtGmjkRHUrtY"),
  };

  console.log("Wallet addresses:");
  for (const [name, pk] of Object.entries(wallets)) {
    console.log(`  ${name.padEnd(14)}: ${pk.toBase58()}`);
  }
  if (rewardsOverride) {
    console.log(`  (staking rewards → REWARDS_TREASURY_PUBKEY wallet until mainnet program)`);
  }
  console.log();

  // ── 5. Create associated token accounts & mint allocations ─────────────────
  const allocations: Array<{ name: string; wallet: PublicKey; bps: number }> = [
    { name: "Liquidity Pool", wallet: wallets.liquidity, bps: 4_000 },
    { name: "Staking Rewards", wallet: wallets.stakingRewards, bps: 2_000 },
    { name: "Marketing", wallet: wallets.marketing, bps: 2_000 },
    { name: "Team (vest 12m)", wallet: wallets.team, bps: 1_500 },
    { name: "Airdrop", wallet: wallets.airdrop, bps: 500 },
  ];

  for (const alloc of allocations) {
    const amount = bps(TOTAL_SUPPLY_UNITS, alloc.bps);
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      alloc.wallet,
      true, // allowOwnerOffCurve — needed for PDAs
      "confirmed",
      undefined,
      TOKEN_PROGRAM_ID
    );
    await mintTo(connection, payer, mint, ata.address, payer, amount, [], undefined, TOKEN_PROGRAM_ID);
    console.log(
      `Minted ${alloc.bps / 100}% (${(Number(amount) / 10 ** DECIMALS).toLocaleString()} HORMUZ) → ${alloc.name}`
    );
  }

  // ── 6. Revoke mint authority (fixed supply proof) ──────────────────────────
  console.log("\nRevoking mint authority (supply is now fixed)...");
  await setAuthority(
    connection,
    payer,
    mint,
    payer,
    AuthorityType.MintTokens,
    null,
    [],
    undefined,
    TOKEN_PROGRAM_ID
  );
  console.log("Mint authority revoked. No new HORMUZ can ever be created.\n");

  // ── 7. Print summary ───────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════════════");
  console.log(" HORMUZ Token Created Successfully");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Mint:        ${mint.toBase58()}`);
  console.log(`  Supply:      ${TOTAL_SUPPLY.toLocaleString()} HORMUZ`);
  console.log(`  Decimals:    ${DECIMALS}`);
  console.log(`  Cluster:     ${CLUSTER}`);
  console.log("═══════════════════════════════════════════════════\n");
  console.log("Next steps:");
  console.log("  1. Update Anchor.toml [programs.devnet] with program ID");
  console.log("  2. Run: anchor deploy");
  console.log("  3. Run: anchor run initialize (in tests or a script)");
  console.log("  4. Lock liquidity + team tokens via Streamflow");
  console.log("  5. Add Raydium liquidity pool (seed_liquidity.ts)\n");

  // Save addresses for subsequent scripts
  const output = {
    mint: mint.toBase58(),
    programId: programId.toBase58(),
    cluster: CLUSTER,
    wallets: Object.fromEntries(
      Object.entries(wallets).map(([k, v]) => [k, v.toBase58()])
    ),
  };
  fs.writeFileSync("scripts/.addresses.json", JSON.stringify(output, null, 2));
  console.log("Addresses saved to scripts/.addresses.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
