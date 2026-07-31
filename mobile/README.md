# SolWallet (mobile)

A native Solana wallet app (Phantom-inspired, passkey/Face ID unlock), built with
**Expo + React Native + TypeScript**.

**Phase 2 — live on devnet.** The wallet now generates a real keypair (stored in the
device keychain via `expo-secure-store`), shows real balances, funds itself from the
devnet faucet, and sends real signed transactions on Solana's **test network**. It's
real crypto with **test money only** — mainnet (real funds) is a deliberate later step.

## Run it on your iPhone (no Xcode needed)

1. Install **Expo Go** from the App Store on your iPhone.
2. On your Mac, in this folder:
   ```bash
   npm install
   npx expo start
   ```
3. A QR code appears in the terminal. Open the iPhone **Camera**, point it at the QR
   code, and tap the banner to open it in Expo Go.

(Your Mac and iPhone must be on the same Wi-Fi.)

## What's here

- **Onboarding** — "Create with passkey": Face ID prompt, then a real Solana keypair
  is generated and stored in the device keychain.
- **Lock screen** — biometric unlock gate.
- **Home** — live SOL balance, SPL token list, **Get SOL** (devnet faucet airdrop),
  pull-to-refresh.
- **Send** — real signed SOL transfer on devnet, with a Solscan link to the confirmed tx.
- **Receive** — QR code + real wallet address.
- **Activity** — real recent transactions from the chain (tap to open in Solscan).
- **Settings** — address, cluster, lock, and a "Reset wallet" danger action.

## Solana wiring

```
src/polyfills.ts            get-random-values + Buffer + URL (required by web3.js)
src/solana/connection.ts    devnet Connection + Solscan links
src/solana/history.ts       recent signatures for an address
src/wallet/keystore.ts      keypair in expo-secure-store (device keychain)
src/wallet/WalletContext.tsx  balances, faucet airdrop, signed transfers
```

## Structure

```
App.tsx              auth gate (onboarding / lock / main) + navigation
src/theme.ts         design tokens (Phantom-flavored palette)
src/auth.tsx         session state (onboarded / unlocked)
src/data/mockWallet  the ONLY source of funds right now (simulated)
src/components/       reusable UI (BalanceCard, TokenRow, GhostLogo, …)
src/screens/          Home, Activity, Settings, Send, Receive, Onboarding, Lock
```

## Roadmap

- **Phase 2 — Devnet:** ✅ real keypair + secure storage, live balances, faucet, and
  signed transfers.
- **Phase 3 — polish:** SPL token transfers, seed-phrase backup/import, price data,
  richer parsed activity.
- **Phase 4 — Mainnet:** only after the above is solid, with explicit warnings and
  hardened key handling, does it touch real funds.
