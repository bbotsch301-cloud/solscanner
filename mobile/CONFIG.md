# Configuring the wallet

What a build of this app needs, why, and what happens when it doesn't get it.

If you only read one section, read **"Right now"**.

---

## Right now

**dApp connect needs nothing.** The WalletConnect project id is compiled into
`src/walletconnect/config.ts`. Scanning a QR to sign from your phone works out of the box, for you
and for every member, with nothing to set up.

**Four other things do need setting**, and all four point at infrastructure that is yours:

| Variable | What breaks without it |
|---|---|
| `EXPO_PUBLIC_MAINNET_RPC` | Sends time out. The public Solana endpoint is rate-limited, and the worst case is exactly the one this app does most — an XGO or Token-2022 transfer that also has to create the recipient's token account. |
| `EXPO_PUBLIC_VAULT_API` | No sign-in. The Vault can only open public links, so nothing gated is reachable. |
| `EXPO_PUBLIC_VAULT_DOMAIN` | Sign-in fails on the phone before the server hears about it. This must match the server's `AUTH_DOMAIN` **exactly**. |
| `EXPO_PUBLIC_WEBAPP_URL` | Marketplace and Issue a Key stay visibly disabled. |

### How to set them

1. Create a file called `.env` inside the `mobile/` folder.
2. Put four lines in it:

   ```
   EXPO_PUBLIC_MAINNET_RPC=https://your-host/api/rpc
   EXPO_PUBLIC_VAULT_API=https://your-host/_api
   EXPO_PUBLIC_VAULT_DOMAIN=your-host
   EXPO_PUBLIC_WEBAPP_URL=https://your-host
   ```

3. Restart with `npx expo start -c`.

**The `-c` is not optional.** Without it Metro serves the bundle it already built, with the old
values baked in, and the app will behave exactly as if you changed nothing — which is the single
most confusing way this can fail.

Three details that matter:

- **`/_api`, not `/api`.** Replit's edge intercepts the literal `/api/` prefix and returns 502. The
  platform mounts everything under `/_api` for that reason.
- **`EXPO_PUBLIC_VAULT_API` is the API; `EXPO_PUBLIC_WEBAPP_URL` is the site.** They are different
  values even when they share a host.
- **The server must agree about the network.** The sign-in challenge names a cluster and the server
  refuses one it doesn't speak for. This app defaults to `mainnet-beta`; the platform server defaults
  to `devnet`. A deployment that leaves the server's `SOLANA_CLUSTER` unset refuses every real
  sign-in with a cluster mismatch.

`.env` is never committed — the repo's root `.gitignore` ignores `.env*` — so it survives
`npm run sync` and it will not end up in the public repository.

### Checking what a build actually got

In a development build: **More → Development → Build configuration**. Every variable, whether it is
set, and what it is for. Required-but-missing ones are red. This row does not exist in a release
build.

---

## The variables

`src/config/env.json` is the list, with a one-line description of each. `src/config/env.ts` reads
them; `app.config.ts` enforces the required ones. Each is one of three tiers:

- **release** — a build handed to a member is broken without it. The four above.
- **default** — a working value is compiled in and the variable only overrides it. Just
  `EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID`.
- **optional** — the feature it gates is genuinely optional; unset is a legitimate build. Everything
  else: the EVM RPCs, the Etherscan key, push notifications, 0x liquidity, the treasury and fee
  overrides, and the address blocklist.

### Adding a new one

Two edits, because Expo does not give the app a real `process.env` — it substitutes the literal text
`process.env.EXPO_PUBLIC_FOO` at bundle time, so a computed lookup is `undefined` on a device no
matter what `.env` says:

1. An entry in `src/config/env.json`.
2. A literal read in the `VALUES` block of `src/config/env.ts`.

Forgetting the second is silent — the variable reads as unset forever. The diagnostics screen
detects it and says so.

---

## About the WalletConnect project id

It is committed to a public repository on purpose, and that is worth being clear about rather than
discovering later.

**It is not a credential.** It identifies *the app* to Reown's relay, not the person using it. It is
inside every published bundle; anyone holding the `.apk` or `.ipa` can read it. Committing it changes
how easily it is found, not whether it can be found. What it buys is that every member has a working
wallet with nothing to configure, which is the only version of this that scales.

The real exposure is relay quota. The mitigations are:

- **Allowlist** the app's bundle identifier in the Reown dashboard once a real build exists.
- **Rotate** by setting `EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID` to a new id — no code change needed.

**The Goshen web app must use the same id.** A mismatch pairs and then silently fails to relay, which
looks like the wallet ignoring the site rather than a configuration error.

---

## Later: real builds

Expo Go is the right choice for now and it is **not a distribution path**. It cannot be published to
the App Store or Play Store, and it cannot run native modules a release build will want. Moving to
real builds needs, roughly in order:

1. **An Expo account**, then `eas init` in `mobile/` — this writes the `projectId` into the app
   config. There is no `eas.json` in this repo yet, deliberately: writing build profiles that
   reference an account and a project id that don't exist produces a file that looks configured and
   isn't.
2. **Identifiers** — `ios.bundleIdentifier` and `android.package` in `app.json`. Neither is set.
3. **The four required variables** in the EAS build environment, or in `eas.json`'s `env` block.
   `app.config.ts` refuses a `preview` or `production` build without them and prints exactly which
   are missing, so this cannot be forgotten quietly.
4. **A `scheme`** in `app.json` if you want `wc:` links tapped *on the phone* to open this wallet.
   Scanning a desktop QR — what the wallet does today — does not need it.
5. **An EAS `projectId`** before push notifications can register a device, which is why
   `EXPO_PUBLIC_NOTIFY_API` cannot work under Expo Go regardless of what it is set to.

The guard in `app.config.ts` does nothing during `expo start`. A development session has to stay
startable with an empty `.env`.
