/**
 * Resume STRAIT allocation + revoke mint authority after `create_token.ts` stopped
 * mid-way (common cause: not enough SOL after mint+metadata txs).
 *
 * Requires: mint exists on CLUSTER; deployer keypair still holds mint authority;
 * `getMint().supply` should be 0 (any non-zero → abort).
 *
 * Usage (same env as create_token):
 *   $env:STRAIT_MINT="8DjpqnUW66bAGGNbp2eCmDZx1WBo93UyevQb3gT9KxCF"
 *   $env:CLUSTER="mainnet-beta"
 *   $env:ANCHOR_PROVIDER_URL="https://api.mainnet-beta.solana.com"
 *   $env:ANCHOR_WALLET=".\wallets\hormuz-liquidity-mainnet.json"
 *   npx ts-node scripts/complete_strait_distribution.ts
 */

import {
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  Connection,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import fs from "fs";
import path from "path";

const CLUSTER = (process.env.CLUSTER ?? "devnet") as "devnet" | "mainnet-beta" | "testnet";
const RPC_URL = process.env.ANCHOR_PROVIDER_URL ?? clusterApiUrl(CLUSTER);

const TOTAL_SUPPLY = 100_000_000_000;
const DECIMALS = 6;
const TOTAL_SUPPLY_UNITS = BigInt(TOTAL_SUPPLY) * BigInt(10 ** DECIMALS);

const DEFAULT_PROGRAM_ID = "5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv";

const WALLET_PATH =
  process.env.ANCHOR_WALLET ??
  path.resolve(process.env.HOME ?? process.env.USERPROFILE ?? "", ".config/solana/id.json");

function loadKeypair(p: string): Keypair {
  const raw = fs.readFileSync(p, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function bps(totalUnits: bigint, basisPoints: number): bigint {
  return (totalUnits * BigInt(basisPoints)) / BigInt(10_000);
}

async function main() {
  const mintStr = process.env.STRAIT_MINT?.trim();
  if (!mintStr) {
    throw new Error("Set STRAIT_MINT to the mint address printed by create_token.ts");
  }

  const connection = new Connection(RPC_URL, "confirmed");
  const payer = loadKeypair(WALLET_PATH);
  const mint = new PublicKey(mintStr);

  console.log(`Deployer: ${payer.publicKey.toBase58()}`);
  console.log(`Cluster:  ${CLUSTER}`);
  console.log(`Mint:     ${mint.toBase58()}\n`);

  const bal = await connection.getBalance(payer.publicKey);
  console.log(`SOL: ${bal / LAMPORTS_PER_SOL} (recommend ≥ 0.05 for 5 ATAs + revoke)\n`);

  const mintInfo = await getMint(connection, mint, undefined, TOKEN_PROGRAM_ID);
  if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(payer.publicKey)) {
    throw new Error(
      "Mint authority is not your payer wallet — wrong keypair or authority already revoked."
    );
  }
  if (mintInfo.supply !== 0n) {
    throw new Error(
      `Mint supply is already ${mintInfo.supply} — partial mint; abort to avoid double-printing. Fix manually.`
    );
  }

  const programId = new PublicKey(process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID);
  const rewardsOverride = process.env.REWARDS_TREASURY_PUBKEY?.trim();
  const rewardsTreasury = rewardsOverride
    ? new PublicKey(rewardsOverride)
    : PublicKey.findProgramAddressSync([Buffer.from("rewards-treasury")], programId)[0];

  const wallets = {
    liquidity:      new PublicKey("8HCeDkTKeqFW8wtaoaoaMu8p4VtBrvrLh1drUoUPVnjj"),
    stakingRewards: rewardsTreasury,
    marketing:      new PublicKey("5moL2DRU9pvfXsVGnmm6wPPkFWYvo6iYy6aAEesJxeNu"),
    team:           new PublicKey("D2BsaNzFyPPewvmdrJzxNbmp3NPSoBUkvZ1PP3zmsN5a"),
    airdrop:        new PublicKey("4UUPreJ17MdsYHM5CqKxMoPboLXTzHWjMtGmjkRHUrtY"),
  };

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
      true,
      "confirmed",
      undefined,
      TOKEN_PROGRAM_ID
    );
    await mintTo(connection, payer, mint, ata.address, payer, amount, [], undefined, TOKEN_PROGRAM_ID);
    console.log(
      `Minted ${alloc.bps / 100}% (${(Number(amount) / 10 ** DECIMALS).toLocaleString()} STRAIT) → ${alloc.name}`
    );
  }

  console.log("\nRevoking mint authority...");
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
  console.log("Done. Mint authority revoked.\n");

  const output = {
    mint: mint.toBase58(),
    programId: programId.toBase58(),
    cluster: CLUSTER,
    wallets: Object.fromEntries(Object.entries(wallets).map(([k, v]) => [k, v.toBase58()])),
    completedVia: "complete_strait_distribution.ts",
  };
  fs.writeFileSync("scripts/.addresses.json", JSON.stringify(output, null, 2));
  console.log("Saved scripts/.addresses.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
