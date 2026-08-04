# Device test checklist

Everything built in this session that can only be confirmed on a real device. `tsc`, eslint and the
automated suite all pass — none of that proves a screen renders or a haptic fires.

Each item says what to do, what right looks like, and **what would mean it's broken**, so a "looks
fine" is a real result rather than a shrug.

## Before the device: `npm test`

There is an automated suite now (`vitest`), covering the pure logic where a quiet mistake is
invisible and permanent:

- **`property/keyCopy/crypto.test.ts`** — the format that seals members' purchased books and video.
  Reordered chunks, chunks spliced in from another file, a truncated file passed off as complete, a
  renamed file, a tampered header. Every one of those decrypts *cleanly* under a naive
  implementation, which is why a round-trip test is not enough and these construct the broken states
  deliberately. The file records which defence catches which attack — measured by removing each in
  turn, not assumed.
- **`walletconnect/walletconnect.test.ts`** — that a signature returned to a dApp belongs to this
  wallet rather than whoever is at index 0, and that a request is refused when the session was
  approved for a different account.

Run it before touching a device. Nothing below is worth doing if this is red.

---

## Blocking prerequisite — mint test assets

**Most of the Property and Association work is invisible without assets that carry deed traits.** A
wallet holding only ordinary NFTs will show no deed panel and no standing, and that is correct
behaviour, not a bug. Before testing sections 1–3, mint at least:

| Asset | Traits to set |
|---|---|
| A book | `Type: Book`, `Creator`, `Issued: <date>`, `Rights: Personal Use`, `Resale Allowed: Yes`, `Royalty Model: 10% to Creator`, `Treasury Assessment: 1%`, `Vault Access: Lifetime`, `Updates: Included`, `Agreement Version: 1.0` |
| A non-transferable credential | `Type: Credential`, `Resale Allowed: No`, `Expiration: Never` |
| A Gateway Membership | `Type: Membership`, `Issued: <date>` |
| An expired subscription | `Type: Subscription`, `Expiration: <a past date>` |
| An office | `Type: Office` |

Trait names are matched case/space/underscore-insensitively with aliases, so `creator_royalty`,
`Creator Royalty` and `Royalty` all work.

---

## 1. Property Deed

- [ ] Open the test book. **A "Property Deed" card renders** with a rights checklist, creator
      royalty, treasury assessment, issue date, and agreement version.
- [ ] **Unstated rights are absent, not crossed.** The book above never mentions commercial or
      printing rights — those rows should not appear at all. *A red ✗ beside "Commercial rights"
      means the tri-state collapsed to a boolean, which is the exact bug this was built to avoid.*
- [ ] Traits that aren't deed fields still appear as chips **below** the deed. Nothing shown twice,
      nothing missing.
- [ ] Open an ordinary art NFT: **no deed panel at all**, chips exactly as before.
- [ ] `Royalty Model: 10% to Creator` reads as **10%**, and `Treasury Assessment: 1%` as **1%** —
      not 1000% or 0%.
- [ ] `0.11%` (the burn share) shows as **0.11%**, not rounded to 0%.

## 2. Property status and transfer

- [ ] The expired subscription shows an **"Expired" badge** in the Property grid and a status line
      on its detail screen — and is **still openable**. *Disappearing from the grid is a failure:
      it's still owned.*
- [ ] Something expiring within 7 days shows **"Expires soon"** in amber.
- [ ] The non-transferable credential offers **no Send button**, with wording that says its *deed*
      doesn't permit transfer. *Any wording claiming the item "cannot be transferred" is wrong —
      the wallet can't enforce that.*
- [ ] An ordinary transferable NFT still sends normally.

## 3. Property / Credentials split

- [ ] The tab reads **Property** with a library icon (not Keys, not a bag).
- [ ] Books, art, files and tickets appear in the main grid; membership, fellowship, office,
      credential and community appear under a **Credentials** heading below it.
- [ ] **Nothing vanished.** Count the items before and after — every asset lands in exactly one of
      Property / Credentials / Archived / Hidden.
- [ ] Archive a credential → it moves to Archived, not to limbo. Restore works.
- [ ] Hidden still collapses spam.

## 3b. Property filters

- [ ] The filter row appears above the grid **only when there's more than one category held** —
      a single-category wallet shows no chips, which is correct.
