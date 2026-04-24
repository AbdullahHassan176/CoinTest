import { useState, useEffect } from "react";
import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import idl from "../utils/idl.json";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import {
  connection,
  PROGRAM_ID,
  HORMUZ_MINT,
  formatHormuz,
  apyForDuration,
  lockDurationLabel,
} from "../utils/connection";
import {
  fetchStakeRecord,
  stake,
  unstake,
} from "../utils/hormuz";

const LOCK_OPTIONS = [
  { label: "30 Days", secs: 30 * 24 * 60 * 60, apy: "10%" },
  { label: "90 Days", secs: 90 * 24 * 60 * 60, apy: "20%" },
  { label: "180 Days", secs: 180 * 24 * 60 * 60, apy: "40%" },
];

interface StakeRecord {
  amountStaked: anchor.BN;
  lockStart: anchor.BN;
  lockDurationSecs: anchor.BN;
  rewardsOwed: anchor.BN;
}

export default function StakePanel() {
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [amount, setAmount] = useState("");
  const [selectedLock, setSelectedLock] = useState(LOCK_OPTIONS[0]);
  const [stakeRecord, setStakeRecord] = useState<StakeRecord | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [txSig, setTxSig] = useState("");

  useEffect(() => {
    if (!publicKey) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  function getProgram() {
    if (!anchorWallet) throw new Error("Wallet not connected");
    const provider = new anchor.AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
    });
    return new anchor.Program(idl as anchor.Idl, provider);
  }

  async function loadData() {
    if (!publicKey) return;
    try {
      // Load token balance
      const ata = await getAssociatedTokenAddress(HORMUZ_MINT, publicKey);
      const info = await connection.getTokenAccountBalance(ata).catch(() => null);
      // uiAmount is already decimal-adjusted by the RPC
      setBalance(info?.value.uiAmount ?? 0);

      // Load stake record
      const program = getProgram();
      const record = await fetchStakeRecord(program, publicKey);
      setStakeRecord(record as StakeRecord | null);
    } catch {
      // Account may not exist yet — that's fine
    }
  }

  async function handleStake() {
    if (!publicKey) return;
    setError("");
    setTxSig("");
    setLoading(true);
    try {
      const program = getProgram();
      const ata = await getAssociatedTokenAddress(HORMUZ_MINT, publicKey);
      const sig = await stake(program, publicKey, ata, Number(amount), selectedLock.secs);
      setTxSig(sig);
      await loadData();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnstake() {
    if (!publicKey) return;
    setError("");
    setTxSig("");
    setLoading(true);
    try {
      const program = getProgram();
      const ata = await getAssociatedTokenAddress(HORMUZ_MINT, publicKey);
      const sig = await unstake(program, publicKey, ata);
      setTxSig(sig);
      await loadData();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  const lockEndTs = stakeRecord
    ? (stakeRecord.lockStart.toNumber() + stakeRecord.lockDurationSecs.toNumber()) * 1000
    : null;
  const isUnlocked = lockEndTs ? Date.now() >= lockEndTs : false;

  if (!connected) {
    return (
      <div className="card flex flex-col items-center justify-center py-12 text-center gap-2">
        <p className="section-label">Wallet not connected</p>
        <p className="text-white/50 text-sm">Connect to view your balance and stake HORMUZ</p>
        <p className="text-xs text-white/25 mt-1">Phantom · Solflare supported</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance card */}
      <div className="card">
        <div className="stat-label">Your HORMUZ Balance</div>
        <div className="stat-value">{balance.toLocaleString()} HORMUZ</div>
      </div>

      {/* Active stake */}
      {stakeRecord && (
        <div className="card border-hormuz-teal/30">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="stat-label">Active Stake</div>
              <div className="stat-value">
                {formatHormuz(stakeRecord.amountStaked.toNumber())} HORMUZ
              </div>
            </div>
            <span className={isUnlocked ? "badge-passed" : "badge-active"}>
              {isUnlocked ? "Unlocked" : "Locked"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="stat-label">Lock Duration</div>
              <div className="font-semibold">
                {lockDurationLabel(stakeRecord.lockDurationSecs.toNumber())}
              </div>
            </div>
            <div>
              <div className="stat-label">Rewards Owed</div>
              <div className="font-semibold text-hormuz-teal">
                +{formatHormuz(stakeRecord.rewardsOwed.toNumber())} HORMUZ
              </div>
            </div>
            <div>
              <div className="stat-label">APY</div>
              <div className="font-semibold">
                {apyForDuration(stakeRecord.lockDurationSecs.toNumber())}
              </div>
            </div>
            <div>
              <div className="stat-label">Unlocks At</div>
              <div className="font-semibold text-sm">
                {lockEndTs ? new Date(lockEndTs).toLocaleDateString() : "—"}
              </div>
            </div>
          </div>

          {isUnlocked && (
            <button
              className="btn-primary w-full"
              onClick={handleUnstake}
              disabled={loading}
            >
              {loading ? "Processing..." : "Unstake & Claim Rewards"}
            </button>
          )}
          {!isUnlocked && (
            <p className="text-xs text-white/40 text-center">
              You already have an active stake. Unstake after the lock period to stake again.
            </p>
          )}
        </div>
      )}

      {/* New stake form */}
      {!stakeRecord && (
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">Stake HORMUZ</h3>

          {/* Lock duration selector */}
          <div className="mb-4">
            <label className="stat-label block mb-2">Lock Duration</label>
            <div className="grid grid-cols-3 gap-2">
              {LOCK_OPTIONS.map((opt) => (
                <button
                  key={opt.secs}
                  onClick={() => setSelectedLock(opt)}
                  className={`rounded-md p-3 text-center transition-all ${
                    selectedLock.secs === opt.secs
                      ? "bg-hormuz-gold text-hormuz-deep font-bold"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="font-semibold text-sm">{opt.label}</div>
                  <div className="text-xs opacity-70">{opt.apy} APY</div>
                </button>
              ))}
            </div>
          </div>

          {/* Amount input */}
          <div className="mb-4">
            <label className="stat-label block mb-2">Amount</label>
            <div className="relative">
              <input
                type="number"
                className="input pr-24"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                max={balance}
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-hormuz-teal font-semibold"
                onClick={() => setAmount(String(Math.floor(balance)))}
              >
                MAX
              </button>
            </div>
          </div>

          {/* Burn notice */}
          {amount && Number(amount) > 0 && (
            <div className="bg-hormuz-red/10 border border-hormuz-red/20 rounded-md p-3 mb-4 text-sm">
              <span className="text-hormuz-red font-semibold">1% burn: </span>
              <span className="text-white/70">
                {(Number(amount) * 0.01).toFixed(2)} HORMUZ will be burned.{" "}
                {(Number(amount) * 0.99).toFixed(2)} HORMUZ will be staked.
              </span>
            </div>
          )}

          {/* Reward preview */}
          {amount && Number(amount) > 0 && (
            <div className="bg-hormuz-teal/10 border border-hormuz-teal/20 rounded-md p-3 mb-4 text-sm">
              <span className="text-hormuz-teal font-semibold">Estimated reward: </span>
              <span className="text-white/70">
                ~
                {(
                  Number(amount) *
                  0.99 *
                  (parseFloat(selectedLock.apy) / 100) *
                  (selectedLock.secs / (365 * 24 * 60 * 60))
                ).toFixed(2)}{" "}
                HORMUZ at unlock
              </span>
            </div>
          )}

          <button
            className="btn-primary w-full"
            onClick={handleStake}
            disabled={loading || !amount || Number(amount) <= 0}
          >
            {loading ? "Processing..." : `Stake for ${selectedLock.label}`}
          </button>
        </div>
      )}

      {/* Feedback */}
      {error && (
        <div className="bg-hormuz-red/10 border border-hormuz-red/30 rounded-md p-3 text-sm text-hormuz-red">
          {error}
        </div>
      )}
      {txSig && (
        <div className="bg-hormuz-teal/10 border border-hormuz-teal/30 rounded-md p-3 text-sm">
          <span className="text-hormuz-teal font-semibold">Transaction confirmed! </span>
          <a
            href={`https://solscan.io/tx/${txSig}${connection.rpcEndpoint.includes("devnet") ? "?cluster=devnet" : ""}`}
            target="_blank"
            rel="noreferrer"
            className="underline text-white/60 text-xs"
          >
            View on Solscan
          </a>
        </div>
      )}
    </div>
  );
}
