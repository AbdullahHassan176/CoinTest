# HORMUZ (CoinTest)

This repository powers the **$STRAIT (Strait of Hormuz)** public dApp: Next.js frontend (`app/`), Anchor program (`programs/hormuz`), bot (`bot/`), and monitor APIs.

- **Official pin (X / TG / site):** *Official $STRAIT (Strait of Hormuz) — stateofhormuz.org only. We are not the unaffiliated $HORMUZ on Birdeye. Always confirm the contract from our site.* (`app/content/officialStraitMessaging.ts`)
- **Live hub:** [stateofhormuz.org](https://stateofhormuz.org) (canonical link hub; deploy target may also use hormuz.live — set `NEXT_PUBLIC_SITE_URL`).
- **On-chain proof:** LP lock, team vesting, mint revoked — surfaced in-app under **Rug-proof verification** on the home page.
- **Legal copy (Phase 0.4):** Canonical text in `app/content/phase04PermanentTexts.ts`; rendered at `/#phase-04-disclaimer` on the site.

## Quick start

```bash
cd app && npm install && npm run dev
```

Anchor / Solana build: see `Anchor.toml`, `ai.md`, and `docs/windows-build.md`.

## Launch asset pack (playbook §7)

See **`HORMUZ_Launch/`** — tweet drafts, TG posts, banner specs, and `HOW_TO_BUY.md` (fill in mainnet mint when live).

## Env (frontend)

Copy `app/.env.example` to `app/.env.local` and set cluster, RPC, program ID, mint, optional `NEXT_PUBLIC_GITHUB_REPO_URL`, `NEXT_PUBLIC_LINK_HUB_URL`.