- [ ] **Every chip returns something.** Filters are built from what's actually held, so tapping any
      one must never produce an empty grid. *An empty result means the derivation broke.*
- [ ] The item count above the grid **matches what's on screen** when a filter is active — not the
      unfiltered total.
- [ ] Credentials stay visible below regardless of the filter (they're standing, not property).
- [ ] Search and filter compose: filter to Books, then search — you get books matching the query.

## 4. Association (More → Association)

- [ ] With a Gateway Membership held: **gold member card**, "Member since <date>", and a standing
      count.
- [ ] Without one: a plain "No Gateway Membership held" card explaining standing comes from keys.
      *An empty screen or a spinner would read as breakage.*
- [ ] Offices, Fellowship, Credentials, Communities each list only their own kind.
- [ ] The expired one appears under **Lapsed**, not under its own section.
- [ ] **The one that matters most:** an airdropped spam "Office" NFT must confer **nothing** — no
      office row, not counted. If a junk airdrop grants standing, stop and tell me.
- [ ] Agreements / Governance / Treasury / Account settings all navigate correctly.

## 4b. Vault (More → Vault)

- [ ] Experiences appear with counts — Library, Learning, Media, Documents, Software, AI, Passes —
      and **only the ones you actually hold something in**.
- [ ] Tapping a row expands it in place; tapping again collapses. No drill-down screen.
- [ ] **Everything listed opens.** Tap through a few — anything that can't open shouldn't have been
      listed. *A row that leads nowhere means the access check was skipped.*
- [ ] Membership / office / fellowship / credential do **not** appear here. They're standing, and
      they live on Association.
- [ ] Search spans all experiences and auto-expands matches.
- [ ] With nothing openable held: "Nothing in your vault yet", not an empty scroll.

## 5. Agreements (Association → Agreements)

- [ ] On a fresh install, accept the legal gate → **Agreements lists Terms and Privacy**, each with
      a version, date, and SHA-256.
- [ ] Those first records show **"Unsigned"** with an explanation — expected, no wallet existed yet.
- [ ] Tap **Sign with this wallet** → biometric prompt → both flip to **"Signed"** with a signature.
- [ ] **Decline the biometric prompt** → nothing changes, no crash, records stay unsigned.
- [ ] Tapping the hash or signature copies it.
- [ ] "Read the document" opens the right document.

## 6. Swap slider haptics

- [ ] Drag the percentage slider slowly. **A light tick every 5%**, and a **firmer bump at 25 / 50 /
      75 / MAX**.
- [ ] Drag fast end to end. It should still feel like texture — *if it buzzes continuously or the
      feedback lags behind your finger, `DETENT` in `SwapScreen.tsx` needs raising.*
- [ ] Judgement call for you: **is 5% the right spacing in the hand?** One number to change.
- [ ] Tapping the 25/50/75/MAX chips still works and doesn't double-buzz.

## 7. Pull-to-refresh and tab icons (from earlier in the session)

- [ ] Pull down on Wallet: **exactly one gold spinner**, in the space above the content. *Two
      spinners, or a grey system one, means the RefreshControl removal regressed.*
- [ ] Kill and relaunch the app several times: **tab icons render every launch**. *Blank glyphs on
      any launch means the icon font isn't being awaited at startup.*
- [ ] Swap screen: tapping the token picker still opens it rather than only dismissing the keyboard.

## 8. Pricing (still unconfirmed)

- [ ] **pepeAI** — does it now show a dollar value in the Wallet list? GeckoTerminal was added as a
      third price tier specifically for tokens Jupiter and DexScreener both miss.
- [ ] If it's still unpriced, open its token screen and report **which** of these it says:
      `No market · only $N pooled liquidity` (thin pool, refused on purpose) ·
      `Price unavailable · $N pooled liquidity` (a parser gap — my bug) ·
      `No price source found` (no pool anywhere).
- [ ] The Wallet total and the token screen **agree**. A holding valued on one screen and dashed on
      the other is the bug that was fixed.

## 9. Regressions to rule out

- [ ] Send, Receive, Swap and the treasury view all behave as before.
- [ ] Burn on a spam NFT still reclaims rent.
- [ ] Post-swap "Received" notification fires.
- [ ] Activity rows still say what moved.
