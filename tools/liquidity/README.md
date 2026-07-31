# XGO protocol-owned liquidity (treasury ops)

Node scripts the **treasury** runs to create and manage XGO's own liquidity on
**Raydium CPMM** (constant-product AMM). Owning the deepest XGO pool means the app's
trades route through it (Jupiter picks the deepest pool automatically) and the
**LP fees accrue to the treasury** — one of XGO's three real yield sources.

> This is a **separate Node package** — it does **not** touch the mobile app's
> dependencies. AMM SDKs are far too heavy to bundle into React Native, and pool
> creation needs a real signer + a good RPC, so it lives here.

## ⚠️ Read before running

- **Mainnet only, real capital.** These scripts move real funds with the treasury
  keypair. Start with a tiny seed.
- **Launch-gated.** XGO must be live on mainnet before a pool exists to create. Until
  then this is built-and-ready, not runnable.
- **Untested from the build sandbox.** No mainnet egress, no funds here — the bar this
  repo clears is a clean `npm run typecheck`. The on-chain run is yours. Verify the
  SDK call shapes against the official demo before spending: <https://github.com/raydium-io/raydium-sdk-V2-demo>.
- **Not free money.** As the sole LP you carry **impermanent loss** and full
  directional exposure on the position.
- **Compliance.** Being both the token issuer **and** the dominant liquidity provider
  invites market-conduct / securities scrutiny. Have counsel look at it before launch.

## Setup

```bash
cd tools/liquidity
npm install
cp .env.example .env      # fill in TREASURY_SECRET_KEY + a real MAINNET_RPC
npm run typecheck         # what CI/the sandbox can verify
```

## Commands

| Command | What it does | Key env |
| --- | --- | --- |
| `npm run create-pool` | Create + seed the XGO/USDC (or /SOL) pool. Run **once** at launch. | `POOL_QUOTE`, `SEED_BASE`, `SEED_QUOTE` |
| `npm run add` | Add balanced liquidity to deepen the book. | `POOL_ID`, `ADD_BASE` |
| `npm run remove` | Withdraw part/all of the position to the treasury. | `POOL_ID`, `REMOVE_PCT` or `REMOVE_LP` |
| `npm run info` | Read-only snapshot: reserves, price, treasury LP share. | `POOL_ID` |

Example — open a pool at ~$0.025/XGO with 1,000,000 XGO + 25,000 USDC:

```bash
POOL_QUOTE=USDC SEED_BASE=1000000 SEED_QUOTE=25000 npm run create-pool
# → prints poolId; save it. Everything else keys off POOL_ID.
POOL_ID=<poolId> npm run info
```

## How fees reach the treasury

Raydium **CPMM** trading fees are **auto-compounded into the pool reserves** — there's
no separate "claim" step (that's a CLMM thing). The LP position's value grows as trades
happen; the treasury **realizes** accrued fees by withdrawing (`npm run remove`). Use
`npm run info` to watch reserves/TVL grow over time.

## How the app uses the pool

No app change needed. `mobile/src/solana/swap.ts` already routes via **Jupiter**, which
sends orders through the **deepest** XGO pool. Once the treasury pool is the main XGO
liquidity, in-app swaps flow through it and fees accrue automatically. A direct
"swap against our pool" path (to force 100% capture, bypassing Jupiter) is possible
later but isn't needed while the treasury pool is deepest.

## Files

- `config.ts` — env loading, treasury signer, mainnet `Raydium.load`, mints.
- `createPool.ts` — create + seed the CPMM pool.
- `addLiquidity.ts` / `removeLiquidity.ts` — manage the position.
- `poolInfo.ts` — read-only snapshot.
