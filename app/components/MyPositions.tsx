import { useEffect, useState, useCallback } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import idl from "../utils/idl.json";
import { PROGRAM_ID, HORMUZ_MINT } from "../utils/connection";
import {
  fetchUserPositions,
  fetchMarket,
  claimWinnings,
  refundBet,
  marketStatusLabel,
} from "../utils/hormuz";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Position = { publicKey: any; account: any; market: any };

export default function MyPositions() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState<number | null>(null);
  const [error, setError] = useState("");

  const getProgram = useCallback(() => {
    if (!anchorWallet) return null;
    const provider = new anchor.AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new anchor.Program(idl as anchor.Idl, provider) as any;
  }, [connection, anchorWallet]);

  const loadPositions = useCallback(async () => {
    if (!publicKey) { setLoading(false); return; }
    const program = getProgram();
    if (!program) { setLoading(false); return; }
    setLoading(true);
    try {
      const posResults = await fetchUserPositions(program, publicKey);
      const enriched = await Promise.all(
        posResults.map(async (p: { account: { marketId: number } } & Record<string, unknown>) => {
          const market = await fetchMarket(program, Number(p.account.marketId));
          return { ...p, market };
        })
      );
      setPositions(enriched.filter((p) => p.market !== null));
    } catch {
      setPositions([]);
    } finally {
      setLoading(false);
    }
  }, [publicKey, getProgram]);

  useEffect(() => { loadPositions(); }, [loadPositions]);

  async function handleClaim(pos: Position) {
    if (!publicKey) return;
    const program = getProgram();
    if (!program) return;
    const marketId = Number(pos.account.marketId);
    setTxLoading(marketId);
    setError("");
    try {
      const userAta = await getAssociatedTokenAddress(HORMUZ_MINT, publicKey);
      await claimWinnings(program, publicKey, userAta, marketId);
      await loadPositions();
    } catch (e) {
      setError(String(e).slice(0, 120));
    } finally {
      setTxLoading(null);
    }
  }

  async function handleRefund(pos: Position) {
    if (!publicKey) return;
    const program = getProgram();
    if (!program) return;
    const marketId = Number(pos.account.marketId);
    setTxLoading(marketId);
    setError("");
    try {
      const userAta = await getAssociatedTokenAddress(HORMUZ_MINT, publicKey);
      await refundBet(program, publicKey, userAta, marketId);
      await loadPositions();
    } catch (e) {
      setError(String(e).slice(0, 120));
    } finally {
      setTxLoading(null);
    }
  }

  if (!publicKey) {
    return (
      <div className="card">
        <p className="section-label mb-2">My Positions</p>
        <p className="text-xs text-white/25">Connect your wallet to see positions.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <p className="section-label">My positions</p>
        <button onClick={loadPositions} className="font-mono-data text-[9px] text-white/25 hover:text-white/50 transition-colors">
          refresh
        </button>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-white/5 rounded-md animate-pulse" />
          ))}
        </div>
      )}

      {!loading && positions.length === 0 && (
        <p className="text-xs text-white/25">No positions yet. Place a bet on an open market.</p>
      )}

      {!loading && positions.map((pos) => {
        const marketId = Number(pos.account.marketId);
        const market = pos.market;
        const status = marketStatusLabel(market?.status ?? {});
        const side = pos.account.side as boolean;
        const amount = Number(pos.account.amount) / 1e6;
        const claimed = pos.account.claimed as boolean;

        const canClaim =
          status === "Resolved" &&
          !claimed &&
          side === market?.outcome;

        const canRefund =
          status === "Cancelled" &&
          !claimed;

        return (
          <div
            key={String(pos.publicKey)}
            className="py-3 border-b border-white/[0.05] last:border-0"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-xs text-white/70 leading-snug flex-1 line-clamp-1">
                {market?.question ?? `Market #${marketId}`}
              </p>
              <span className="font-mono-data text-[10px] text-white/25 shrink-0">#{marketId}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`font-mono-data text-xs font-medium ${side ? "text-hormuz-teal" : "text-hormuz-red"}`}>
                  {side ? "YES" : "NO"}
                </span>
                <span className="font-mono-data text-xs text-white/40">
                  {amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} HRMZ
                </span>
                {claimed && (
                  <span className="badge bg-white/5 text-white/25 border border-white/10">claimed</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canClaim && (
                  <button
                    onClick={() => handleClaim(pos)}
                    disabled={txLoading === marketId}
                    className="btn-primary py-1.5 px-3 text-[10px]"
                  >
                    {txLoading === marketId ? "..." : "Claim"}
                  </button>
                )}
                {canRefund && (
                  <button
                    onClick={() => handleRefund(pos)}
                    disabled={txLoading === marketId}
                    className="btn-secondary py-1.5 px-3 text-[10px]"
                  >
                    {txLoading === marketId ? "..." : "Refund"}
                  </button>
                )}
                {!canClaim && !canRefund && !claimed && (
                  <span className={`font-mono-data text-[9px] ${status === "Resolved" ? "text-hormuz-red/60" : "text-white/20"}`}>
                    {status === "Resolved" ? "lost" : status.toLowerCase()}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {error && (
        <p className="mt-2 text-[10px] text-hormuz-red/80 font-mono-data break-all">{error}</p>
      )}
    </div>
  );
}
