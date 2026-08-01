/**
 * OHLC candle history for the token-detail candlestick chart. Keyless + best-effort:
 *   • natives (SOL/ETH/BNB) → CoinGecko `/ohlc` (by coin id)
 *   • contract tokens (SPL / ERC-20, incl. pump.fun) → GeckoTerminal (find the top pool → OHLCV)
 * Returns [] when there's no market data (the screen shows an empty state). Stablecoins are flat,
 * so they return [] too.
 */
import type { ChainId } from "../chains/registry";

export type ChartRange = "1D" | "1W" | "1M" | "1Y";
export const CHART_RANGES: ChartRange[] = ["1D", "1W", "1M", "1Y"];

export interface Candle {
  /** Unix seconds (candle open time). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const CG = "https://api.coingecko.com/api/v3";
const GT = "https://api.geckoterminal.com/api/v2";

const NATIVE_ID: Record<string, string> = { SOL: "solana", ETH: "ethereum", BNB: "binancecoin" };
const GT_NET: Partial<Record<ChainId, string>> = { solana: "solana", ethereum: "eth", bsc: "bsc" };

// CoinGecko /ohlc only accepts specific `days` values; map each range to the closest.
const CG_DAYS: Record<ChartRange, number> = { "1D": 1, "1W": 7, "1M": 30, "1Y": 365 };

// GeckoTerminal timeframe/aggregate/limit per range (candle granularity that fills the window).
const GT_TF: Record<ChartRange, { timeframe: "minute" | "hour" | "day"; aggregate: number; limit: number }> = {
  "1D": { timeframe: "minute", aggregate: 15, limit: 96 },
  "1W": { timeframe: "hour", aggregate: 1, limit: 168 },
  "1M": { timeframe: "hour", aggregate: 4, limit: 180 },
  "1Y": { timeframe: "day", aggregate: 1, limit: 365 },
};

const isStable = (symbol: string) => /^(usdc|usdt|dai|busd|usd)$/i.test(symbol);
const num = (x: unknown): number | null => (typeof x === "number" && isFinite(x) ? x : null);

async function fromCoinGecko(coinId: string, range: ChartRange): Promise<Candle[]> {
  try {
    const res = await fetch(`${CG}/coins/${coinId}/ohlc?vs_currency=usd&days=${CG_DAYS[range]}`);
    if (!res.ok) return [];
    const rows = (await res.json()) as [number, number, number, number, number][];
    if (!Array.isArray(rows)) return [];
    return rows
      .map((r) => ({ time: Math.floor(r[0] / 1000), open: r[1], high: r[2], low: r[3], close: r[4] }))
      .filter((c) => num(c.open) != null && num(c.high) != null && num(c.low) != null && num(c.close) != null);
  } catch {
    return [];
  }
}

async function fromGeckoTerminal(net: string, contract: string, range: ChartRange): Promise<Candle[]> {
  try {
    // 1. Find the token's top pool (highest liquidity → most representative price).
    const poolsRes = await fetch(`${GT}/networks/${net}/tokens/${contract}/pools?page=1`);
    if (!poolsRes.ok) return [];
    const poolsJson = (await poolsRes.json()) as { data?: { id?: string; attributes?: { address?: string } }[] };
    const pool = poolsJson.data?.[0]?.attributes?.address;
    if (!pool) return [];

    // 2. OHLCV for that pool at the range's granularity.
    const { timeframe, aggregate, limit } = GT_TF[range];
    const ohlcvRes = await fetch(
      `${GT}/networks/${net}/pools/${pool}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd`
    );
    if (!ohlcvRes.ok) return [];
    const ohlcvJson = (await ohlcvRes.json()) as {
      data?: { attributes?: { ohlcv_list?: [number, number, number, number, number, number][] } };
    };
    const list = ohlcvJson.data?.attributes?.ohlcv_list ?? [];
    return list
      .map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4] }))
      .filter((c) => num(c.open) != null && num(c.high) != null && num(c.low) != null && num(c.close) != null)
      .sort((a, b) => a.time - b.time); // GeckoTerminal returns newest-first
  } catch {
    return [];
  }
}

export async function fetchCandles(
  opts: { chainId: ChainId; symbol: string; isNative: boolean; contract: string | null },
  range: ChartRange
): Promise<Candle[]> {
  if (isStable(opts.symbol)) return [];
  if (opts.isNative) {
    const id = NATIVE_ID[opts.symbol];
    return id ? fromCoinGecko(id, range) : [];
  }
  const net = GT_NET[opts.chainId];
  return net && opts.contract ? fromGeckoTerminal(net, opts.contract, range) : [];
}
