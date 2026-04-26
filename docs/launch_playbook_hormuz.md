# HORMUZ / $STRAIT — launch & community playbook (project-specific)

**Ticker rebrand (2026):** Public trading symbol is **$STRAIT** (on-chain name: Strait of Hormuz). Another **$HORMUZ** exists on mainnet (Birdeye) that **we did not deploy** — official links, CA, and lock proofs: **stateofhormuz.org** only.

Use this alongside your advisor’s generic framework. **Status** = where the project stands today; **You do** = your next action.

---

## One sentence (Phase 0.1) — *fill this and use it everywhere*

> **$STRAIT (Strait of Hormuz):** Community Solana token + 24/7 strait intel feed + on-chain staking and DAO — **entertainment / community only, not financial advice.**

*Everything* you post should sound like that sentence. No “hedge,” no guaranteed returns, no “oil exposure” unless you build provable, labeled product for that.

---

## Ticker & brand (Phase 0.2)

| Decision | Status |
|----------|--------|
| **$STRAIT** for new listings / mainnet | Chosen — distinct from the unrelated mainnet **$HORMUZ** (Birdeye). |
| **Strait of Hormuz** | Geographic + brand name in copy; $STRAIT in tickers. |

**You do:** use the **canonical pin** (verbatim — also in `app/content/officialStraitMessaging.ts` and on-site callouts):

> Official $STRAIT (Strait of Hormuz) — stateofhormuz.org only.  
> We are not the unaffiliated $HORMUZ on Birdeye. Always confirm the contract from our site.

That single block handles the “wrong coin” problem on **X / TG / site**.

---

## Accounts (Phase 0.3) — minimum set (pre-launch optimised)

| Asset | HORMUZ status | Pre-launch: you do (in order) |
|-------|---------------|-------------------------------|
| **X (Twitter)** | Separate **project** handle (not the TG bot). Same tone as the one-liner in §0.1. | **1)** Bio: one-liner + link hub URL only.<br>**2)** 1 human post/day minimum: news hook OR build note OR one strait fact (rotate).<br>**3)** Pin a 3-tweet thread: what HORMUZ is / isn’t + TG + site.<br>**4)** No duplicate posting from multiple tabs/tools; one logged-in session. |
| **Telegram (announce)** | **t.me/StateOfHormuz** — intel channel + bot (read-only for members). | **1)** Pin: disclaimer + site + how to join airdrop (if live).<br>**2)** **Optional:** separate **discussion** group — slow mode on, links off or mod-approved, anti-spam bots, no “price targets” in pin.<br>**3)** Treat announce vs chat as two roles: announce = signal; chat = noise control. |
| **Link hub** | **https://stateofhormuz.org** — single canonical URL. [Linktree](https://linktr.ee) only if X bio runs out of space. | **Before mainnet:** site, TG announce, airdrop page (if any), RugProof / transparency page, short disclaimer, contact.<br>**After mainnet same week:** add chart (DexScreener/Birdeye), Raydium pool link, mainnet CA, [Streamflow](https://app.streamflow.finance) team vest link.<br>**Keep** one “not financial advice” line visible on the hub. |
| **Bluesky** | Automated posting can hit **daily auth rate limits** if many restarts or parallel tools log in. | **Pre-launch:** 1–2 manual posts/week with same one-liner + link hub; avoid logging the bot in/out repeatedly.<br>If API is throttled: pause automation until the next UTC day; use the web app for urgent posts. |
| **Mastodon** | Token/instance can be **suspended or login disabled** — automation then fails silently. | **Pre-launch:** confirm account is active (web login). If 403 “login disabled”: new app token on a healthy instance (e.g. mastodon.social) or pause Mastodon until fixed.<br>Do not rely on Mastodon for time-critical launch messages until a test toot succeeds. |

**Pre-launch sanity check (5 min):** X bio → hub → hub lists TG + disclaimer → TG pin matches hub → no second bot process posting duplicates (one machine, one `main.py` / one `start_bot.bat` window).

