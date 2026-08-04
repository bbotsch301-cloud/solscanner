# Platform API contract

What the wallet needs from the Goshen platform, stated exactly enough to implement against.

> **§1–2 are built.** `POST /v1/auth/challenge` and `POST /v1/auth/verify` are live on the platform
> and consumed by `src/access/siws.ts`. Three deliberate deviations, each argued at its call site in
> the platform code: the nonce burns at lookup rather than after signature verification (stricter);
> the composed message is stored verbatim and compared byte-for-byte rather than re-derived
> (recomputation was a real bug there); and the server imposes its own domain and validates the
> cluster, rather than echoing what a caller sends. Paths carry the platform's `/_api` prefix, so
> set `EXPO_PUBLIC_VAULT_API` to include it.
>
> The canonical description of the wider system lives in the platform repo at
> `docs/ARCHITECTURE.md`; this file stays authoritative for the endpoint shapes themselves.

The division: **the web app facilitates** (marketplace, communities, creation, delivery); **the
wallet holds the keys** and never gives them up. Every endpoint below is designed so the server
proves things about a member without ever possessing anything that could impersonate them.

`access/vault.ts` already specifies the vault endpoints in its own header, down to verification
order. **That specification is authoritative** — implement it verbatim; §3 here only summarises it.

Readable from anywhere:
`raw.githubusercontent.com/bbotsch301-cloud/solscanner/<branch>/mobile/API-CONTRACT.md`

---

## 0. Rules that apply to every endpoint

1. **No accounts, no passwords, no usernames.** The wallet address is the identity. There is nothing
   to register and nothing to reset.
2. **The chain is the authority on ownership.** Every table below is an *index* of on-chain truth.
   If the two disagree, the chain wins and the index is stale. A design where the database is the
   source of truth for ownership recreates the platform-owns-your-account problem this ecosystem
   exists to solve.
3. **The server never holds a private key and never asks for one.** No endpoint accepts a seed
   phrase, ever, for any reason.
4. **Every response must be cacheable to disk.** The wallet paints from a snapshot on first frame;
   an endpoint that can't be cached shows a member a spinner where a number should be.
5. **Every endpoint degrades.** On 5xx or timeout the wallet falls back to on-chain or cached data
   rather than an error screen. Don't design flows that require the server to be up.
6. **Bearer tokens, never cookies.** iOS custom tabs share Safari's cookie jar, so a cookie both
   outlives the session and lets a stale browser login bypass checks entirely. This is not a
   preference.

---

## 1. `POST /v1/auth/challenge` — start proving control of a wallet

**This is the blocking dependency for everything else.** Until it exists, the wallet cannot
authenticate to the platform at all.

```
req  { wallet, domain, purpose, cluster }
200  { challengeId, nonce, domain, message, issuedAt, expiresAt }
400 malformed · 429 rate_limited
```

**The server composes `message`.** The client never assembles it — that's how the two sides drift
and how a signature ends up meaning something other than what was displayed. Canonical form
(SIWS-shaped, so a wallet-standard `signIn` can reuse it later):

```
{domain} wants you to sign in with your wallet.

Wallet: {base58 pubkey}
Purpose: {purpose}
Chain: solana:{cluster}
Nonce: {nonce}
Issued At: {ISO8601}
Expiration Time: {ISO8601}
Request ID: {challengeId}
```

Store `challengeId → { wallet, nonce, purpose, issuedAt, expiresAt, used: false }`, **TTL 120s**.

`purpose` is a short stable string (`sign-in`, `marketplace`, `community:{slug}`). It appears in the
signed text so a signature obtained for one purpose can't be replayed for another.

> **What the wallet does with this before signing:** it refuses any message not containing
> `Wallet: <its own pubkey>`, the configured domain, and the stated purpose. A compromised or
> hostile server handing back a login challenge for some other site gets nothing. See
> `challengeIsSafe` in `access/vault.ts` — the same discipline generalises here.

## 2. `POST /v1/auth/verify` — exchange a signature for a session

```
req  { challengeId, message, signature (base58), publicKey (base58) }
200  { token, expiresAt, wallet }
400 malformed · 401 bad_signature · 409 nonce_used · 410 challenge_expired · 429 rate_limited
```

**Verify in this order. All steps mandatory, order included.**

1. Look up `challengeId` — **410** if missing or expired, **409** if already used.
2. **Re-derive the expected message from your own stored fields** and compare byte-for-byte to the
   submitted `message`. *Never parse the client's text and trust the parts.* This single step is
   what stops a caller signing a message of their own choosing and having you accept it.
