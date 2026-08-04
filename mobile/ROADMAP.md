# XGO — Roadmap & Strategy Notes

Living notes on where the app is, how the economics work, and what's next.
Not legal advice — the token/treasury structure needs a securities/crypto attorney
before any of the financial pieces go live.

Architecture, the ten-section assessment, and the reasoning behind the phase order below
live in **`ARCHITECTURE.md`**. This file is the plan; that file is the analysis.

The canonical description of the ecosystem — what it is, what it claims, and what is still
undecided — lives in the platform repo at **`docs/ARCHITECTURE.md`**. Where this file disagrees
with it, that one is right.

## Where it is now
- Gold/black XGO wallet, live as a **general exchange** (Jupiter swaps on Solana,
  KyberSwap on Ethereum/BSC). XGO's own features activate once XGO is listed.
- Tabs: Wallet · Swap · Property · Ecosystem (treasury) · More
  (Governance / Activity / Contacts / Settings + coming-soon Impact / Marketplace / Map).
- Self-custody (BIP39 seed backup + import), Token-2022 support, anti-drainer
  safety layer, transparent treasury view.
- **Governance/membership staking (non-custodial):** hold XGO = voting weight;
  hold more/longer = higher tier (Member → Steward → Elder → Founder) + a loyalty
  multiplier (up to 2×). No lock-up, no custody, **no payout**.
- **Entirely serverless.** Every external dependency is an RPC or a third-party API;
  all state is on-device. Two first-party services are declared but dormant
  (`EXPO_PUBLIC_VAULT_API`, `EXPO_PUBLIC_NOTIFY_API`). Most of what follows is
  blocked on that changing — see `ARCHITECTURE.md` §1.

---

# The ecosystem build — phases in dependency order

## Phase 0 — foundations (no backend needed) — **DONE**
- ~~**Deed parsing + property status.**~~ `src/property/deed.ts` reads the deed from
  metadata attributes: rights (tri-state — granted, denied, or *unstated*), creator
  royalty, treasury assessment, term, agreement version. Status is active / expiring /
  expired. *Policy* transferability (what the deed allows) is now separate from
  *technical* (what the token program allows), and Send needs both.
- ~~**Property / Credentials split.**~~ What you own vs. what you are. Adding a
  `CollectibleKind` is now a compile error at every dispatch site — the `default`
  branches that would have silently mishandled Fellowship, Office and Subscription
  are gone.
- ~~**Signed agreement records.**~~ `src/agreements/record.ts` — sha256 of the document,
  an ed25519 signature over wallet + document + version + hash + timestamp, append-only,
  surfaced at More → Agreements. First-run records start unsigned (no wallet exists yet)
  and can be signed later.
- **Still open:** the on-chain reality should be one tap away everywhere property
  language is used (`ARCHITECTURE.md` §2, Challenge 2).

## Phase 1 — Identity (blocks every server-side engine)
- ~~**1.1 Generalised wallet auth.**~~ `src/access/siws.ts` — challenge → validate before
  signing → biometric → sign → short-lived bearer token, with `challengeIsSafe` generalised
  to wallet + purpose + domain and shared with the vault so the two can't drift. Session in
  memory only; no refresh, because the key is the credential. The platform half is live at
  `/_api/v1/auth/challenge` + `/verify`. Dormant until `EXPO_PUBLIC_VAULT_API` is set.
  **Cluster note:** the challenge names the cluster and the server refuses one it doesn't
  speak for. This app defaults to mainnet-beta and the server defaults to devnet, so a
  deployment must set the server's `SOLANA_CLUSTER` or every real sign-in is refused.
- ~~**1.2 Membership as a key type.**~~ `CollectibleKind` now carries the constitutional
  set — membership, fellowship, office, credential, community, subscription — and
  `src/identity/membership.ts` derives standing from held keys. Spam and archived items
  confer nothing: an airdropped "Office" NFT must not grant an office.
- ~~**1.3 The Association surface.**~~ `AssociationScreen` — Gateway Member card,
  offices, fellowship, credentials, communities, lapsed keys, then Agreements /
  Governance / Treasury / Settings. Reads the persisted snapshot, so it paints on the
  first frame and works offline.
- **1.4 Authority from keys, not usernames** — the derivation exists and is documented
  as **display only**. Still to do on the platform side: re-derive authority from
  on-chain ownership on every privileged call. A client can claim anything.

## Phase 2 — Property + Vault
- ~~**Vault organised as experiences.**~~ `src/vault/experiences.ts` + `VaultScreen` group
  everything openable into Library / Learning / Media / Documents / Software / AI /
  Passes. Kind decides the shelf, mime only breaks the ties kind leaves open. Anything
  that can't open isn't listed. **No backend needed.**
- **Still blocked on the platform:** deed served from the platform, ownership history,
  and vault delivery — the contract is already specified in `src/access/vault.ts`;
  implement it verbatim.
**The privacy policy change ships here** — see the launch checklist below.

## Phase 3 — Settlement
Orders, splits, settlement records, treasury allocation, multi-asset payment routing.
Must be idempotent and queued: a retried payment that double-settles is the worst bug
available in this system.

## Phase 4 — Ecosystem
Communities, Creator Studio, Governance (constitution, offices, treasury reports,
on-chain voting).

## Phase 5 — Estate + AI
Only after the estate primitive is chosen — and that choice has to be made much earlier
than this phase, because it determines whether Property can live in a plain wallet at all
(`ARCHITECTURE.md` §2, Challenge 4).

