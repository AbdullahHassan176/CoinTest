/**
 * RugProof — on-chain transparency card.
 * Shows LP lock, team vesting, and mint authority revocation as verifiable links.
 */

import { TOKEN_SYMBOL } from "../utils/connection";
import OfficialStraitPinCallout from "./OfficialStraitPinCallout";

const CLUSTER = process.env.NEXT_PUBLIC_CLUSTER ?? "devnet";
const SFX     = CLUSTER === "devnet" ? "?cluster=devnet" : "";
const SF_NET  = CLUSTER === "devnet" ? "devnet" : "mainnet";

/** Public link hub (playbook: stateofhormuz.org). Override if you use another domain. */
const LINK_HUB = process.env.NEXT_PUBLIC_LINK_HUB_URL ?? "https://stateofhormuz.org";
/** Optional: public GitHub (or GitLab) repo URL — “this repo powers the dApp” (playbook §6). */
const GITHUB_REPO = process.env.NEXT_PUBLIC_GITHUB_REPO_URL?.replace(/\/$/, "") ?? "";

function buildProofs(s: string) {
  return [
  {
    id:    "lp",
    title: "LP Permanently Locked",
    desc:  "All liquidity-pool tokens are locked via Raydium's on-chain lock program. No one can remove liquidity.",
    badge: "LOCKED",
    badgeColor: "#00B4CC",
    links: [
      {
        label: "Lock NFT on Explorer",
        href:  `https://explorer.solana.com/address/4ZhyMnAF92QFmLVAxp1iJHZ22E44cceew5nPoJMH4FTS${SFX}`,
      },
      {
        label: "CPMM Pool on Raydium",
        href:  `https://explorer.solana.com/address/A6h82ySkHntYn65RK3VknTDzbGXKQcZHpFReyU4E8W9H${SFX}`,
      },
    ],
    detail: "6,324 LP · Pool: A6h82y…W9H · NFT: 4ZhyMn…FTS",
  },
  {
    id:    "vest",
    title: "Team Tokens Vested",
    desc:  `15 billion ${s} (15% of supply) are locked under a Streamflow contract — 90-day cliff, then released daily over 270 days. Irrevocable.`,
    badge: "VESTED",
    badgeColor: "#C9A84C",
    links: [
      {
        label: "View on Streamflow",
        href:  `https://app.streamflow.finance/${SF_NET}/vesting/5Cn6xgN1r9kDA52udrjvGkAPGu4JF77MxJpwK5hz9Dqw`,
      },
    ],
    detail: `15B ${s} · 90d cliff · 270d linear · irrevocable`,
  },
  {
    id:    "mint",
    title: "Mint Authority Revoked",
    desc:  `The ability to create new ${s} tokens has been permanently destroyed. The 100B supply is fixed forever.`,
    badge: "BURNED",
    badgeColor: "#f472b6",
    links: [
      {
        label: "Verify mint on Solscan",
        href:  `https://solscan.io/token/D6i3vdtzYWuTxEVBobSYegqHane3u6kzvBYXDTHxvLN2${SFX}`,
      },
    ],
    detail: "Mint: D6i3vd…LN2 · freeze authority: none",
  },
];
}

// A minimal shield icon
function ShieldIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 mt-0.5">
      <path
        d="M8 1.5L2 4v4c0 3.3 2.5 5.7 6 6.5 3.5-.8 6-3.2 6-6.5V4L8 1.5Z"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
      />
      <path d="M5.5 8l1.8 1.8L10.5 6" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RugProof() {
  const PROOFS = buildProofs(TOKEN_SYMBOL);
  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="section-label">Rug-proof verification</p>
        <span className="font-mono-data text-[10px] text-hormuz-teal/60 border border-hormuz-teal/20 px-2 py-0.5 rounded-sm tracking-widest">
          ON-CHAIN
        </span>
      </div>

      <p className="text-xs text-white/40 leading-relaxed mb-5">
        All three commitments below are enforced by smart contracts — not promises.
        Each link opens an independent blockchain explorer so you can verify directly.
      </p>

      <OfficialStraitPinCallout dense className="mb-5" />

      <div className="space-y-4">
        {PROOFS.map((proof, i) => (
          <div
            key={proof.id}
            className={`rounded-md border border-white/[0.06] p-4 bg-hormuz-navy/30
              ${i < PROOFS.length - 1 ? "" : ""}`}
          >
            {/* Title row */}
            <div className="flex items-start gap-2.5 mb-2">
              <ShieldIcon color={proof.badgeColor} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-white">{proof.title}</span>
                  <span
                    className="font-mono-data text-[9px] px-1.5 py-0.5 rounded-sm tracking-widest"
                    style={{ color: proof.badgeColor, border: `1px solid ${proof.badgeColor}40` }}
                  >
                    {proof.badge}
                  </span>
                </div>
                <p className="text-[11px] text-white/40 mt-1 leading-relaxed">{proof.desc}</p>
              </div>
            </div>

            {/* Detail line */}
            <div className="font-mono-data text-[10px] text-white/20 mb-2.5 ml-7 truncate">
              {proof.detail}
            </div>

            {/* Links */}
            <div className="ml-7 flex flex-wrap gap-x-4 gap-y-1">
              {proof.links.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-hormuz-teal/70 hover:text-hormuz-teal transition-colors flex items-center gap-1"
                >
                  {link.label}
                  <span className="text-[9px] opacity-50">↗</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Hub + source (launch playbook proof pages) */}
      <div className="mt-5 pt-4 border-t border-white/[0.08] space-y-2.5">
        <p className="section-label">Link hub · build</p>
        <div className="flex flex-col gap-2">
          <a
            href={LINK_HUB}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-hormuz-teal/75 hover:text-hormuz-teal transition-colors font-mono-data inline-flex items-center gap-1 w-fit"
          >
            {LINK_HUB.replace(/^https?:\/\//, "")}
            <span className="text-[9px] opacity-50">↗</span>
          </a>
          <p className="text-[10px] text-white/35 leading-relaxed">
            Official hub: monitor, token proof, and updates. On-chain links above stay the source of truth.
          </p>
          {GITHUB_REPO ? (
            <a
              href={GITHUB_REPO}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-white/55 hover:text-white/80 transition-colors font-mono-data inline-flex items-center gap-1 w-fit"
            >
              Source repository (powers this dApp — README on default branch)
              <span className="text-[9px] opacity-50">↗</span>
            </a>
          ) : (
            <p className="text-[10px] text-white/22 leading-relaxed font-mono-data">
              For mainnet credibility: set <span className="text-white/35">NEXT_PUBLIC_GITHUB_REPO_URL</span> to your public repo so visitors can see what ships the app.
            </p>
          )}
        </div>
      </div>

      {/* Footer note */}
      <p className="launch-nfa-micro mt-4">Not financial advice · DYOR</p>
      <p className="text-[10px] text-white/22 font-mono-data mt-2 leading-relaxed">
        Verified on Solana {CLUSTER.toUpperCase()} · smart-contract enforced · no admin override possible
      </p>
    </div>
  );
}