3. `publicKey === stored.wallet`.
4. `ed25519.verify(signature, utf8(message), publicKey)` — **401** on failure.
5. **Mark `used = true` before issuing the token** — burn on attempt, not on success. A failure
   after this point must not leave a replayable nonce.
6. Issue the token.

**Token rules.** Short-lived (≤15 minutes), bearer, bound to the wallet address, opaque or a signed
JWT — the wallet doesn't inspect it. **No refresh tokens:** a refresh token is a long-lived
credential, and the entire point of this design is that the key is the credential. Expiry means
re-challenging, which costs one biometric prompt and is the correct trade.

### 2.1 Authority is re-derived, never trusted from the token

A token proves *which wallet* is calling. It proves nothing about what that wallet may do.

**Every privileged call must re-derive standing from on-chain ownership at a recent slot** —
membership, office, fellowship, credential, community. The wallet derives the same thing locally
(`src/identity/membership.ts`) but that derivation is **display only**, and is documented as such in
its own header. A key can be sold, burned, or lapse between one screen and the next, and a client
can claim anything.

Baking a role into the token at issue time is the failure mode to avoid: it makes standing
survivable past the loss of the key that granted it.

### 2.1 Signing in on a desktop, from the phone

A desktop browser has no wallet. Rather than a second auth scheme, the phone signs and the desktop
collects the result:

```
POST /v1/auth/link            -> { linkId, expiresAt }      the desktop creates it, renders a QR
POST /v1/auth/link/:id/complete                             the phone posts the /verify body here
GET  /v1/auth/link/:id        -> { token, expiresAt, wallet }  the desktop claims it, ONCE
```

Rules, all of which fall out of things already true elsewhere in this document:

- `complete` takes **exactly** the `/v1/auth/verify` body and runs **exactly** the §2 verification in
  the same order — re-derive the message from stored fields, compare byte-for-byte, burn the nonce on
  attempt. Do not fork the verifier; two copies of that sequence is how one of them ends up missing a
  step.
- The claim is single-use and atomic, with the `usedAt IS NULL` guard in the UPDATE's WHERE clause
  rather than a read-then-write. `consumeLoginToken` is the existing shape.
- **The QR carries the domain**, because the wallet refuses to sign a message that does not name its
  configured one (§1). That check is the whole reason a QR is not a phishing primitive, and it only
  works if the domain is in the payload for the phone to compare.
- The phone never receives or transmits the desktop's token. It signs; the server hands the session
  to whoever created the link.
- A link that is never claimed expires. `linkId` is unguessable, the TTL matches the 120s challenge,
  and both creation and claiming are rate-limited.

---

## 3. Vault access — `POST /v1/access/challenge`, `POST /v1/access/grant`

**Fully specified in the header of `mobile/src/access/vault.ts`. Implement that, not this summary.**

It already covers the verification order, accepting collection-level grants rather than per-mint
only, and the signed-URL requirements. The parts most often got wrong:

- **Burn the nonce before the ownership check**, not after.
- Signed URL TTL **≤300s to first byte**, and **expiry-only rather than single-use** for anything
  served inline. This clause used to say "single-use for pdf/epub/download" and it was wrong — see
  the correction below. Keep single-use only for a true attachment download, where one fetch is the
  whole transaction.
- **Must not set cookies** (see §0.6).
- Carry the token in the URL **fragment** so it stays out of server, CDN and Referer logs.
- `Cache-Control: private, no-store` · `X-Content-Type-Options: nosniff` · `Referrer-Policy: no-referrer`.
- **Never log the full URL.**

A refusal must return a distinguishable status (403 not_owner) rather than a generic error — the
wallet surfaces refusals to the member instead of silently falling back to the public link, because
a gate that opens on failure is theatre.

**Requested addition:** include a `reason` field on 403 (`not_owner` | `agreement_inactive` |
`membership_invalid` | `expired`) so the wallet can say *which* of the four checks closed. Today
every refusal collapses into one message.

### 3.1 Correction: single-use links broke reading, and this document caused it

An earlier version of this contract asked for single-use links on pdf and epub. The server
implemented that faithfully, and the result is a reader that dies the moment it reconnects: the
first GET burns the token, so backgrounding the app and returning gives a **404** — inside the
300-second window, from the wallet that had just proved ownership, indistinguishable from a forged
link. For a two-hour course it means starting over.

**Anything being read must survive repeated GETs for as long as its grant lives.** A grant is
already scoped by wallet, asset and expiry; single-use added nothing to that and cost the feature.

Two things follow, and the second is independent of the first:

- **Honour `Range`, or stop sending `Accept-Ranges`.** Advertising a capability that isn't
  implemented is worse than not having it — a player seeking a video silently re-downloads from byte
  zero and merely looks slow, which is the hardest class of bug to notice.
