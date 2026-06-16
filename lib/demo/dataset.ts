/**
 * Static, story-driven demo dataset so the whole app is usable with no Helius key.
 *
 * The story: a pump.fun launch. A wallet (DEMO_WALLET) is funded by Binance,
 * snipes the launch within the sniper window, becomes a whale, then cashes out to
 * Coinbase. Other snipers, a fresh buyer, the dev, and the AMM pool round it out so
 * that clicking around the graph reveals a believable money trail.
 *
 * Timestamps are computed relative to "now" so the fresh/sniper heuristics stay
 * meaningful whenever the demo is run.
 */
import type { AccountInfo, Holder, NodeMeta, TokenBalance, Transfer } from "../chains/types";

// Labeled addresses are the real ones from labels.json so labels light up.
export const BINANCE = "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S";
export const COINBASE = "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS";
export const PUMPFUN = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMPSWAP = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const RAYDIUM = "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";

export const DEMO_MINT = "PumpDemoM1ntTokenDemoNotARea1Address11111111";
export const DEMO_WALLET = "Sn1perWha1eDemoWa11etNotARea1Address11111111";
const DEV = "DevLauncherDemoWa11etNotARea1Address11111111";
const SNIPER2 = "Sn1per2DemoWa11etNotARea1Address1111111111111";
const FRESH3 = "FreshBuyerDemoWa11etNotARea1Address111111111";
const NORMAL1 = "Ho1der1DemoWa11etNotARea1Address111111111111";
const NORMAL2 = "Ho1der2DemoWa11etNotARea1Address111111111111";

const SOL = "SOL";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface DemoDataset {
  transfers: Transfer[];
  holders: Holder[];
  balancesByOwner: Record<string, TokenBalance[]>;
  accountInfo: Record<string, AccountInfo>;
  graphMeta: Record<string, NodeMeta>;
  classify: Record<string, "wallet" | "mint" | "program">;
  /** The token mint these holders belong to. */
  mint: string;
}

let cached: DemoDataset | null = null;

