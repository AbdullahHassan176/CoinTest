/**
 * Phase 0.4 — three permanent texts. Canonical wording for site, pins, and docs.
 * @see docs/launch_playbook_hormuz.md — keep in sync; do not paraphrase in UI.
 * @see bot/legal_copy.py — same strings for Telegram channel + command replies.
 */
export const PHASE_0_4 = {
  label: "Three permanent texts (Phase 0.4)",
  disclaimer: {
    title: "Disclaimer",
    paragraphs: [
      "HORMUZ is a community meme/utility token on Solana. It is not a security, fund, or investment product.",
      "Crypto is high risk. You can lose 100% of any amount you use. This is not financial, legal, or tax advice.",
      'Nothing here promises profit, "passive income," or exposure to oil markets. DYOR.',
    ],
  },
  whatItIs: {
    title: "What it is",
    paragraphs: [
      'HORMUZ ties a fixed-supply, deflationary token (1% burn on stake) to a public Strait of Hormuz "intel" channel: curated news + (where we ship) on-chain staking, DAO budget votes, and transparent locks (mint revoked, LP locked, team tokens vested).',
      "The token rewards community and narrative participation — not oil performance.",
    ],
  },
  whatItIsNot: {
    title: "What it is not",
    paragraphs: [
      "Not a hedge against oil or war. Not a substitute for real analysis or for institutional research.",
      "Not a product from your day-job employer. Not advice to buy or hold any asset.",
    ],
  },
} as const;

export type Phase04Block = { title: string; paragraphs: readonly string[] };

export const PHASE_0_4_BLOCKS: readonly Phase04Block[] = [
  PHASE_0_4.disclaimer,
  PHASE_0_4.whatItIs,
  PHASE_0_4.whatItIsNot,
];