---

## Three permanent texts (Phase 0.4) — copy/paste

**Canonical in repo:** `app/content/phase04PermanentTexts.ts` — rendered on home (`/#phase-04-disclaimer`), markets, monitor Help (`?`) + panel footer `<details>`, and linked from `/embed`. Edit there first, then sync this doc if wording changes.

Use these verbatim in pins, site footers, X bios (short form), and TG. Do not paraphrase for “marketing punch.”

**Automation:** The Telegram bot appends this exact three-part block to every **channel** post (`bot/main.py` → `post_message`) and to every **command** reply (`/help`, `/airdrop`, `/stats`, etc. via `bot/commands.py`). Source of truth: `bot/legal_copy.py` (keep in sync with this section).

**1) Disclaimer**

```
HORMUZ is a community meme/utility token on Solana. It is not a security, fund, or investment product.
Crypto is high risk. You can lose 100% of any amount you use. This is not financial, legal, or tax advice.
Nothing here promises profit, "passive income," or exposure to oil markets. DYOR.
```

**2) What it is**

```
HORMUZ ties a fixed-supply, deflationary token (1% burn on stake) to a public Strait of Hormuz "intel" channel: curated news + (where we ship) on-chain staking, DAO budget votes, and transparent locks (mint revoked, LP locked, team tokens vested).
The token rewards community and narrative participation — not oil performance.
```

**3) What it is not**

```
Not a hedge against oil or war. Not a substitute for real analysis or for institutional research.
Not a product from your day-job employer. Not advice to buy or hold any asset.
```

---

## Phase 1 — Look real

| # | Item | HORMUZ status | You do |
|---|------|---------------|--------|
| 5 | Visuals | **Web:** coherent cards + `launch-nfa-micro` on home/markets (matches X/TG NFA-in-small-type guideline). | **You:** Canva banner — `HORMUZ_Launch/creative/BANNER_SPECS.md` |
| 6 | Proof pages | **stateofhormuz.org** in Rug-proof hub link; devnet explorer links unchanged; root **README.md** states repo powers dApp. | Set **`NEXT_PUBLIC_GITHUB_REPO_URL`** (+ optional `NEXT_PUBLIC_LINK_HUB_URL`) in prod; see `app/.env.example` |
| 7 | Asset pack | **`HORMUZ_Launch/`** has drafts + `HOW_TO_BUY.md` + banner spec; `creative/` for PNGs. | Drop **logo** + **banner** PNGs; fill mainnet mint in `HOW_TO_BUY.md` after launch |

---

## Phase 2 — Community before mainnet (7–21 days)

| # | Item | HORMUZ status | You do |
|---|------|---------------|--------|
| 8 | First 100–500 | Airdrop + referral live | Post in: Solana meme TGs, **your** network, people who like geopolitics. No bot farms. |
| 9 | Early supporters | TG + airdrop signup + weekly intel | 1 “weekly intel highlight” post / week; airdrop CSV export when you’re ready to pay (from airdrop wallet) |
| 10 | Content rhythm | Bot posts; you need **your** voice daily | 1x news/context, 1x build/roadmap, 1x light meme (tasteful) — *your* 3 posts/day in addition to the bot if possible |
| 11 | Replies, not only broadcast | — | 30 min/day: reply in geopolitics + Solana threads, **no** spam in unrelated groups |

### Automated slice (bot) — optional

Set `PRELAUNCH_DAILY_ENABLED=1` in `bot/.env`. The bot then posts **one** rotated Telegram message per day (UTC hour `PRELAUNCH_DAILY_HOUR`): **news+strait**, **build/proof**, **meme line** — see `bot/prelaunch_social.py`. It can optionally mirror a **short** Bluesky line (`PRELAUNCH_MIRROR_BLUESKY=1`); raise `BLUESKY_POST_INTERVAL` if you do not want two Bluesky rhythms overlapping. It also appends **X thread** and **Reddit** drafts under `outreach/social_drafts/` for you to paste manually (Reddit auto-post is unsafe). Short video: a script stub is appended on **meme** rotation days in `short_video_scripts.md`. **Pinned TG copy** and **30 min/day replies** stay human-only.

