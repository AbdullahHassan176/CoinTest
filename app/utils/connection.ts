import { Connection, clusterApiUrl, PublicKey } from "@solana/web3.js";

export const CLUSTER =
  (process.env.NEXT_PUBLIC_CLUSTER as "devnet" | "mainnet-beta") ?? "devnet";

export const RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl(CLUSTER);

export const connection = new Connection(RPC_ENDPOINT, "confirmed");

// Replace with real program ID after `anchor deploy`
export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ??
    "HRMZxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
);

// Replace with real mint address after `create_token.ts`
export const HORMUZ_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_HORMUZ_MINT ??
    "HRMZMINTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
);

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatHormuz(lamports: number | bigint, decimals = 6): string {
  const val = Number(lamports) / 10 ** decimals;
  return val.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function lockDurationLabel(secs: number): string {
  const days = secs / (24 * 60 * 60);
  if (days === 30) return "30 Days";
  if (days === 90) return "90 Days";
  if (days === 180) return "180 Days";
  return `${days} Days`;
}

export function apyForDuration(secs: number): string {
  const days = secs / (24 * 60 * 60);
  if (days === 30) return "10%";
  if (days === 90) return "20%";
  if (days === 180) return "40%";
  return "?%";
}
