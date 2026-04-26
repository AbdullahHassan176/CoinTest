# Phase 3 — Credibility (devnet done · mainnet checklist)

Project: **$STRAIT** (Strait of Hormuz) — https://stateofhormuz.org

---

## 12 — Liquidity plan (mainnet)

### What you already proved (devnet)

| Item | Status |
|------|--------|
| DEX / pair | **STRAIT/SOL** (Raydium CPMM) — same for mainnet |
| Pool seed | 40% supply + 1 **SOL** (devnet) + LP **locked** (Raydium lock, NFT proof) |
| Script | `scripts/create_pool.ts` — set `CLUSTER=mainnet` + funded liquidity wallet |
| Lock script | `scripts/lock_lp.ts` after pool exists |

### What to decide for mainnet (dollar depth)

Rough math: *liquidity* on Birdeye = **both sides of the pool**; **SOL** side = what you put in. More SOL = less slippage for the same buy size and “healthier” chart for serious buyers.

| Your budget (USD, SOL @ ~$85) | Suggested min **SOL in pool** | Notes |
|-------------------------------|--------------------------------|--------|
| ~$85–$170 (1–2 SOL) | **1–2 SOL** | Viable; thin; many small-caps start here. |
| ~$425 (5 SOL) | **2–3 SOL** + 40% STRAIT | “Alive” for early trading; re-add later via Raydium. |
| ~$800+ | **3–5 SOL** | Closer to your earlier launch estimate; still small-cap. |

**Rule of thumb for “doesn’t look dead at low cap”:** aim for at least **~$500–$2,000 in *combined* side depth** (that often means 1.5–4+ SOL in the SOL leg at the same time as a large token leg — exact USD depends on price after first trades).

**You do (in order, mainnet):**

1. [ ] **Mint + distribute** new STRAIT to liquidity wallet (per `create_token.ts` on **mainnet**).
2. [ ] **Create pool** — `scripts/create_pool.ts` (mainnet env, funded liquidity keypair, Raydium mainnet fee config in script is already there).
3. [ ] **Verify swap** — small buy/sell yourself, check explorer + Jupiter route.
4. [ ] **Lock 100% LP** — `scripts/lock_lp.ts` (saves `scripts/.lp_lock.json`); note **lock NFT** address.
5. [ ] **Pin proof** (site + X + TG): same format as [RugProof](https://stateofhormuz.org) (mainnet: update env + new links when live).

**Optional (not required day one):** STRAIT/**USDC** second pool = extra work (two positions); most teams ship **STRAIT/SOL** first, then a USDC pair if volume justifies it.

---

## 13 — Transparency pack (mainnet)

### Minimum “serious buyers” set (3 proofs)

| Proof | What to show | Mainnet: you do |
|------|----------------|-----------------|
| **1. Fixed supply** | Mint authority revoked | Solscan/Explorer: mint page shows **no mint authority** |
| **2. LP** | 100% LP in Raydium **lock** program; lock NFT or explorer link | **Link** in RugProof (replace devnet with mainnet) |
| **3. Team** | Vesting contract on **Streamflow** (devnet for now; re-create on mainnet) | New Streamflow stream from **new** mainnet team holding |

**Frontend:** Vercel env: `NEXT_PUBLIC_HORMUZ_MINT`, `NEXT_PUBLIC_PROGRAM_ID`, `NEXT_PUBLIC_CLUSTER=mainnet-beta`, and pool/lock/vesting URLs in RugProof (or a small config file).

### Optional: labelled treasury / allocation wallets (EOA — no private keys!)

**Public addresses only.** Useful for Dune/CoinGecko forms and trust. “EOI” in your doc = *evidence of intent* to show where the **allocation** sits — not a legal term.

| Role | Public address (devnet — replace after mainnet mint) | On-chain type |
|------|--------------------------------------------------------|---------------|
| Liquidity | `8HCeDkTKeqFW8wtaoaoaMu8p4VtBrvrLh1drUoUPVnjj` | EOA (pool/LP) |
| Marketing | `5moL2DRU9pvfXsVGnmm6wPPkFWYvo6iYy6aAEesJxeNu` | EOA |
| Team | `D2BsaNzFyPPewvmdrJzxNbmp3NPSoBUkvZ1PP3zmsN5a` | EOA → then Streamflow |
| Airdrop | `4UUPreJ17MdsYHM5CqKxMoPboLXTzHWjMtGmjkRHUrtY` | EOA |
| Staking rewards | *PDA* (program) — e.g. rewards-treasury under program ID | PDA, not a personal wallet |
| DAO | *PDA* `dao-treasury` | Fund from marketing if you want DAO spendable balance |

**You do:**  
- [ ] **Mainnet:** regenerate list from **new** keypairs/PDAs; paste into this doc + press kit.  
- [ ] **Site:** optional single page `/transparency` or a paragraph under RugProof: *“Labelled holding addresses: …”*  
- [ ] **Never** publish: private keys, seed phrases, or full `keypair.json` paths.

### Not affiliated with other “Hormuz” tickers

Keep pinned: *Official $STRAIT: stateofhormuz.org. Not the unaffiliated mainnet $HORMUZ on third-party trackers.*

---

## Quick copy-paste block (after mainnet goes live)

Fill in `…` and drop into `docs/press_kit_strait.md` and your link-in-bio:

```text
Program: …
Mint (STRAIT): …
Pool (Raydium CPMM): …
LP lock: …
Team vesting (Streamflow): …
Site: https://stateofhormuz.org
```

---

*Devnet reference numbers: see `ai.md` → Current Deployment State.*
