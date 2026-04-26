import { Connection, clusterApiUrl, PublicKey } from "@solana/web3.js";

export const CLUSTER =
  (process.env.NEXT_PUBLIC_CLUSTER as "devnet" | "mainnet-beta") ?? "devnet";

/** Trimmed RPC URL, or public cluster default (empty env string is treated as missing). */
function resolveRpcEndpoint(): string {
  const raw = process.env.NEXT_PUBLIC_RPC_URL?.trim();
  if (raw) return raw;
  return clusterApiUrl(CLUSTER);
}

export const RPC_ENDPOINT = resolveRpcEndpoint();

// Devnet deployment from repo — used only if env is missing or invalid.
const FALLBACK_PROGRAM = "5CAXvUAoxwZZ3vxEiHa49EvghxEKdfg8MajKfk9EXahv";
const FALLBACK_MINT = "D6i3vdtzYWuTxEVBobSYegqHane3u6kzvBYXDTHxvLN2";

function safePublicKey(envName: string, value: string | undefined, fallback: string): PublicKey {
  const trimmed = (value ?? "").trim().replace(/^["']|["']$/g, "");
  const candidate = trimmed || fallback;
  try {
    return new PublicKey(candidate);
  } catch {
    if (typeof console !== "undefined") {
      console.error(
        `[STRAIT] Invalid ${envName} (not valid base58 public key). Using built-in devnet fallback. Check Vercel env for stray quotes or spaces.`
      );
    }
    return new PublicKey(fallback);
  }
}

export const PROGRAM_ID = safePublicKey(
  "NEXT_PUBLIC_PROGRAM_ID",
  process.env.NEXT_PUBLIC_PROGRAM_ID,
  FALLBACK_PROGRAM
);
export const HORMUZ_MINT = safePublicKey(
  "NEXT_PUBLIC_HORMUZ_MINT",
  process.env.NEXT_PUBLIC_HORMUZ_MINT,
  FALLBACK_MINT
);

/** Ticker for UI copy; mainnet mint metadata should use the same symbol (e.g. STRAIT). */
export const TOKEN_SYMBOL =
  (process.env.NEXT_PUBLIC_TOKEN_SYMBOL ?? "STRAIT").toUpperCase();

export const connection = new Connection(RPC_ENDPOINT, "confirmed");

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
