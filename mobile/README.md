# XGO Wallet (mobile)

A native multi-chain wallet (Solana + Ethereum + BNB Smart Chain) with PIN / Face ID
unlock, built with **Expo + React Native + TypeScript**.

**Live on mainnet — this handles real funds.** Keys are generated on-device and stored
in the device keychain (`expo-secure-store`), encrypted behind an app PIN. Balances,
swaps (Jupiter on Solana, KyberSwap on EVM), transfers and the treasury view are all
real. A test network is still reachable from Settings for development.

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
- **Wallet** — live balances, token list with names/logos, pull-to-refresh.
- **Swap** — Jupiter on Solana, KyberSwap on Ethereum/BSC, with a hold-to-confirm sheet.
- **Keys** — NFTs and access passes, with archive and burn-to-reclaim-rent.
- **Ecosystem** — the treasury, its holdings, and recent inflows, all verifiable on-chain.
- **Governance** — voting weight and membership tier derived from XGO held, non-custodial.
- **Send / Receive** — signed transfers with a Solscan link; QR + address.
- **Activity** — parsed transactions that say what moved and how much.
- **Settings** — PIN, Face ID, notifications, custom RPC, and a "Reset wallet" danger action.

## Safety layer (the differentiator)

Every send is screened before it goes out. `src/safety/risk.ts` combines on-chain
signals (does the address exist, how old is it, how much history) with the
SolScanner label set (`src/safety/labels.ts` — CEX / program / scam) to produce a
risk verdict shown as a `RiskCard` in the Send flow:
- **danger** (scam/burn) blocks the send behind an explicit acknowledgement,
- **caution** (new/empty wallet, program address, self-send) warns,
- **info** (known exchange) informs,
- **safe** (established wallet) reassures.

## Solana wiring

```
src/polyfills.ts            get-random-values + Buffer + URL (required by web3.js)
src/solana/connection.ts    mainnet Connection (custom RPC aware) + Solscan links
src/solana/history.ts       recent signatures for an address
src/wallet/vault.ts         multi-seed vault in expo-secure-store (device keychain)
src/wallet/WalletContext.tsx  balances, prices, signed transfers
```

## Structure

```
App.tsx              auth gate (onboarding / lock / main) + navigation
src/theme.ts         design tokens (Phantom-flavored palette)
src/auth.tsx         session state (onboarded / unlocked)
src/chains/registry  chain definitions (Solana, Ethereum, BNB Smart Chain)
src/cache/           disk-backed snapshots so a cold open paints instantly
src/components/       reusable UI (BalanceCard, TokenRow, Skeleton, Updating, …)
src/screens/          Wallet, Swap, Keys, Ecosystem, More + the stack screens
```

## Where this is going

The wallet is becoming the member interface for a constitutional digital ecosystem —
identity, digital property with real deeds, agreements, a content vault, settlement,
communities and stewardship. Keys stay with the member; the platform facilitates.

- **`ARCHITECTURE.md`** — assessment of what exists, what's missing, what has to be
  built and by whom, and the assumptions in that model that don't survive contact with
  the code.
- **`ROADMAP.md`** — the phased plan, the XGO economics, and the open compliance
  questions.