---

## Phase 3 — Credibility (parallel)

| # | Item | HORMUZ status | You do (mainnet) |
|---|------|---------------|------------------|
| 12 | Liquidity plan | Devnet: **HORMUZ/SOL** (CPMM) + 40B+1 SOL + LP lock proof | **Mainnet:** decide min SOL in pool ($500–$2k+ feels “alive” at low caps); re-lock LP; pin proof |
| 13 | Transparency | Devnet: mint, LP, vest links on site | **Mainnet:** same 3 + labeled explorer links; optional: list **EOI** of treasury wallets (or “see RugProof on site only”) |

---

## Phase 4 — Press kit + outreach (2–5 days pre-blitz)

| # | Item | You do |
|---|------|--------|
| 14 | 1-pager (Notion/PDF) | Pitch + facts + **honest** roadmap (only what you will ship) + risk + `contact@` for TG/ops |
| 15 | 30–100 target sheet | Columns: name / link / why / DM? / follow-up. Small Solana + meme Twitter 10k–200k, 10 small YouTubers, 20 Discords, alpha TGs. **$0** = DMs and organic only first. |

---

## Phase 5 — Launch week (mainnet)

| # | Item | Order (do not reorder) |
|---|------|-------------------------|
| 16 | Soft open (T-2d) | Tell core: UTC window, “liquidity first,” what you are **not** promising |
| 17 | Day 0 | 1) Seed DEX 2) Test swap 3) **Same hour:** CA + links + disclaimer 4) Airdrop *after* liquidity if you promised delivery post-pool |
| 18 | Launch hour | Pinned TG + 5–8 post X thread + 3–5 reposts if you have them |
| 19 | 24h | Full support, pin “how to buy,” fix broken links immediately |

---

## Phase 6 — First 7 days after mainnet

| # | Item | You do |
|---|------|--------|
| 20 | Daily update | Real numbers: vol, est. holders, *honest* milestones only |
| 21 | 1–2 campaigns you can finish | e.g. best strait-related meme, weekly intel thread, one 15m AMA in **one** community |
| 22 | Paid (optional) | **Only** after support + links are perfect. Tiers: $0 → organic; $200–$1k TG shoutouts; don’t do $1k+ until you’ve watched organic for a week. |

---

## Discovery sites & chart UIs (where “meme coins” get seen)

These are **not** substitutes for TG/X/Reddit community work — they’re **where traders find pools** once you have **real liquidity** on-chain. HORMUZ should look like **data + disclosure**, not anonymous hype.

