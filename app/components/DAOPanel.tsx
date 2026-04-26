import { useState, useEffect, useCallback } from "react";
import { useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import idl from "../utils/idl.json";
import { PublicKey } from "@solana/web3.js";
import { connection, PROGRAM_ID, formatHormuz, TOKEN_SYMBOL } from "../utils/connection";
import {
  fetchAllProposals,
  fetchProgramState,
  fetchStakeRecord,
  createProposal,
  voteOnProposal,
  deriveVoteRecord,
} from "../utils/hormuz";

interface Proposal {
  publicKey: PublicKey;
  account: {
    proposalId: anchor.BN;
    title: string;
    description: string;
    yesVotes: anchor.BN;
    noVotes: anchor.BN;
    status: { active?: {}; passed?: {}; rejected?: {}; executed?: {} };
    votingEndsAt: anchor.BN;
    executionAmount: anchor.BN;
    executionTarget: PublicKey;
  };
}

type Tab = "proposals" | "create";

export default function DAOPanel() {
  const { publicKey, connected } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [tab, setTab] = useState<Tab>("proposals");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalCount, setProposalCount] = useState(0);
  const [isStaked, setIsStaked] = useState(false);
  const [votedProposals, setVotedProposals] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [txSig, setTxSig] = useState("");

  // Create form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [executionAmount, setExecutionAmount] = useState("");
  const [executionTarget, setExecutionTarget] = useState("");

  const getProgram = useCallback(() => {
    if (!anchorWallet) throw new Error("Wallet not connected");
    const provider = new anchor.AnchorProvider(connection, anchorWallet, {
      commitment: "confirmed",
    });
    return new anchor.Program(idl as anchor.Idl, provider);
  }, [anchorWallet]);

  const loadData = useCallback(async () => {
    if (!publicKey) return;
    try {
      const program = getProgram();

      // Load proposals
      const all = await fetchAllProposals(program);
      setProposals(all as Proposal[]);

      // Load proposal count
      const state = await fetchProgramState(program);
      if (state) setProposalCount(state.proposalCount.toNumber());

      // Check if user is staked (required to vote/propose)
      const record = await fetchStakeRecord(program, publicKey);
      setIsStaked(!!record);

      // Check which proposals user has voted on
      const voted = new Set<number>();
      for (const p of all as Proposal[]) {
        const pid = p.account.proposalId.toNumber();
        const [voteRecordPda] = deriveVoteRecord(publicKey, pid);
        const info = await connection.getAccountInfo(voteRecordPda);
        if (info) voted.add(pid);
      }
      setVotedProposals(voted);
    } catch {
      // OK — program may not be deployed yet
    }
  }, [publicKey, getProgram]);

  useEffect(() => {
    if (connected && publicKey) loadData();
  }, [connected, publicKey, loadData]);

  async function handleCreateProposal() {
    if (!publicKey) return;
    setError("");
    setTxSig("");
    setLoading(true);
    try {
      const program = getProgram();
      let target: PublicKey;
      try {
        target = new PublicKey(executionTarget);
      } catch {
        throw new Error("Invalid execution target address");
      }
      const sig = await createProposal(
        program,
        publicKey,
        title,
        description,
        Number(executionAmount) || 0,
        target,
        proposalCount
      );
      setTxSig(sig);
      setTitle("");
      setDescription("");
      setExecutionAmount("");
      setExecutionTarget("");
      setTab("proposals");
      await loadData();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleVote(proposalId: number, support: boolean) {
    if (!publicKey) return;
    setError("");
    setTxSig("");
    setLoading(true);
    try {
      const program = getProgram();
      const sig = await voteOnProposal(program, publicKey, proposalId, support);
      setTxSig(sig);
      await loadData();
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed");
    } finally {
      setLoading(false);
    }
  }

  function statusLabel(status: Proposal["account"]["status"]): string {
    if (status.active) return "Active";
    if (status.passed) return "Passed";
    if (status.rejected) return "Rejected";
    if (status.executed) return "Executed";
    return "Unknown";
  }

  function statusClass(status: Proposal["account"]["status"]): string {
    if (status.active) return "badge-active";
    if (status.passed) return "badge-passed";
    if (status.rejected) return "badge-rejected";
    return "badge-executed";
  }

  if (!connected) {
    return (
      <div className="card flex flex-col items-center justify-center py-12 text-center gap-2">
        <p className="section-label">Wallet not connected</p>
        <p className="text-white/50 text-sm">Connect to view proposals and participate in governance</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab selector */}
      <div className="flex gap-0 border border-white/[0.07] rounded-md overflow-hidden bg-hormuz-navy/40">
        {(["proposals", "create"] as Tab[]).map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-widest transition-all
              ${i > 0 ? "border-l border-white/[0.07]" : ""}
              ${tab === t
                ? "bg-hormuz-gold text-hormuz-deep"
                : "text-white/40 hover:text-white/70 hover:bg-white/5"
              }`}
          >
            {t === "proposals" ? `Proposals (${proposals.length})` : "New Proposal"}
          </button>
        ))}
      </div>

      {!isStaked && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3 text-sm text-yellow-400">
          You must have an active stake to vote or create proposals.
        </div>
      )}

      {/* Proposals list */}
      {tab === "proposals" && (
        <div className="space-y-3">
          {proposals.length === 0 && (
            <div className="card text-center py-10 text-white/40">
              No proposals yet. Be the first to create one!
            </div>
          )}
          {proposals.map((p) => {
            const pid = p.account.proposalId.toNumber();
            const total = p.account.yesVotes.toNumber() + p.account.noVotes.toNumber();
            const yesPct = total > 0 ? (p.account.yesVotes.toNumber() / total) * 100 : 0;
            const noPct = 100 - yesPct;
            const hasVoted = votedProposals.has(pid);
            const isActive = !!p.account.status.active;
            const endsAt = new Date(p.account.votingEndsAt.toNumber() * 1000);

            return (
              <div key={p.publicKey.toBase58()} className="card">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/30">#{pid}</span>
                    <h4 className="font-semibold">{p.account.title}</h4>
                  </div>
                  <span className={statusClass(p.account.status)}>
                    {statusLabel(p.account.status)}
                  </span>
                </div>

                <p className="text-sm text-white/60 mb-3">{p.account.description}</p>

                {p.account.executionAmount.toNumber() > 0 && (
                  <div className="text-xs text-white/40 mb-3">
                    Treasury release: {formatHormuz(p.account.executionAmount.toNumber())} {TOKEN_SYMBOL}
                  </div>
                )}

                {/* Vote bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-green-400">
                      YES {formatHormuz(p.account.yesVotes.toNumber())} ({yesPct.toFixed(1)}%)
                    </span>
                    <span className="text-hormuz-red">
                      NO {formatHormuz(p.account.noVotes.toNumber())} ({noPct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${yesPct}%` }}
                    />
                  </div>
                </div>

                <div className="text-xs text-white/30 mb-3">
                  Voting ends: {endsAt.toLocaleDateString()}
                </div>

                {isActive && isStaked && !hasVoted && (
                  <div className="flex gap-2">
                    <button
                      className="flex-1 btn-secondary text-green-400 hover:bg-green-500/20"
                      onClick={() => handleVote(pid, true)}
                      disabled={loading}
                    >
                      Vote YES
                    </button>
                    <button
                      className="flex-1 btn-secondary text-hormuz-red hover:bg-hormuz-red/20"
                      onClick={() => handleVote(pid, false)}
                      disabled={loading}
                    >
                      Vote NO
                    </button>
                  </div>
                )}
                {hasVoted && (
                  <p className="text-xs text-center text-white/30">You have voted on this proposal</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create proposal form */}
      {tab === "create" && (
        <div className="card">
          <h3 className="font-semibold text-lg mb-4">New Proposal</h3>

          {!isStaked && (
            <p className="text-sm text-yellow-400 mb-4">
              You must stake {TOKEN_SYMBOL} before creating a proposal.
            </p>
          )}

          <div className="space-y-3">
            <div>
              <label className="stat-label block mb-1">Title (max 100 chars)</label>
              <input
                className="input"
                placeholder={`e.g. Burn 1B ${TOKEN_SYMBOL} from treasury`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                disabled={!isStaked}
              />
            </div>

            <div>
              <label className="stat-label block mb-1">Description (max 500 chars)</label>
              <textarea
                className="input resize-none h-28"
                placeholder="Describe the proposal, its rationale, and expected impact..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                disabled={!isStaked}
              />
              <div className="text-xs text-white/30 text-right mt-1">
                {description.length}/500
              </div>
            </div>

            <div>
              <label className="stat-label block mb-1">Treasury release amount ({TOKEN_SYMBOL}, optional)</label>
              <input
                className="input"
                type="number"
                placeholder="0"
                value={executionAmount}
                onChange={(e) => setExecutionAmount(e.target.value)}
                disabled={!isStaked}
              />
            </div>

            <div>
              <label className="stat-label block mb-1">Execution Target Wallet</label>
              <input
                className="input"
                placeholder="Solana public key (base58)"
                value={executionTarget}
                onChange={(e) => setExecutionTarget(e.target.value)}
                disabled={!isStaked}
              />
            </div>

            <button
              className="btn-primary w-full"
              onClick={handleCreateProposal}
              disabled={loading || !isStaked || !title || !description}
            >
              {loading ? "Submitting..." : "Submit Proposal"}
            </button>
          </div>
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
            href={`https://solscan.io/tx/${txSig}?cluster=devnet`}
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
