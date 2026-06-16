# SolScanner

Solana wallet & token forensics. Paste a wallet or token mint and get an
at-a-glance **relationship graph**, **balances / holders**, and **behavioral
heuristics** (fresh wallet, whale, sniper, CEX/program labels). Built Solana-first
on [Helius](https://helius.dev) parsed data, with the data layer abstracted behind
a `ChainAdapter` interface so an EVM/Alchemy backend can slot in later.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

**No key? Click "Demo wallet".** The app ships a zero-config demo mode (a
simulated pump.fun launch) so the graph, click-to-expand, holder concentration,
funding trail, and all the heuristic badges work with nothing to configure.

For live Solana data, add a Helius key:

```bash
cp .env.local.example .env.local   # paste your key into HELIUS_API_KEY
```

Get a free key at <https://dashboard.helius.dev>. The key is used **server-side
only** (in the API routes); it is never exposed to the browser.

## How it works

- **Search** an address → `/api/entity` classifies it (wallet / mint / program)
  and returns a summary + heuristic flags.
- **Balances** → `/api/balances` returns token balances (wallet) or top holders (mint).
- **Graph** → `/api/graph` returns a **one-hop** graph centered on the address.
  Click any node to refocus the panel on it *and* fetch its neighbors. On-demand
  expansion is what keeps a busy wallet from melting into a hairball. Hover to
  highlight a node's edges; a colour legend and zoom-to-fit are built in.

Extra forensic signal, derived from data already fetched (no extra API calls):

- **Holder concentration** (mints): holder count, top-1 / top-10 share, and a
  low/medium/high risk band.
- **First funding** (wallets): the earliest inbound transfer — a cheap "who
  funded this first" hint, with the source labeled if known (e.g. a CEX).

Add `?demo=1` to any API route to serve the demo dataset instead of Helius.

### Architecture

```
app/api/*          server routes that proxy Helius (key stays secret)
app/components/*    SearchBar, EntityPanel, ForceGraph (react-force-graph-2d, client-only)
lib/chains/         ChainAdapter interface (EVM seam) + Solana/Helius implementation
lib/analysis/       heuristics + one-hop graph builder (pure, unit-tested)
lib/labels/         seeded known addresses (CEX hot wallets, pump.fun/AMM, programs)
data/fixtures/      saved/sample normalized responses for offline dev + tests
scripts/            verify-data-layer.ts — run the adapter against real addresses
```

## Tuning heuristics

Thresholds live as named constants in `lib/analysis/heuristics.ts` and are meant to
be tuned per-token (a pump.fun launch is not a major-cap token):

| Flag   | Constant            | Default |
| ------ | ------------------- | ------- |
| fresh  | `FRESH_WALLET_DAYS` | 7 days  |
| whale  | `WHALE_SUPPLY_PCT`  | 1%      |
| sniper | `SNIPER_WINDOW_MIN` | 5 min   |

## Verifying the data layer

The data layer is built against Helius's documented enhanced-transaction / DAS
shapes. To confirm against live data and refresh the fixtures:

```bash
HELIUS_API_KEY=xxxx npm run verify:data [wallet] [mint]
```

## Scripts

| Command               | What it does                              |
| --------------------- | ----------------------------------------- |
| `npm run dev`         | Dev server                                |
| `npm run build`       | Production build                          |
| `npm test`            | Unit tests (heuristics + graph)           |
| `npm run verify:data` | Run the Solana adapter against real data  |

## Scope

**v1 (this):** Solana only, relationship graph + balances/holders + heuristics.

**v2 (deferred):** funding-trace (multi-hop source-of-funds walks) and PnL
reconstruction — the most Helius-credit-expensive features — plus an EVM/Alchemy
adapter behind the existing `ChainAdapter` seam.