| Venue | What it is | **Do** | **Don’t** |
|-------|------------|--------|-----------|
| **[DexScreener](https://dexscreener.com)** | New pairs + charts for Solana pools | After pool exists: **claim** the pair page, add **logo**, **site**, **X/TG**, short description aligned with Phase 0.4 (no return promises). | Pay for “trending” until support + links are perfect; don’t imply official endorsement. |
| **[Birdeye](https://birdeye.so)** | Analytics + trending | Same: **verify** token/pool, complete profile, link **stateofhormuz.org**. | Treat “trending” as a goal in itself; it’s often **velocity**, not quality holders. |
| **[GeckoTerminal](https://www.geckoterminal.com)** | DEX charts / discovery | Add links if listed; keep **CA + network** consistent everywhere. | — |
| **[Raydium](https://raydium.io)** / **[Jupiter](https://jup.ag)** | Where people **swap** | **Day 0:** pool live → test swap → link from site + TG pin. | — |
| **Bonding-curve launchpads** (e.g. pump-style) | Different GTM: attention + curve mechanics | Only if you **explicitly choose** that path; separate legal/reputation risk from “intel + DAO” story. | Mix it in silently with the Strait intel brand without deciding as a team. |
| **Third-party trading terminals** | Faster UIs on top of same pools | Optional link from site for **power users**; you don’t “post” there — the pool appears when indexed. | Pay for bot volume / wash patterns; breaks your “no bot farms / honest updates” rule. |

**Rule of thumb:** **Community and content first** (Phases 2–4) → **liquidity + proofs** (Phase 5) → **then** spend 30–60 minutes once claiming **DexScreener + Birdeye** (and any others you care about) so every click lands on **the same** site, disclaimer, and TG.

---

## Phase 7 — What to measure (weekly)

- Unique holders, liquidity, volume (Birdeye / DexScreener).  
- TG members + airdrop export row count.  
- X impressions (if you use it).  
- If holders ↑ but vol flat → liquidity / narrative / CEX talk. If vol ↑ but holders flat → you’re only attracting flippers; tighten community story.

---

## The “don’t do” list (your advisor’s version, HORMUZ-applied)

- No “returns / hedge to oil / guaranteed APY in marketing” beyond what the **chain** does and **disclaimers** say.  
- No surprise team dump: keep Streamflow (or re-lock) story public.  
- No spam in random Discords; get invited or use listed alpha channels.  
- No bought followers; it poisons DMs to real KOLs later.

---

## 10 lines to remember

1. One voice, one sentence, everywhere.  
2. TG + X + one link page (you have the site; add X bio → site).  
3. Post *something* from the human account daily pre-mainnet.  
4. Airdrop + real wallets + weekly intel, not only hype.  
5. Mainnet: LP + lock proofs + vest links before you spend on shoutouts.  
6. **Liquidity before airdrop distribution** (if airdrop was promised post-launch).  
7. Same hour: CA, disclaimer, how to buy.  
8. Launch hour: coordinated, not slow drip.  
9. 24h support.  
10. 7 days of true updates, then re-evaluate spend.

---

## $0 budget — 14 days before mainnet (example calendar)

Adjust `Day 0` to your real go-live. **“You” = your account in addition to the channel bot.**

| Day | You (human) | Bot can |
|-----|----------------|---------|
| D-14 | X + TG: post one-liner + 3 links (site, TG, disclaimer) | (already running) |
| D-13 | 30 min replies in 3 geopolitics / Solana threads | — |
| D-12 | 1 “behind the scenes: what’s on stateofhormuz.org” | Intel digest |
| D-11 | Weekly intel highlight (manual 1 post) | — |
| D-10 | Airdrop reminder + referral link in TG pin comment | Airdrop promo (if you schedule) |
| D-9 | 1 tasteful meme / strait fact | — |
| D-8 | DM 10 small accounts from your spreadsheet (intro, no shill wall) | — |
| D-7 | “One week to mainnet window” (only if you commit to a date) | — |
| D-6 | Roadmap: 3 bullets *only* what you’ll ship in 30 days | — |
| D-5 | `HOW_TO_BUY` draft, share in TG for feedback | — |
| D-4 | Soft open message to core: UTC window, liq first, no return promises | — |
| D-3 | Rest + fix links / typos on site | — |
| D-2 | “48h: liquidity first” in TG + X | — |
| D-1 | Sleep; prep pinned posts + thread draft | — |
| **D0** | **Execute Phase 5 order** | **Pause airdrop sends until pool live if that was the promise** |
| D+1–+7 | Daily 1-paragraph true update + support | Continue intel |

---

## $500 or $5k (short version)

- **$500:** After 7 good organic days on mainnet: 2–4 *vetted* TG call channels; ask for *proof* of their audience (screens, recent promos). No “guaranteed x100” packages.  
- **$5k:** Spreads to multiple *parallel* small influencers + 1 well-produced thread graphic + only if **DEX + lock + support** are flawless for 1 week.

If you set **real budget** and **public vs. anon** on socials, tighten D-14…D+7 into your exact **dates** in a new section at the bottom of this file (one row per day).

---

## $200 budget + **anonymous** GTM (HORMUZ / $STRAIT)

**Goal:** traction without tying the project to your real name or your institutional work. Everything below assumes **canonical links + $STRAIT + stateofhormuz.org** (see §0.2 / press kit).

### Anonymous ops checklist (do before spending the $200)

| Step | What to do |
|------|------------|
| **Identity** | Project-only **X** handle (no personal bio cross-links). Same voice as §0.1 one-liner. |
| **Contact** | **Proton** (or similar) email → put on press kit as `ops@…` once DNS is set; never your work email. |
| **Payments** | Pay shoutouts in **USDC** if the seller accepts; otherwise a **prepaid virtual card** not tied to your main bank branding (whatever is legal/available to you). |
| **WHOIS** | Domain registrar **privacy** on `stateofhormuz.org` (if not already). |
| **AMA / video** | Prefer **text AMA** or “team voice off” — no face required for traction at $200 tier. |
| **Receipts** | Save screenshots of **ad spend + agreed deliverables** (time, links posted) in a private folder — disputes are common at low-end shoutouts. |

### How to spend **$200** (recommended split)

| Bucket | ~USD | What you buy |
|--------|------|----------------|
| **Liquidity is not “marketing”** | **$0 of the $200** | Keep SOL aside *before* counting the $200 — LP is not optional; it’s the product surface. The $200 is **distribution** only. |
| **Small TG / Discord call posts** | **$120–$150** | **3×** posts in **vetted** Solana meme / “gems” groups that show **recent** promos + member counts. Ask for **pinned duration** + **link** proof. Avoid “guaranteed 100x” sellers. |
| **One micro-creator** | **$40–$60** | One **10k–40k** X account that actually posts **Solana** launches (not random bot accounts). DM: short pitch + **stateofhormuz.org** + “community only, NFA.” |
| **Reserve / fixes** | **$10–$20** | Emergency: DexScreener logo claim issues, replacing a bad shoutout, or a tiny **Canva** boost if you need a sharper thread graphic. |

**Do not** spend on “trending” bots, wash volume, or follower packages — that conflicts with your own playbook (Phase 7 / don’t list) and burns reputation.

### **When** to spend the $200 (order)

1. **Mainnet:** pool live + **test swap** + LP lock proof pinned (Phase 5 §17).  
2. **Same day:** claim **DexScreener** (+ Birdeye if listed) with **logo + site + TG + X** — free, but costs your time.  
3. **Day +1 to +3:** if volume/holders look **human** (not only one wallet ping-pong), fire **1** shoutout as a test.  
4. **Day +4 to +7:** if the first moved **real** TG joins or sustained vol, spend the rest. If nothing moved, **pause** — throwing the rest at worse channels rarely fixes a dead pool.

### Anonymous traction **without** paid spend (still do these; $200 is additive)

| Daily (15–30 min) | Weekly (1–2 h) |
|-------------------|----------------|
| Reply in **geopolitics** + **Solana** threads with the **canonical “wrong $HORMUZ”** pin (§0.2) — helpful, not spammy. | Export **airdrop** signups; one **“weekly strait intel”** thread on X (paste from `outreach/social_drafts/` if the bot generates them). |
| 1 human post/day on project X: **news hook** OR **build note** OR **one strait fact** (Phase 2 §10). | DM **10** small accounts from your sheet (Phase 4 §15) — intro + link hub, **no** wall of emojis. |

### What “success” looks like at **$200** (realistic)

- **Good:** +200–800 TG members over 7–14 days, **non-zero** DEX volume after LP, a few **organic** reposts.  
- **Okay:** quiet chart but **stable** community + clean support — you can raise budget later.  
- **Bad signal:** huge member jump, **zero** vol → likely botted group; stop spending.

### One-page alignment

Keep **`docs/press_kit_strait.md`** in sync: anonymous **X TBD** → replace with the project handle once live; **ops email** TBD → Proton once created.

---

*Last updated for HORMUZ / stateofhormuz.org. Devnet proofs in `ai.md`; mainnet: repeat LP + mint + vest steps.*
