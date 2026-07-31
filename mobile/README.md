# SolWallet (mobile)

A native Solana wallet app (Phantom-inspired, passkey/Face ID unlock), built with
**Expo + React Native + TypeScript**. This is **Phase 1 — the UI**: every screen is
built and interactive, running on **mock data**. No private keys are stored and no
real funds can move yet.

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

- **Onboarding** — "Create with passkey" (real Face ID prompt via
  `expo-local-authentication`) or "I already have a wallet".
- **Lock screen** — biometric unlock gate.
- **Home** — gradient balance card, Send / Receive / Swap / Buy, token list, recent activity.
- **Send** — asset picker, recipient, amount with MAX, simulated confirmation.
- **Receive** — QR code + copyable address.
- **Activity** — grouped transaction history.
- **Settings** — wallet, network (Devnet), security, and a "Lock wallet now" action.

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

- **Phase 2 — Devnet:** real keypair generation, secure storage
  (`expo-secure-store` / Keychain), live balances, and a real signed test
  transaction on Solana devnet (fake money).
- **Phase 3 — Mainnet:** only after Phase 2 is solid, with explicit warnings and
  hardened key handling, does it touch real funds.