---

# Economics & compliance

## Compliance posture (decided)
- Holders receive **no revenue-share / no dividend**. Fees stay in the treasury.
- XGO framed as **governance + membership + utility**, not an investment. Buybacks/
  burns are **discretionary, not promised, and not marketed as "number go up."**
- This keeps XGO in the lower-risk lane. Still: **get counsel before any public
  sale, any direct staker payout, or any "earn" messaging.**
- **New:** the constitutional/deed language carries its own legal weight, separate from
  the token question. A member who believes a deed is legally enforceable property will
  act on that belief. Needs the same counsel.

## How XGO generates yield (a cut of real activity, not a paid APY)
1. **LP fees — protocol-owned liquidity (main engine).** Treasury owns the
   XGO/USDC pool; every trade pays fees to the treasury. Scales with volume.
2. **1.11% transfer fee (Token-2022, already live).** Every XGO transfer feeds the
   treasury. Scales with velocity.
3. **Treasury reserves in DeFi.** SOL/USDC → liquid staking (~8%) / lending (~5–10%).
   Grows the backing.
- Avoid **emissions** ("yield" by minting new XGO = dilution, not real yield).
- Flow to value: treasury earns → grows → discretionary buyback/burn → holders
  benefit **indirectly** (no direct payout → stays compliant).

## Financial yield — the safe way vs the risky way
- **Safe (recommended):** yield lives at the **treasury** (staking/lending/LP →
  buyback/burn). Everyone benefits indirectly; no custody program, no securities
  trigger.
- **Risky (gated on counsel):** direct yield paid to individual stakers. Needs a
  rewards distributor + custody program + a defined fee-share source, and it
  re-characterizes XGO toward a security. Do not ship without legal sign-off.

## Idea parked — treasury liquidity across multiple tokens
Let the **treasury be a liquidity provider / market-maker** for a curated set of
liquid, quality tokens it holds — earning LP fees on all of them.
- **Architecture:** no custom DEX needed. Treasury LPs on an existing DEX
  (Raydium/Orca/Meteora); the app's **Jupiter** swap already routes through those
  pools automatically, so the tokens become swappable for free.
- **Cautions:** yield needs **real trading volume** (abundant supply ≠ volume);
  **impermanent loss** means LP-ing tokens you're heavy in sells strength / buys
  weakness; pool only **quality, liquid** tokens; LP-ing XGO in size ≈ selling it
  (securities question resurfaces for own-issued tokens).
- **Build later:** a "Treasury liquidity" screen — add/remove liquidity on a DEX,
  track fees per pool. Timed with XGO launch + real volume.

---

# Launch checklist

## Before public launch
- **Privacy/legal sequencing.** The app currently tells users "we don't have servers
  that store your data." The first server-backed engine makes that false. The policy,
  the app-store data-safety disclosures and the data model must change in the **same
  release**, with `LEGAL_VERSION` bumped so every member re-accepts. This is the one
  mistake here a patch cannot repair.
- Fill `[LEGAL ENTITY]` and `[GOVERNING JURISDICTION]` in `src/legal/content.ts`, and
  host the privacy policy at a public URL (the app stores require one).
- **Move the treasury funds** off the old placeholder address (`AiNGsZZnrx…`).
- **Mint non-transferable key types as actually non-transferable** (Token-2022
  `NonTransferable`) — otherwise the restriction is decoration.
- **Choose the estate primitive** before Property ships broadly.
- **Security review** before community funds flow. Start with tiny amounts. Review the
  vault server against its own documented contract before it holds anything real.

## XGO launch
- Deploy XGO; set `XGO_MINT` (`src/solana/token2022.ts`) +
  `TREASURY_ADDRESS` (`src/config/treasury.ts`) to the live values.
- Set a dedicated RPC (Helius) — in Settings, or `EXPO_PUBLIC_MAINNET_RPC` at build time.
- Seed protocol-owned XGO/USDC liquidity; enable 1.11% fee harvest to treasury.
- Move off Expo Go → a **standalone signed build** (EAS → TestFlight/App Store).

## Scale (see `ARCHITECTURE.md` §9)
- **Put a read API in front of the chain.** Every device calling Helius/Jupiter/
  DexScreener directly does not survive a million members. The app's caching and
  fallback architecture already assumes one exists.
- CDN-backed vault delivery with signed URLs; ownership cached per (wallet, content).
- Index ownership from a webhook/geyser feed; verify on-chain only at grant time.

---

# Standing backlog
- SOL liquid staking (~8%) as a general "Earn" anchor.
- Treasury yield engine (deploy reserves → buyback/burn).
- Ecosystem screens: Impact, Marketplace, Map, Steward AI (need a lightweight
  backend/CMS + a Claude key proxy for the AI).
- Richer governance (real on-chain vote program), pre-sign tx simulation.
- Passkeys (the brief names them; today it's PIN + biometric).
- Audit log — a user-visible record of every signature the wallet has produced.
- `DevSettings.reload()` is dev-only, so a custom-RPC save silently needs a manual
  restart in release builds.
- No Android notification channel is ever created.
- Terra Classic staking (Phase 0 groundwork done: exhaustive chain dispatch).
- EVM activity parity · generic ConfirmSheet · cNFT burn · QR check-in.
- Ten screens still use the native `RefreshControl` indicator rather than `RefreshScroll`.
