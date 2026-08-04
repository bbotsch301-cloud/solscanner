# Device test checklist

What can only be confirmed on a real device. `tsc`, eslint and the automated suite all pass — none of
that proves a screen renders, a haptic fires, or that a sentence makes sense to someone who has never
held a wallet.

Each item says what to do, what right looks like, and **what would mean it's broken**, so a "looks
fine" is a real result rather than a shrug.

**Section A is the current backlog: eleven commits, none of which has run anywhere.** Section B is
older work that has been confirmed before and is worth a second pass because the navigation around it
moved.

## Before the device: `npm test`

39 tests, covering the pure logic where a quiet mistake would be invisible and permanent:

- **`property/keyCopy/crypto.test.ts`** — the format that seals members' purchased books and video.
  Reordered chunks, a chunk spliced in from another file, a truncated file passed off as complete, a
  renamed file, a tampered header. Every one of those decrypts *cleanly* under a naive
  implementation, which is why a round-trip test is not enough. The file records which defence
  catches which attack, measured by removing each in turn rather than assumed.
- **`walletconnect/walletconnect.test.ts`** — that a signature returned to a dApp belongs to this
  wallet rather than whoever sits at index 0, and that a request is refused when the session was
  approved for a different account.
- **`walletconnect/deeplink.test.ts`** — that a `wc:` link is recovered from both shapes a dApp sends.
- **`property/kinds.test.ts`** — that standing never lands on a Vault shelf, among other invariants.

Red here means stop. Nothing below is worth doing.

---

## Blocking prerequisite — mint test assets

**Most of this is invisible without assets that carry deed traits.** A wallet holding only ordinary
NFTs will show no deed panel and no standing, and that is correct behaviour rather than a bug.

⚠️ **These have to be minted by hand.** goshen's own Issue-a-Key screen cannot currently produce a
membership, office, credential or community key with the right `Type` trait — it writes whatever
*template* is selected, and the template list contains only property kinds. So anything issued there
today arrives here as a Book. Until that is fixed, mint the standing assets directly.

| Asset | Traits to set |
|---|---|
| A book | `Type: Book`, `Creator`, `Issued: <date>`, `Rights: Personal Use`, `Resale Allowed: Yes`, `Royalty Model: 10% to Creator`, `Treasury Assessment: 1%`, `Vault Access: Lifetime`, `Updates: Included`, `Agreement Version: 1.0` |
| A non-transferable credential | `Type: Credential`, `Resale Allowed: No`, `Expiration: Never` — mint it Token-2022 **NonTransferable** if you want to exercise A5 |
| A Gateway Membership | `Type: Membership`, `Issued: <date>` |
| An expired subscription | `Type: Subscription`, `Expiration: <a past date>` |
| An office | `Type: Office` |

Trait names are matched case/space/underscore-insensitively with aliases, so `creator_royalty`,
`Creator Royalty` and `Royalty` all work.

**Some sections need config.** The Vault (A2, B4b) needs `EXPO_PUBLIC_VAULT_API` and
`EXPO_PUBLIC_VAULT_DOMAIN`; the Marketplace buttons (A2) need `EXPO_PUBLIC_WEBAPP_URL`. All four
required variables and how to set them are in `CONFIG.md`. Without them those items are untestable
rather than failing — check **More → Development → Build configuration** to see what this build got.

---

# Section A — unverified

## A1. Keys can't load  ← start here

The highest-value check on this page, because the failure it replaces was silent and defamatory: the
app used to tell a member they owned **nothing** whenever the chain didn't answer.

- [ ] Turn off wi-fi and mobile data, force-quit, reopen, go to **Keys**.
- [ ] It says **"Couldn't load your keys"** — *not* "No keys yet". **If it says "No keys yet" with
      the network off, stop and tell me: that is the bug returning.**
- [ ] The copy mentions keys being safe on-chain, and on the public RPC it points at the RPC setting.
- [ ] **Try again** is present. Turn the network back on, tap it, and the list fills **without
      leaving the tab**.
- [ ] On a wallet that genuinely holds nothing, with the network **on**: "No keys yet" — the honest
      version — plus a Marketplace button if a web app is configured.

## A2. Empty states have somewhere to go

- [ ] **Keys**, holding nothing: a **Browse the Marketplace** button that opens the web app in the
      in-app browser. A `(?)` sits above the card.
- [ ] **Vault**, with nothing openable: the same button.
- [ ] With **no** `EXPO_PUBLIC_WEBAPP_URL`: the button is **absent**, not present-and-dead. *A button
      that does nothing on tap is the thing this pattern exists to avoid.*

