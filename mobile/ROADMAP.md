# XGO — Roadmap & Strategy Notes

Living notes on where the app is, how the economics work, and what's next.
Not legal advice — the token/treasury structure needs a securities/crypto attorney
before any of the financial pieces go live.

## Where it is now
- Gold/black XGO wallet, live as a **general exchange** (Jupiter swaps on Solana,
  KyberSwap on Ethereum/BSC). XGO's own features activate once XGO is listed.
- Tabs: Wallet · Swap · Purchases · Ecosystem (treasury) · More
  (Governance / Activity / Contacts / Settings + coming-soon Impact / Marketplace / Map).
- Self-custody (BIP39 seed backup + import), Token-2022 support, anti-drainer
  safety layer, transparent treasury view.
- **Governance/membership staking (non-custodial):** hold XGO = voting weight;
  hold more/longer = higher tier (Member → Steward → Elder → Founder) + a loyalty
  multiplier (up to 2×). No lock-up, no custody, **no payout**.

## Compliance posture (decided)
- Holders receive **no revenue-share / no dividend**. Fees stay in the treasury.
- XGO framed as **governance + membership + utility**, not an investment. Buybacks/
  burns are **discretionary, not promised, and not marketed as "number go up."**
- This keeps XGO in the lower-risk lane. Still: **get counsel before any public
  sale, any direct staker payout, or any "earn" messaging.**

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

## XGO launch checklist
- Deploy XGO; set `XGO_MINT` (`src/solana/token2022.ts`) +
  `TREASURY_ADDRESS` (`src/solana/treasury.ts`) to the live values.
- Set a dedicated RPC (Helius) — in Settings, or `EXPO_PUBLIC_MAINNET_RPC` at build time.
- Seed protocol-owned XGO/USDC liquidity; enable 1.11% fee harvest to treasury.
- Move off Expo Go → a **standalone signed build** (EAS → TestFlight/App Store).
- **Security review** before community funds flow. Start with tiny amounts.

## Nice-to-build next
- SOL liquid staking (~8%) as a general "Earn" anchor.
- Treasury yield engine (deploy reserves → buyback/burn).
- Ecosystem screens: Impact, Marketplace, Map, Steward AI (need a lightweight
  backend/CMS + a Claude key proxy for the AI).
- Richer governance (real on-chain vote program), pre-sign tx simulation.
