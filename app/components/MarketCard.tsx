import { useState, useCallback } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import idl from "../utils/idl.json";
import { PROGRAM_ID, HORMUZ_MINT } from "../utils/connection";
import {
  placeBet,
  claimWinnings,
  refundBet,
  fetchMarketPosition,
  marketStatusLabel,
  yesOdds,
  noOdds,
} from "../utils/hormuz";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Market = { publicKey: any; account: any };

function timeUntil(unixSecs: number): string {
  const diff = unixSecs * 1000 - Date.now();
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86400000);
  const hrs  = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hrs}h left`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hrs}h ${mins}m left`;
}

const STATUS_CONFIG = {
  Active:    { color: "text-hormuz-teal",  dot: "bg-hormuz-teal",  border: "border-hormuz-teal/20"  },
  Resolved:  { color: "text-green-400",    dot: "bg-green-400",    border: "border-green-500/20"    },
  Cancelled: { color: "text-white/30",     dot: "bg-white/20",     border: "border-white/10"        },
};

export default function MarketCard({ market, onRefresh }: { market: Market; onRefresh: () => void }) {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { publicKey } = useWallet();

  const [amount, setAmount] = useState("");
  const [side, setSide] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userPosition, setUserPosition] = useState<null | { side: boolean; amount: number; claimed: boolean }>(null);
  const [positionLoaded, setPositionLoaded] = useState(false);

  const acc = market.account;
  const marketId = Number(acc.marketId);
  const status = marketStatusLabel(acc.status);
  const statusCfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.Cancelled;

  const yesPct = yesOdds(Number(acc.yesPool), Number(acc.noPool));
  const noPct  = noOdds(Number(acc.yesPool), Number(acc.noPool));
  const totalPool = (Number(acc.yesPool) + Number(acc.noPool)) / 1e6;

  const getProgram = useCallback(() => {
    if (!anchorWallet) return null;
    const provider = new anchor.AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new anchor.Program(idl as anchor.Idl, provider) as any;
  }, [connection, anchorWallet]);

  const loadUserPosition = useCallback(async () => {
    if (!publicKey) return;
    const program = getProgram();
    if (!program) return;
    const pos = await fetchMarketPosition(program, publicKey, marketId);
    if (pos) {
      setUserPosition({
        side: pos.side,
        amount: Number(pos.amount) / 1e6,
        claimed: pos.claimed,
      });
    }
    setPositionLoaded(true);
  }, [publicKey, getProgram, marketId]);

  // Load on mount
  useState(() => { loadUserPosition(); });

  async function handleBet() {
    if (side === null || !amount || !publicKey) return;
    const program = getProgram();
    if (!program) return;
    setLoading(true);
    setError("");
    try {
      const userAta = await getAssociatedTokenAddress(HORMUZ_MINT, publicKey);
      await placeBet(program, publicKey, userAta, marketId, side, Number(amount));
      await loadUserPosition();
      setAmount("");
      setSide(null);
      onRefresh();
    } catch (e) {
      setError(String(e).slice(0, 120));
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim() {
    if (!publicKey) return;
    const program = getProgram();
    if (!program) return;
    setLoading(true);
    setError("");
    try {
      const userAta = await getAssociatedTokenAddress(HORMUZ_MINT, publicKey);
      await claimWinnings(program, publicKey, userAta, marketId);
      await loadUserPosition();
      onRefresh();
    } catch (e) {
      setError(String(e).slice(0, 120));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefund() {
    if (!publicKey) return;
    const program = getProgram();
    if (!program) return;
    setLoading(true);
    setError("");
    try {
      const userAta = await getAssociatedTokenAddress(HORMUZ_MINT, publicKey);
      await refundBet(program, publicKey, userAta, marketId);
      await loadUserPosition();
      onRefresh();
    } catch (e) {
      setError(String(e).slice(0, 120));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`card border ${statusCfg.border}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusCfg.dot} ${status === "Active" ? "animate-pulse" : ""}`} />
            <span className={`font-mono-data text-[10px] uppercase tracking-wider ${statusCfg.color}`}>{status}</span>
            <span className="font-mono-data text-[10px] text-white/20">#{marketId}</span>
          </div>
          <p className="text-sm text-white/90 leading-snug font-medium">{acc.question}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono-data text-[10px] text-white/25">{timeUntil(Number(acc.resolutionEnd))}</div>
          <div className="font-mono-data text-[10px] text-white/20 mt-0.5">
            {totalPool.toLocaleString(undefined, { maximumFractionDigits: 0 })} HRMZ pool
          </div>
        </div>
      </div>

      {/* YES/NO probability bar */}
      <div className="mb-4">
        <div className="flex h-5 rounded-sm overflow-hidden text-[10px] font-mono-data font-medium">
          <div
            className="flex items-center justify-center bg-hormuz-teal/20 text-hormuz-teal transition-all duration-700"
            style={{ width: `${yesPct}%`, minWidth: yesPct > 0 ? "2rem" : 0 }}
          >
            {yesPct > 10 ? `YES ${yesPct}%` : ""}
          </div>
          <div
            className="flex items-center justify-center bg-hormuz-red/20 text-hormuz-red transition-all duration-700"
            style={{ width: `${noPct}%`, minWidth: noPct > 0 ? "2rem" : 0 }}
          >
            {noPct > 10 ? `NO ${noPct}%` : ""}
          </div>
        </div>
        <div className="flex justify-between mt-1">
          <span className="font-mono-data text-[9px] text-white/25">
            {(Number(acc.yesPool) / 1e6).toLocaleString()} HRMZ YES
          </span>
          <span className="font-mono-data text-[9px] text-white/25">
            {(Number(acc.noPool) / 1e6).toLocaleString()} HRMZ NO
          </span>
        </div>
      </div>

      {/* Outcome display (if resolved) */}
      {status === "Resolved" && (
        <div className={`mb-4 px-3 py-2 rounded-md text-xs font-semibold ${acc.outcome ? "bg-hormuz-teal/10 text-hormuz-teal border border-hormuz-teal/20" : "bg-hormuz-red/10 text-hormuz-red border border-hormuz-red/20"}`}>
          Outcome: {acc.outcome ? "YES" : "NO"}
        </div>
      )}

      {/* User position */}
      {positionLoaded && userPosition && (
        <div className="mb-3 px-3 py-2 rounded-md bg-white/[0.03] border border-white/[0.06]">
          <div className="flex justify-between items-center">
            <span className="section-label">Your position</span>
            <span className={`font-mono-data text-xs font-medium ${userPosition.side ? "text-hormuz-teal" : "text-hormuz-red"}`}>
              {userPosition.side ? "YES" : "NO"} · {userPosition.amount.toLocaleString()} HRMZ
            </span>
          </div>
        </div>
      )}

      {/* Action area */}
      {!publicKey ? (
        <p className="text-[11px] text-white/25 text-center py-2">Connect wallet to participate</p>
      ) : status === "Active" && !userPosition ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setSide(true)}
              className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-all ${
                side === true
                  ? "bg-hormuz-teal/20 border-hormuz-teal/50 text-hormuz-teal"
                  : "border-white/10 text-white/40 hover:border-hormuz-teal/30 hover:text-hormuz-teal/70"
              }`}
            >
              YES
            </button>
            <button
              onClick={() => setSide(false)}
              className={`flex-1 py-2 text-xs font-semibold rounded-md border transition-all ${
                side === false
                  ? "bg-hormuz-red/20 border-hormuz-red/50 text-hormuz-red"
                  : "border-white/10 text-white/40 hover:border-hormuz-red/30 hover:text-hormuz-red/70"
              }`}
            >
              NO
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="HRMZ amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input flex-1 text-xs py-2"
              min="1"
            />
            <button
              onClick={handleBet}
              disabled={loading || side === null || !amount}
              className="btn-primary py-2 px-4 text-xs"
            >
              {loading ? "..." : "Bet"}
            </button>
          </div>
        </div>
      ) : status === "Resolved" && userPosition && !userPosition.claimed ? (
        userPosition.side === acc.outcome ? (
          <button onClick={handleClaim} disabled={loading} className="btn-primary w-full">
            {loading ? "Claiming..." : "Claim Winnings"}
          </button>
        ) : (
          <p className="text-[11px] text-white/25 text-center py-2">Your position lost this market.</p>
        )
      ) : status === "Cancelled" && userPosition && !userPosition.claimed ? (
        <button onClick={handleRefund} disabled={loading} className="btn-secondary w-full">
          {loading ? "Refunding..." : "Refund Bet"}
        </button>
      ) : null}

      {error && (
        <p className="mt-2 text-[10px] text-hormuz-red/80 font-mono-data break-all">{error}</p>
      )}
    </div>
  );
}