## A3. The six explainers

Read these as a member would, not as someone who already knows the answer. **This is the item I most
need your judgement on** — I cannot tell from here whether any of it lands.

- [ ] **Keys** tab header `(?)` → standing vs property.
- [ ] **Vault** tab header `(?)` → why files live on a server and opening asks you to confirm.
- [ ] **Credentials** heading on Keys `(?)` → standing is granted, never bought.
- [ ] **Property Deed** card `(?)` → and check this one carefully: it must say the deed is a
      **record, not a lock**, and that a term can be granted, denied, or **unstated** — with unstated
      not meaning denied. *If it reads as though the app enforces your rights, that is worse than
      saying nothing and I need to rewrite it.*
- [ ] **Govern**, both sections: `(?)` on Your standing and on Holding tier, saying opposite halves
      of the same thing.
- [ ] On an unsendable key, `(?)` beside the refusal → why standing is bound to your wallet.
- [ ] Every panel is scrollable and dismissible, and nothing is cut off on a small screen.

## A4. Govern says what it means

- [ ] **Your standing** appears **above** Holding tier and reads Gateway Membership **Held** or
      **Not held**, matching what the Keys tab shows. *Disagreement between them means two
      derivations exist again.*
- [ ] Tapping that card opens the Association screen.
- [ ] The tier section is headed **Holding tier**, not "Membership", and says a tier confers no
      office and no claim on the treasury.
- [ ] The tier chip beside "Your voting power" wears a **trend arrow, not a ribbon**.

## A5. WalletConnect

Needs a dApp to pair with. The project id ships in the build, so the scanner should open a camera
rather than a notice.

- [ ] **Wallet tab → QR icon** opens the scanner. *A notice about a project id means the compiled-in
      id didn't take.*
- [ ] Pair with any Solana dApp on the network the wallet is set to. The approval sheet names the site.
- [ ] Sign a **message**: a **biometric prompt appears**. *No prompt is the gap that was closed — tell
      me.* The text is readable, not base58.
- [ ] Sign a **transaction** and confirm the dApp accepts the signature.
- [ ] **The account-switch guard:** with a session live, switch wallets in the app, then ask the site
      to sign. It must **refuse**, naming both accounts. *A signature produced here would be signed
      as the wrong member.*
- [ ] Switch back; signing works again.
- [ ] An unsendable credential shows Send **off**, with the token program's reason and a `(?)`.

## A6. Splash, More, and the deed panel

- [ ] Launch cold: the **crown** turns up from inverted and settles. Not the key, and not restarting
      partway.
- [ ] With a PIN set, lock and unlock: the **same** crown entrance.
- [ ] **More** reads as five short sections. **Association treasury** and **Multisig wallet** are in
      different sections and no longer look like a pair. There is **no Activity row** — the Wallet
      header clock still reaches it.
- [ ] Keys grid: badges render for every kind, and plain art carries none.
- [ ] A collectible's header shows its full noun — a membership says **Membership**, art says
      **Collectible**.

## A7. Deep links — only in a real build

`xgowallet://` is registered but **Expo Go cannot honour a custom scheme**, so this is untestable
until there is a development or production build. Not a failure; skip it and note it as unverified.

---

# Section B — earlier work, re-check the paths

Confirmed before, but the navigation around several of these moved.

## B1. Property Deed

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

## B2. Property status and transfer

- [ ] The expired subscription shows an **"Expired" badge** in the Property grid and a status line
      on its detail screen — and is **still openable**. *Disappearing from the grid is a failure:
      it's still owned.*
- [ ] Something expiring within 7 days shows **"Expires soon"** in amber.
- [ ] The non-transferable credential offers **no Send button**, with wording that says its *deed*
      doesn't permit transfer. *Any wording claiming the item "cannot be transferred" is wrong —
      the wallet can't enforce that.*
- [ ] An ordinary transferable NFT still sends normally.

## B3. Property / Credentials split

- [ ] The tab reads **Keys**, subtitled "Who you are, and what you own".
- [ ] **Credentials come first**, then Property below — membership, office, credential and community
      under a Credentials heading; books, art, files and tickets in the grid beneath it. *Property
      first would be the old order: who a member is precedes what they own.*
- [ ] **Nothing vanished.** Count the items before and after — every asset lands in exactly one of
      Property / Credentials / Archived / Hidden.
- [ ] Archive a credential → it moves to Archived, not to limbo. Restore works.
- [ ] Hidden still collapses spam.

## B3b. Property filters

