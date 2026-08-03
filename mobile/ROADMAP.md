# XGO — Roadmap & Strategy Notes

Living notes on where the app is, how the economics work, and what's next.
Not legal advice — the token/treasury structure needs a securities/crypto attorney
before any of the financial pieces go live.

Architecture, the ten-section assessment, and the reasoning behind the phase order below
live in **`ARCHITECTURE.md`**. This file is the plan; that file is the analysis.

## Where it is now
- Gold/black XGO wallet, live as a **general exchange** (Jupiter swaps on Solana,
  KyberSwap on Ethereum/BSC). XGO's own features activate once XGO is listed.
- Tabs: Wallet · Swap · Keys · Ecosystem (treasury) · More
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

## Phase 0 — foundations (no backend needed)
Ships today, blocks nothing, and delivers most of the model's *felt* promise.
- **Signed agreement records.** Today acceptance is a single integer
  (`solwallet.legalAccepted.v1`) — it proves only that someone tapped Accept on this
  device. Replace with a signed, hashed, timestamped, append-only on-device record.
- **Deed parsing + property status.** Rights checklist, creator royalty, treasury
  assessment, expiration, agreement version — all already present in metadata
  attributes. Derive active / expiring / expired. Separate *policy* transferability
  (what the deed allows) from *technical* (what the token program allows).
- **Property language pass** — with the on-chain reality always one tap away
  (`ARCHITECTURE.md` §2, Challenge 2).

## Phase 1 — Identity (blocks every server-side engine)
- **1.1 Generalised wallet auth** — generalise `src/access/vault.ts` into
  prove-you-control-this-wallet-for-this-purpose. *Blocked on the platform shipping
  `/v1/auth/challenge` + `/v1/auth/verify`.*
- **1.2 Membership as a key type** — extend `CollectibleKind` to the constitutional set
  (Gateway Membership, Fellowship, Office, Community, Subscription, Credential,
  Property); derive standing from held keys. **No backend needed.**
- **1.3 The Identity surface** — membership, offices, credentials, communities,
  agreements, address/QR in one place. **No backend needed.**
- **1.4 Authority from keys, not usernames** — display only; the server must re-derive
  authority on every privileged call.

*Only 1.1 is blocked. If the auth endpoint is far out, ship 1.2 and 1.3 with Phase 0.*

## Phase 2 — Property + Vault
Deed served from the platform, ownership history, vault delivery (the contract is
already specified in `src/access/vault.ts` — implement it verbatim), vault organised as
experiences rather than folders.
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