- **Keep a dead link indistinguishable.** Spent, expired and never-existed must stay one 404. That
  part was right.

The wallet caches a grant for exactly its stated lifetime (`access/entitlement.ts`) so a member does
not re-sign to turn a page. Until the server is expiry-only it treats a document grant as spent
after one use, because handing back a burned link produces the very 404 it is avoiding.

---

## 4. Property — `GET /v1/property/:mint`, `GET /v1/property?owner=`

An **index**, not the truth (§0.2). The wallet already parses the deed from on-chain metadata
(`src/property/deed.ts`) and will keep doing so; this endpoint adds what the chain can't hold
cheaply — ownership history, settlement records, and the current royalty schedule.

```
200 { mint, deed?, creator, ownershipHistory[], settlementRecords[], vaultContentRef? }
404 unknown_property
```

**Deed field names must match what the wallet already parses**, or the two disagree about the same
asset. The parser is tolerant (case/space/underscore-insensitive, with aliases) but the canonical
set is: `Creator`, `Issued`, `Rights`, `Resale Allowed`, `Royalty Model`, `Creator Royalty`,
`Treasury Assessment`, `Vault Access`, `Updates`, `Expiration`, `Agreement Version`.

**Rights are tri-state.** Granted, denied, or *unstated* — and unstated must not be serialised as
`false`. "The deed forbids commercial use" and "the deed is silent on commercial use" are different
statements, and the wallet renders them differently on purpose.

---

## 5. Agreements — `GET /v1/agreements`, `POST /v1/agreements/accept`

```
GET  200 { agreements: [{ id, title, version, hash, effectiveAt, body }] }
POST req { agreementId, version, hash, message, signature, publicKey }
     200 { recordedAt }
     400 malformed · 401 bad_signature · 409 hash_mismatch
```

- **Append-only.** A new version appends a record; it never replaces one. Nothing is ever deleted —
  an agreement a member is no longer under is still one they were once under.
- `hash` is **sha256 of the exact document text**. Reject on mismatch (**409**): if the member's
  hash differs from yours, they agreed to different words than you're storing, and recording it as
  agreement to yours would be false.
- Verify the signature exactly as in §2, steps 2–4 — re-derive, compare, verify.
- The wallet already produces these records locally (`src/agreements/record.ts`) with the message
  format `acceptanceMessage()` composes. Mirror it or accept the wallet's, but don't invent a third.

---

## 6. Settlement — `GET /v1/settlement?wallet=`, and the write path

Read is straightforward. The write path has one requirement that outranks everything else:

> **Settlement must be idempotent and queued.** A retried payment that double-settles is the worst
> bug available in this system — it moves real money, twice, and the member is right never to trust
> it again. Every order carries a client-supplied idempotency key; a repeat of the same key returns
> the original result rather than settling again.

Splits come from the deed, not from hard-coded constants. The current model is creator royalty
(deed-stated) + treasury 1% + burn 0.11%, and that 1.11% matches `XGO_FEES` in
`src/config/xgo.ts` — but the deed is authoritative per-asset, and the platform limit is 0–25% on
creator royalty. The burn applies only when settlement is denominated in XGO, since it's the
Token-2022 transfer fee rather than a platform charge.

---

## 7. Scale

At a million members the blocker is RPC, not the app. Every device currently calls Helius, Jupiter,
DexScreener and GeckoTerminal directly, which is neither affordable nor rate-survivable.

**A read API in front of the chain is the highest-leverage thing the platform can build after
auth.** The wallet's caching, snapshot and fallback architecture already assumes one exists.

Ownership verification is the only hot path that must touch the chain. Index from a webhook or
geyser feed, cache per `(wallet, content)` with a short TTL, and verify on-chain only at grant time
— which the vault contract already does, at a recent slot.

---

## 8. Order of implementation

1. **`/v1/auth/challenge` + `/v1/auth/verify`** — blocks everything. Nothing else can start.
2. **`/v1/access/*`** — turns on vault delivery; the wallet client is already written and dormant.
3. **`/v1/agreements`** — the wallet already records and signs locally; this makes it durable.
4. **`/v1/property`** — ownership history and settlement records.
5. **Read API in front of the chain** (§7).
6. **`/v1/settlement`** — after the marketplace exists to produce orders.

**Before any of it ships:** the app's privacy policy currently tells members *"we don't have servers
that store your data."* The first server-backed engine makes that false. The policy, the app-store
data-safety disclosures and the data model must change in the **same release**, with
`LEGAL_VERSION` bumped so every member re-accepts. See `ARCHITECTURE.md` §2, Challenge 1 — it's the
one mistake here that a patch cannot repair.