- [ ] The filter row appears above the grid **only when there's more than one category held** —
      a single-category wallet shows no chips, which is correct.
- [ ] **Every chip returns something.** Filters are built from what's actually held, so tapping any
      one must never produce an empty grid. *An empty result means the derivation broke.*
- [ ] The item count above the grid **matches what's on screen** when a filter is active — not the
      unfiltered total.
- [ ] Credentials stay visible below regardless of the filter (they're standing, not property).
- [ ] Search and filter compose: filter to Books, then search — you get books matching the query.

## B4. Association (More → The Association → Your standing)

- [ ] With a Gateway Membership held: **gold member card**, "Member since <date>", and a standing
      count.
- [ ] Without one: a plain "No Gateway Membership held" card explaining standing comes from keys.
      *An empty screen or a spinner would read as breakage.*
- [ ] Offices, Credentials and Communities each list only their own kind. (**Fellowship** is no
      longer a kind — an existing Fellowship key reads as a Community and keeps its own name.)
- [ ] The expired one appears under **Lapsed**, not under its own section.
- [ ] **The one that matters most:** an airdropped spam "Office" NFT must confer **nothing** — no
      office row, not counted. If a junk airdrop grants standing, stop and tell me.
- [ ] Governance, Association treasury and Agreements all navigate correctly from their new
      homes in **More** (The Association / Legal).

## B4b. Vault (its own tab now, not a More row)

- [ ] Experiences appear with counts — Library, Learning, Media, Documents, Software, AI, Passes —
      and **only the ones you actually hold something in**.
- [ ] Tapping a row expands it in place; tapping again collapses. No drill-down screen.
- [ ] **Everything listed opens.** Tap through a few — anything that can't open shouldn't have been
      listed. *A row that leads nowhere means the access check was skipped.*
- [ ] Membership, office and credential do **not** appear here. They are standing, and they lead
      the **Keys** tab — Association is the civic detail page, not their home.
- [ ] Search spans all experiences and auto-expands matches.
- [ ] With nothing openable held: "Nothing in your vault yet", not an empty scroll.

## B5. Agreements (More → Legal → Agreements)

- [ ] On a fresh install, accept the legal gate → **Agreements lists Terms and Privacy**, each with
      a version, date, and SHA-256.
- [ ] Those first records show **"Unsigned"** with an explanation — expected, no wallet existed yet.
- [ ] Tap **Sign with this wallet** → biometric prompt → both flip to **"Signed"** with a signature.
- [ ] **Decline the biometric prompt** → nothing changes, no crash, records stay unsigned.
- [ ] Tapping the hash or signature copies it.
- [ ] "Read the document" opens the right document.

## B6. Swap slider haptics

- [ ] Drag the percentage slider slowly. **A light tick every 5%**, and a **firmer bump at 25 / 50 /
      75 / MAX**.
- [ ] Drag fast end to end. It should still feel like texture — *if it buzzes continuously or the
      feedback lags behind your finger, `DETENT` in `SwapScreen.tsx` needs raising.*
- [ ] Judgement call for you: **is 5% the right spacing in the hand?** One number to change.
- [ ] Tapping the 25/50/75/MAX chips still works and doesn't double-buzz.

## B7. Pull-to-refresh and tab icons

- [ ] Pull down on Wallet: **exactly one gold spinner**, in the space above the content. *Two
      spinners, or a grey system one, means the RefreshControl removal regressed.*
- [ ] Kill and relaunch the app several times: **tab icons render every launch**. *Blank glyphs on
      any launch means the icon font isn't being awaited at startup.*
- [ ] Swap screen: tapping the token picker still opens it rather than only dismissing the keyboard.

## B8. Pricing (still unconfirmed)

- [ ] **pepeAI** — does it now show a dollar value in the Wallet list? GeckoTerminal was added as a
      third price tier specifically for tokens Jupiter and DexScreener both miss.
- [ ] If it's still unpriced, open its token screen and report **which** of these it says:
      `No market · only $N pooled liquidity` (thin pool, refused on purpose) ·
      `Price unavailable · $N pooled liquidity` (a parser gap — my bug) ·
      `No price source found` (no pool anywhere).
- [ ] The Wallet total and the token screen **agree**. A holding valued on one screen and dashed on
      the other is the bug that was fixed.

## B9. Regressions to rule out

- [ ] Send, Receive, Swap and the treasury view all behave as before.
- [ ] Burn on a spam NFT still reclaims rent.
- [ ] Post-swap "Received" notification fires.
- [ ] Activity rows still say what moved.
