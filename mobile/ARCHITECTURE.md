# XGO Wallet — Architecture Assessment

> **This is the wallet's own assessment, not the system's definition.** The canonical description of
> what the ecosystem is and what it claims lives in the platform repo at `docs/ARCHITECTURE.md`.
> Where the two disagree, that file is correct and this one is out of date — in particular its §6
> is the only place key types are enumerated, §17 lists decisions still open, and §18 lists claims
> the system does not make.

An assessment of the wallet as it stands against the goal of becoming the member interface for a
constitutional digital ecosystem: identity, property, agreements, vault, settlement, community,
stewardship.

Written against commit history through the Keys rename. Paths are relative to `mobile/`.

**Reading this document:** §1 is what exists. §2 is what's missing and which assumptions in the
brief don't survive contact with the code. §3–§7 are what has to be built and by whom. §8 is the
order. §9–§10 are what breaks at scale and what must be true before launch.

---

## 1. Current Architecture Assessment

**26,623 lines across 170 files.** React Native / Expo 54, TypeScript strict, `tsc --noEmit` clean,
eslint at a known 14-problem baseline. This is a mature, well-factored wallet, not a prototype, and
the assessment below is about extending it rather than replacing it.

### What is strong and must be preserved

**Key custody — `src/wallet/vault.ts`.** Multiple independent seeds, each with derived accounts.
Secrets in `expo-secure-store` under `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so nothing is ever backed up
to a cloud. Every write path verifies by reading back, and refuses to overwrite existing seed
material, so a half-failed save can never silently return the wrong wallet. Legacy v1 single-wallet
storage migrates on first load and is then removed. Optional PIN hardening layered on top
(`src/wallet/lock.ts`).

This is the best code in the repository, and the brief's central promise — *the wallet privately
holds the keys, never the app* — is **already true today**. Nothing below should compromise it.

**The ownership-proof protocol — `src/access/vault.ts`.** Ask for a challenge → validate what we
were asked to sign → biometric confirm → sign → exchange the signature for a short-lived URL → open
in a custom tab. The signature never travels as a URL parameter.

The full server contract is documented in that file's header, including the mandatory verification
order, burning the nonce *on attempt* rather than on success, accepting collection-level grants, and
why the signed URL must not set cookies (iOS custom tabs share Safari's cookie jar, so a cookie
would outlive the session and let a stale login bypass the on-chain check). **This is the Vault
Engine's client half, already built and specified.** It is dormant only because no server answers it.

**Honesty infrastructure.** The codebase already refuses to state things it cannot prove:
- `assertNever` (`src/chains/registry.ts`) makes chain dispatch exhaustive — adding a chain kind
  produces a compile error at every site that must handle it.
- "Unknown is not zero" — `amount()` in `src/theme.ts` no longer rounds a real balance to `0`;
  `erc20Usd()` returns `null` rather than a confident `$0.00`; `priceUnavailableReason()` and
  `cachedLiquidity()` in `src/solana/prices.ts` distinguish *we measured and it's thin* from *we
  never managed to look*.
- The Ecosystem screen separates **on-chain** facts from **stated** policy.
- `Updating` cues say when cached data is being revalidated instead of letting a stale number look
  final.

Every engine below must inherit this discipline. It is the difference between a constitutional
system and a marketing surface.

**Security layers.** `src/security/reauth.ts` (biometric before any signing), `src/wallet/lock.ts`,
`src/safety/` (phishing blocklist, ERC-20 approval tracking and revoke, recipient risk scoring,
address labels), `PrivacyCover`, secret-screen protection.

**Caching architecture.** `src/cache/diskSnapshot.ts`, per-`(cluster, address)` wallet snapshots
(`src/wallet/snapshotCache.ts`), warm in-memory maps seeded at startup, RPC throttling
(`src/solana/rpcThrottle.ts`), and layered API fallbacks throughout. The app is already shaped to sit
behind a read API — see §9.

### What exists that maps onto the brief

| Engine | What exists today | Gap |
|---|---|---|
| **Identity** | address, `src/wallet/pubAddresses.ts`, SNS via `src/naming/resolve.ts` | no membership, office, credential, or delegated authority |
| **Agreement** | `src/legal/content.ts` + a **single integer**, `solwallet.legalAccepted.v1` | no signature, hash, timestamp, stored copy, or history |
| **Property** | `src/solana/collectibles.ts` — DAS `getAssetsByOwner` with a public-RPC fallback, kinds parsed from metadata, spam heuristics, archive/hidden, per-owner snapshots | no deed, rights, royalty, ownership history, or settlement record |
| **Vault** | `src/access/vault.ts` client + full contract; `src/access/resolve.ts` routes content to a custom tab or the in-app WebView | no server; no library/experience organisation |
| **Settlement** | `src/config/swapFee.ts` fee-side routing (`feeSideFor`) | the engine does not exist |
| **Treasury** | `src/config/treasury.ts`, `src/solana/treasury.ts`, `EcosystemScreen`, Squads multisig screens | read-only transparency; no allocation policy or project funding |
| **Governance** | `GovernScreen` — voting weight from XGO holdings and staking tiers (`src/config/staking.ts`) | no constitution, offices, proposals, or voting |
| **Community** | — | does not exist |
| **Creator Studio** | — | does not exist |
| **Estate** | — | does not exist |

### The finding that matters most

**The wallet is entirely serverless.** Every `EXPO_PUBLIC_*` variable is an RPC endpoint, a
third-party API key, or an address. All state lives on-device: `expo-secure-store` for secrets,
`AsyncStorage` for caches, roughly thirty versioned keys, no server database anywhere.

Two first-party services are *declared but dormant*: `EXPO_PUBLIC_VAULT_API` and
`EXPO_PUBLIC_NOTIFY_API`. Both are written so that an unset value is a working no-op rather than an
error — the right pattern, and the one new services should follow.

This is why almost everything in the brief is blocked on the same thing, and why the phase order in
§8 looks the way it does.

---

## 2. Missing Systems — and four assumptions worth challenging

Missing, in dependency order: **Agreement records → Property deeds → Vault service → Settlement →
Identity/membership → Communities → Creator Studio → Governance → Estate → AI.**

The brief asks us to challenge assumptions. Four don't survive contact with the code.

### Challenge 1 — the privacy promise breaks the moment this ships

`src/legal/content.ts` tells users, in the app, today:

> we don't run accounts, we don't have servers that store your data, and we never receive your keys
> or funds

Agreements with hashes and downloadable PDFs, Vault delivery, settlement records, communities, and
creator analytics **all require a server that stores member data**. The second clause of that
sentence becomes false on the day the first engine ships. (The first and third clauses can and
should stay true — wallet-based auth means no accounts, and no server ever touches a key.)

This is not a reason to stop. It is a sequencing requirement:

- The privacy policy, the app-store data-safety disclosures, and the data model change **in the same
  release**.
- `LEGAL_VERSION` is bumped so every member re-accepts (the gate already works this way —
  `getAcceptedLegalVersion()` in `src/security/prefs.ts` is compared against it).

Shipping the engine first and the policy later is the one failure mode here that a patch cannot
repair, because by then members will have transmitted data under a promise that it wouldn't be.

### Challenge 2 — "Property" language must not conceal the mechanics

Replacing NFT/mint/token with Property/Deed/Key is right. It is clearer, and it is closer to what
the thing actually is to a member.

But two things follow that the language cannot change:

1. **A "deed" implies legal protections a token does not carry.** A member who believes their deed is
   enforceable property will act on that belief — see §10.6.
2. **A transferable SPL NFT can be phished out of a wallet regardless of what the UI calls it.**

**Rule: the Property language is the surface, never the whole truth.** Keep "view on-chain" and the
mint address one tap away — the same on-chain-versus-stated discipline the Ecosystem screen already
models. A member who cannot see the mechanism cannot protect themselves from it.

**Corollary — the wallet cannot enforce non-transferability.** Hiding a Send button *states the
agreement*; it does not lock the asset. Anyone can move a plain SPL NFT with any other wallet or a
CLI. Real enforcement is Token-2022's `NonTransferable` extension, a programmable NFT with a rule
set, or a soulbound design — decided **at mint time, on the issuing side**. The key types the model
marks non-transferable (Gateway Membership, Fellowship, Office, Credential) must be minted that way
or the restriction is decoration. `src/access/vault.ts` already documents the general form of this
concern: a gate that can be walked around is theatre.

### Challenge 3 — "Never ask for a seed phrase" versus self-custody

Read literally, this forbids `ImportWallet`, which any self-custodial wallet must have. The
defensible rule is narrower and should be stated that way:

> **Never ask for a seed phrase in order to authenticate, and never transmit one.**

Import stays. The app should say plainly, in the import flow, that no XGO service will ever ask for
a recovery phrase — which is both true and the single most useful anti-phishing sentence available.

### Challenge 4 — Estate is the hardest thing in the brief

Inheriting a self-custodial wallet requires one of three primitives, and each fails differently:

| Primitive | Failure mode |
|---|---|
| Shamir / social recovery | shares are lost, or colluding holders steal early |
| Smart-contract dead-man switch | timer fires while the member is alive, or never fires |
| Custodial escrow | breaks self-custody, which is the point of the system |

"Design now, implement later" therefore means **choosing the primitive now**, because the choice
determines whether Property must live in a program-owned account rather than a plain wallet. That
reaches back into Property, Vault, and Settlement, so it cannot be deferred to the end without
rework.

---

## 3. Required Database Changes

**The wallet needs no database.** It needs the platform to have one. What follows is the contract the
wallet requires, not a schema for globalgoshens.org — that needs three answers first (§7, end).

Core entities:

- **Agreement** — id, version, body hash, effective date.
  **Acceptance** — wallet, agreement id, version, the exact message signed, signature, hash,
  accepted-at. **Append-only**: per the brief, nothing disappears.
- **Property** — mint, creator, template, deed terms, royalty model, vault content reference.
  **OwnershipEvent** — append-only history. The chain is truth; this is an index of it.
- **SettlementRecord** — order, price, asset, the creator/treasury/seller split, transaction
  signature. Idempotency key (§9).
- **VaultContent** — encrypted object reference, mime, and which property grants access. **Never the
  file itself in the database.**
- **Community**, **Membership**, **Office**, **Credential** — all keyed by **wallet address, never a
  username**.

**Non-negotiable:** the database indexes and serves; **the chain remains the authority on
ownership.** If the two disagree, the chain wins and the index is wrong. Any design in which the
database is the source of truth for ownership recreates exactly the platform-owns-your-account
problem this ecosystem exists to solve.

---

## 4. Required Smart Contract Changes

Mostly avoidable, and that is the recommendation. Metaplex and Token-2022 already cover most of the
model.

- **Token-2022 `NonTransferable`** for membership, fellowship, office and credential keys (§2,
  Challenge 2). Without this the non-transferability in the model is advisory only.
- **Metaplex `sellerFeeBasisPoints` + creators array** for royalty; deed terms in metadata
  attributes, which `src/solana/collectibles.ts` already surfaces as `attributes[]`.
- **Programmable NFTs / rule sets** — only if royalty enforcement must be on-chain rather than
  marketplace-honoured. This is a real trade-off: rule sets constrain which marketplaces can trade
  the asset at all.
- **A custom program is genuinely needed only for** on-chain settlement splitting in a single atomic
  transaction, and estate transfer rules. Both are Phase 3+; neither should gate launch.

Everything else — templates, analytics, listings, pricing — is off-chain and should stay off-chain.
Putting it on-chain buys nothing and costs upgradeability.

---

## 5. Required UI Changes

- **Home stops being a token screen.** Today it is balance plus asset list. It becomes Property,
  Communities, Vault, Agreements — with holdings still reachable, because members do hold and swap
  tokens and hiding that helps nobody.
- **Keys → Property**, with the deed as a first-class panel (rights checklist, creator royalty,
  treasury assessment, expiration, agreement version) and an active / expiring / expired status.
  Parseable from metadata today, with no backend.
- **Agreements screen** — every agreement, its version, date accepted, signature, hash, a verify
  action, and a download.
- **Vault organised as experiences** — Library, Learning, Media, Documents, Credentials, Estate —
  not folders.
- **Creator Studio**, **Communities**, **Governance** (constitution, offices, treasury reports) —
  new surfaces, all downstream of the engines above.

Reuse throughout rather than rebuilding: `Card`, `Button`, `EmptyState`, `ScreenHeader`, `HeroCard`,
`KeysGallery`, `Skeleton`, `Updating`, `RefreshScroll`, `HoldToConfirm`, `ReceiveSheet`.

---

## 6. Required Security Improvements

1. **Passkeys.** The brief names them; today the app has a PIN plus `expo-local-authentication`.
   Passkeys are also the cleanest platform-auth primitive that never touches the seed.
2. **Signed agreement acceptance.** Today's integer proves nothing — it records only that *someone*
   tapped Accept on this device. A signature over the document hash proves *which wallet* agreed to
   *exactly which text*, and it works offline, on-device, with no backend. Reuse `signMessageUtf8`
   (`src/solana/signMessage.ts`) and `requireReauth` (`src/security/reauth.ts`).
3. **Generalise `challengeIsSafe`.** That function in `src/access/vault.ts` — refuse to sign anything
   not bound to our wallet, this asset, and the configured domain — is the single most important
   security primitive in the repository. It must apply to *every* platform challenge, not only vault
   unlock. Without it, a compromised or hostile server can hand back a login challenge for some other
   site and harvest a valid signature for it.
4. **Vault URL hygiene.** Fully specified already in `src/access/vault.ts`; the server must honour it
   — no cookies, token in the URL *fragment*, TTL ≤ 300s to first byte, never log the full URL.
5. **Audit log.** A user-visible record of every signature the wallet has produced, and for what.
6. **High-value confirmation.** `HoldToConfirm` exists for swaps; extend it to property transfers.
7. **Android notification channel.** Still never created — a standing bug, not a new requirement.

---

## 7. Recommended API Structure

`/v1/` on a vault-controlled host. **Wallet-authenticated: no accounts, no passwords, no usernames.**

| Endpoint | Purpose |
|---|---|
| `POST /v1/auth/challenge`, `POST /v1/auth/verify` | generalised from the existing vault challenge; returns a short-lived session token bound to the wallet |
| `GET /v1/property/:mint`, `GET /v1/property?owner=` | deed terms, royalty, ownership history. An index, not the truth |
| `POST /v1/access/challenge`, `POST /v1/access/grant` | **already fully specified** in `src/access/vault.ts` — implement that contract verbatim; its verification order is correct and the order matters |
| `GET /v1/agreements`, `POST /v1/agreements/accept` | accept carries the wallet signature; append-only |
| `GET /v1/settlement?wallet=` | settlement records |
| `GET /v1/treasury/*`, `GET /v1/communities/*` | transparency and community data |

Design rules:

- **Every response cacheable to disk.** The app's snapshot pattern assumes it, and it is what makes
  a cold open paint instantly.
- **Every endpoint degrades** to on-chain or cached data rather than an error screen.
- **The server never holds a private key and never asks for one.**

**Three answers needed from globalgoshens.org before any of §3 or §7 becomes real schema:** what
stack is it on, is member identity already account-based (it must become wallet-based), and what
content storage exists today.

---

## 8. Development Roadmap (dependency-ordered)

### Phase 0 — foundations. No backend needed.

Everything here ships today and blocks nothing.

- **Signed agreement records.** Replace the `solwallet.legalAccepted.v1` integer with a signed,
  hashed, timestamped, append-only on-device record (§6.2). This alone converts the Agreement Engine
  from a claim into something verifiable.
- **Deed parsing and property status.** Parse the deed from metadata attributes: rights checklist,
  creator royalty, treasury assessment, expiration, agreement version. Derive active / expiring /
  expired. Separate *policy* transferability (what the deed allows) from *technical* transferability
  (what the token program allows — today's `Collectible.transferable`).
- **Property language pass** across the UI, subject to Challenge 2.

### Phase 1 — Identity. Blocks every server-side engine.

- **1.1 Generalised wallet auth** (`src/access/siws.ts`) — generalise `src/access/vault.ts` from
  "prove you own this mint, unlock this content" to "prove you control this wallet, for this domain,
  for this purpose" → a short-lived session token. This is a refactor of proven code: the challenge →
  validate-before-signing → biometric → sign → exchange sequence already exists with the verification
  order right, and `challengeIsSafe` becomes the general rule. Session token in memory only — a
  session that outlives the app is a liability. Vault unlock then becomes one *purpose* of this
  primitive rather than a parallel implementation.
  **Blocked on the platform shipping `/v1/auth/challenge` and `/v1/auth/verify`.**
- **1.2 Membership as a key type** — extend `CollectibleKind` from
  `ticket | membership | book | portal | file | art` to the constitutional set: Gateway Membership,
  Fellowship, Office, Community, Subscription, Credential, Property. The `assertNever` discipline
  turns this into a compile error at every dispatch site, which is exactly the verification technique
  used for the chain work. Then `src/identity/membership.ts` derives standing from held keys as a
  pure function over the collectibles snapshot. **No backend needed.**
- **1.3 The Identity surface** — membership standing, offices, credentials, communities, agreements,
  address/QR, in one place. Assembles from data already loaded plus the tier logic in
  `src/config/staking.ts`. **No backend needed.**
- **1.4 Authority from keys, not usernames** — a permission helper derived from held office and
  membership keys, deciding what the app shows. **Display only, and it must be labelled as such:**
  the server re-derives authority from on-chain key ownership on every privileged call, or this is
  the same theatre as hiding a Send button on a transferable NFT.

**Sequencing note:** only 1.1 is blocked on the platform. If the auth endpoint is far out, 1.2 and
1.3 should ship alongside Phase 0 rather than waiting behind it.

### Phase 2 — Property + Vault

Deed served from the platform, ownership history, vault delivery (implement the documented
contract), vault organised as experiences. **The privacy policy change ships here** (§2, Challenge 1).

### Phase 3 — Settlement

Orders, splits, settlement records, treasury allocation, multi-asset payment routing.

### Phase 4 — Ecosystem

Communities, Creator Studio, Governance.

### Phase 5 — Estate + AI

Only after the estate primitive is chosen (§2, Challenge 4) — and that choice must be made much
earlier than this phase.

---

## 9. Scalability at one million users

- **The blocker is RPC, not the app.** Every device calls Helius, Jupiter, DexScreener and
  GeckoTerminal directly. At a million members that is both unaffordable and rate-limited. **Put a
  read API in front of the chain.** The app's caching, snapshot and fallback architecture already
  assumes one exists — this is the single highest-leverage infrastructure change.
- **Vault delivery must be CDN-backed** with signed URLs. Ownership verification is the only hot path
  that has to touch the chain, and it should be cached per `(wallet, content)` with a short TTL.
- **Ownership indexing.** Do not verify on-chain per request at scale. Index from a webhook or geyser
  feed, and verify on-chain only at grant time — which the documented contract already does, at a
  recent slot.
- **Settlement must be idempotent and queued.** A retried payment that double-settles is the worst
  bug available in this system: it moves real money, twice, and the member is right to never trust it
  again.
- **Push.** `EXPO_PUBLIC_NOTIFY_API` exists but is dormant; per-address fan-out needs a real worker.

---

## 10. Recommendations before public launch

1. **Fix the legal/privacy sequencing** (§2, Challenge 1). The one irreversible mistake available.
2. **Fill the placeholders.** `[LEGAL ENTITY]` and `[GOVERNING JURISDICTION]` in
   `src/legal/content.ts`, and host the privacy policy at a public URL — the app stores require one.
3. **Move the treasury funds** off the old placeholder address (`AiNGsZZnrx…`) to the live treasury.
4. **Mint the non-transferable key types as actually non-transferable** (§2, Challenge 2).
5. **Choose the estate primitive** before Property ships broadly (§2, Challenge 4).
6. **Decide what "constitutional" commits you to legally.** Deeds, offices, fellowship and
   stewardship language carries real-world weight. A member who believes a deed is legally
   enforceable property will act on that belief, and the gap between the language and the legal
   reality is the ecosystem's largest non-technical risk. This needs a lawyer, not an architect.
7. **Security review of the vault server against its own documented contract** before it holds
   anything real.
8. **Do not ship ten engines.** Phase 0 alone — signed agreements, real deeds, honest property
   status — delivers most of the model's *felt* promise with no backend and no new risk surface.
   Ten engines shipped at once is how this fails.