export function getDemoDataset(): DemoDataset {
  if (cached) return cached;

  const now = Math.floor(Date.now() / 1000);
  const H = 3600;
  const D = 86_400;
  const launch = now - 3 * H; // launch was 3h ago

  let sig = 0;
  const t = (
    source: string,
    destination: string,
    mint: string,
    amount: number,
    timestamp: number,
    type = "TRANSFER"
  ): Transfer => ({
    signature: `demo${++sig}`,
    timestamp,
    source,
    destination,
    mint,
    amount,
    type,
  });

  const transfers: Transfer[] = [
    // Funding: Binance seeds several wallets that all snipe the same launch.
    t(BINANCE, DEMO_WALLET, SOL, 50, launch - 1 * H),
    t(BINANCE, SNIPER2, SOL, 18, launch - 50 * 60),
    t(BINANCE, NORMAL1, SOL, 6, launch - 30 * 60),

    // Dev creates the token via pump.fun and seeds liquidity.
    t(DEV, PUMPFUN, SOL, 5, launch - 5 * 60, "CREATE"),
    t(DEV, RAYDIUM, SOL, 2, launch - 4 * 60),

    // The snipes (within minutes of launch) — SOL in, tokens out.
    t(DEMO_WALLET, PUMPFUN, SOL, 30, launch + 60, "SWAP"),
    t(PUMPFUN, DEMO_WALLET, DEMO_MINT, 6_000_000, launch + 70, "SWAP"),
    t(SNIPER2, PUMPFUN, SOL, 12, launch + 90, "SWAP"),
    t(PUMPFUN, SNIPER2, DEMO_MINT, 1_200_000, launch + 100, "SWAP"),
    t(DEV, PUMPFUN, SOL, 1, launch + 30, "SWAP"),
    t(PUMPFUN, DEV, DEMO_MINT, 4_200_000, launch + 40, "SWAP"),

    // Migration to the AMM once the curve completes.
    t(PUMPFUN, PUMPSWAP, SOL, 85, launch + 40 * 60, "SWAP"),
    t(PUMPFUN, PUMPSWAP, DEMO_MINT, 30_000_000, launch + 40 * 60, "SWAP"),

    // A fresh buyer buys late on the AMM.
    t(FRESH3, PUMPSWAP, SOL, 3, launch + 90 * 60, "SWAP"),
    t(PUMPSWAP, FRESH3, DEMO_MINT, 1_200_000, launch + 90 * 60, "SWAP"),

    // The whale distributes and cashes out.
    t(DEMO_WALLET, FRESH3, DEMO_MINT, 200_000, now - 70 * 60),
    t(DEMO_WALLET, NORMAL2, DEMO_MINT, 120_000, now - 60 * 60),
    t(DEMO_WALLET, PUMPSWAP, DEMO_MINT, 800_000, now - 40 * 60, "SWAP"),
    t(PUMPSWAP, DEMO_WALLET, SOL, 22, now - 40 * 60, "SWAP"),
    t(DEMO_WALLET, COINBASE, SOL, 40, now - 20 * 60),

    // Secondary trail for expansion depth.
    t(FRESH3, NORMAL2, DEMO_MINT, 50_000, now - 15 * 60),
    t(SNIPER2, PUMPSWAP, DEMO_MINT, 300_000, now - 10 * 60, "SWAP"),
  ];

  const holders: Holder[] = [
    { owner: PUMPSWAP, amount: 30_000_000, rawAmount: "30000000000000", pct: 0.3 },
    { owner: DEMO_WALLET, amount: 6_000_000, rawAmount: "6000000000000", pct: 0.06 },
    { owner: DEV, amount: 4_200_000, rawAmount: "4200000000000", pct: 0.042 },
    { owner: SNIPER2, amount: 900_000, rawAmount: "900000000000", pct: 0.009 },
    { owner: FRESH3, amount: 1_200_000, rawAmount: "1200000000000", pct: 0.012 },
    { owner: NORMAL1, amount: 500_000, rawAmount: "500000000000", pct: 0.005 },
    { owner: NORMAL2, amount: 170_000, rawAmount: "170000000000", pct: 0.0017 },
  ];

  const balancesByOwner: Record<string, TokenBalance[]> = {
    [DEMO_WALLET]: [
      { mint: DEMO_MINT, amount: 6_000_000, rawAmount: "6000000000000", decimals: 6, symbol: "PUMP", name: "Demo Pump Token", usdValue: 18_240 },
      { mint: USDC, amount: 4_120.5, rawAmount: "4120500000", decimals: 6, symbol: "USDC", name: "USD Coin", usdValue: 4_120.5 },
      { mint: SOL, amount: 12.4, rawAmount: "12400000000", decimals: 9, symbol: "SOL", name: "Solana", usdValue: 1_984 },
    ],
    [DEV]: [
      { mint: DEMO_MINT, amount: 4_200_000, rawAmount: "4200000000000", decimals: 6, symbol: "PUMP", name: "Demo Pump Token", usdValue: 12_768 },
    ],
    [FRESH3]: [
      { mint: DEMO_MINT, amount: 1_150_000, rawAmount: "1150000000000", decimals: 6, symbol: "PUMP", name: "Demo Pump Token", usdValue: 3_496 },
    ],
  };

  const accountInfo: Record<string, AccountInfo> = {
    [DEMO_WALLET]: { address: DEMO_WALLET, firstSeen: now - 5 * D, txCount: 47, lamports: 12.4e9 },
    [DEV]: { address: DEV, firstSeen: now - 2 * D, txCount: 31, lamports: 2.1e9 },
    [SNIPER2]: { address: SNIPER2, firstSeen: now - 4 * D, txCount: 22, lamports: 0.8e9 },
    [FRESH3]: { address: FRESH3, firstSeen: launch + 80 * 60, txCount: 4, lamports: 0.3e9 },
    [NORMAL1]: { address: NORMAL1, firstSeen: now - 200 * D, txCount: 510, lamports: 3.5e9 },
    [NORMAL2]: { address: NORMAL2, firstSeen: now - 95 * D, txCount: 88, lamports: 1.2e9 },
  };

  // Per-address graph metadata: firstSeen (fresh) + holdingPct (whale).
  const holdingByOwner = new Map(holders.map((h) => [h.owner, h.pct]));
  const graphMeta: Record<string, NodeMeta> = {};
  for (const addr of new Set([
    ...transfers.flatMap((tr) => [tr.source, tr.destination]),
  ])) {
    graphMeta[addr] = {
      firstSeen: accountInfo[addr]?.firstSeen,
      holdingPct: holdingByOwner.get(addr),
    };
  }

  const classify: Record<string, "wallet" | "mint" | "program"> = {
    [DEMO_MINT]: "mint",
    [PUMPFUN]: "program",
    [PUMPSWAP]: "program",
    [RAYDIUM]: "program",
  };

  cached = {
    transfers,
    holders,
    balancesByOwner,
    accountInfo,
    graphMeta,
    classify,
    mint: DEMO_MINT,
  };
  return cached;
}
