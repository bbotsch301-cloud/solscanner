/**
 * OHLC candle history for the token-detail candlestick chart. Keyless + best-effort, with layered
 * fallbacks so thin/new tokens still get a chart:
 *   • natives (SOL/ETH/BNB) → CoinGecko `/ohlc` (by coin id)
 *   • contract tokens (SPL / ERC-20) → GeckoTerminal (best pool → OHLCV)
 *   • …if GeckoTerminal has no usable pool → DexScreener's best pair → GeckoTerminal OHLCV
 *   • …and for pump.fun mints still missing → pump.fun's own bonding-curve candlesticks
 * Returns [] only when EVERY source misses (the screen then shows a friendly empty state).
 * Stablecoins are flat, so they return [] too.
 *
 * All fetches go through `fetchJson`, which waits out HTTP 429s (the free chart APIs are tightly
 * rate-limited, and a pump coin costs several calls) so a transient rate-limit no longer collapses
 * to an empty chart.
 */
import type { ChainId } from "../chains/registry";

export type ChartRange = "4H" | "1D" | "1W" | "1M" | "1Y";
export const CHART_RANGES: ChartRange[] = ["4H", "1D", "1W", "1M", "1Y"];

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
const DS = "https://api.dexscreener.com/latest/dex";
const PUMP = "https://frontend-api-v3.pump.fun";

const NATIVE_ID: Record<string, string> = { SOL: "solana", ETH: "ethereum", BNB: "binancecoin" };
const GT_NET: Partial<Record<ChainId, string>> = { solana: "solana", ethereum: "eth", bsc: "bsc" };
// DexScreener's `chainId` slugs (differ from GeckoTerminal's network slugs).
const DS_CHAIN: Partial<Record<ChainId, string>> = { solana: "solana", ethereum: "ethereum", bsc: "bsc" };

// CoinGecko /ohlc only accepts specific `days` values; map each range to the closest.
// CoinGecko has no sub-day window; 4H reuses the 1-day series and is trimmed by the caller.
const CG_DAYS: Record<ChartRange, number> = { "4H": 1, "1D": 1, "1W": 7, "1M": 30, "1Y": 365 };

// GeckoTerminal timeframe/aggregate/limit per range (candle granularity that fills the window).
const GT_TF: Record<ChartRange, { timeframe: "minute" | "hour" | "day"; aggregate: number; limit: number }> = {
  "4H": { timeframe: "minute", aggregate: 1, limit: 240 },
  "1D": { timeframe: "minute", aggregate: 15, limit: 96 },
  "1W": { timeframe: "hour", aggregate: 1, limit: 168 },
  "1M": { timeframe: "hour", aggregate: 4, limit: 180 },
  "1Y": { timeframe: "day", aggregate: 1, limit: 365 },
};

// pump.fun candlesticks take a timeframe in MINUTES; pick a granularity that fills each window
// without blowing past their per-request limit.
const PUMP_TF: Record<ChartRange, { minutes: number; limit: number }> = {
  "4H": { minutes: 1, limit: 240 },
  "1D": { minutes: 15, limit: 96 },
  "1W": { minutes: 60, limit: 168 },
  "1M": { minutes: 240, limit: 180 },
  "1Y": { minutes: 1440, limit: 365 },
};

const MAX_429_RETRIES = 3;
const RETRY_CAP_MS = 8000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isStable = (symbol: string) => /^(usdc|usdt|dai|busd|usd)$/i.test(symbol);
const num = (x: unknown): number | null => (typeof x === "number" && isFinite(x) ? x : null);
const isPumpMint = (mint: string) => mint.endsWith("pump");

/**
 * fetch + JSON that transparently waits out a 429 (Retry-After or exponential backoff) instead of
 * failing straight to an empty chart. Returns null on a non-429 error, exhausted retries, or a
 * non-OK status — callers treat null as "no data from this source".
 */
async function fetchJson<T>(url: string): Promise<T | null> {
  let wait = 500;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 && attempt < MAX_429_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, RETRY_CAP_MS) : wait;
        await sleep(delay);
        wait = Math.min(wait * 2, RETRY_CAP_MS);
        continue;
      }
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }
}

/** Keep only rows with four finite OHLC numbers, oldest-first. */
function clean(rows: Candle[]): Candle[] {
  return rows
    .filter((c) => num(c.open) != null && num(c.high) != null && num(c.low) != null && num(c.close) != null && num(c.time) != null)
    .sort((a, b) => a.time - b.time);
}

async function fromCoinGecko(coinId: string, range: ChartRange): Promise<Candle[]> {
  const rows = await fetchJson<[number, number, number, number, number][]>(
    `${CG}/coins/${coinId}/ohlc?vs_currency=usd&days=${CG_DAYS[range]}`
  );
  if (!Array.isArray(rows)) return [];
  return clean(rows.map((r) => ({ time: Math.floor(r[0] / 1000), open: r[1], high: r[2], low: r[3], close: r[4] })));
}

/** OHLCV for a specific GeckoTerminal pool address. */
async function gtOhlcv(net: string, pool: string, range: ChartRange): Promise<Candle[]> {
  const { timeframe, aggregate, limit } = GT_TF[range];
  const json = await fetchJson<{
    data?: { attributes?: { ohlcv_list?: [number, number, number, number, number, number][] } };
  }>(`${GT}/networks/${net}/pools/${pool}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd`);
  const list = json?.data?.attributes?.ohlcv_list ?? [];
  // GeckoTerminal returns newest-first [time, o, h, l, c, volume]; `clean` re-sorts oldest-first.
  return clean(list.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4] })));
}

interface GtPool {
  attributes?: { address?: string; reserve_in_usd?: string | number; volume_usd?: { h24?: string | number } };
}

/** GeckoTerminal via the token→pools lookup: try pools best-liquidity-first until one has OHLCV. */
async function fromGeckoTerminal(net: string, contract: string, range: ChartRange): Promise<Candle[]> {
  const json = await fetchJson<{ data?: GtPool[] }>(`${GT}/networks/${net}/tokens/${contract}/pools?page=1`);
  const pools = json?.data ?? [];
  if (!pools.length) return [];
  const liq = (p: GtPool) =>
    Number(p.attributes?.reserve_in_usd ?? 0) || Number(p.attributes?.volume_usd?.h24 ?? 0) || 0;
  const ordered = [...pools].sort((a, b) => liq(b) - liq(a));
  // Try the top few pools (not just the first) so a stale/empty top pool doesn't blank the chart.
  for (const p of ordered.slice(0, 3)) {
    const pool = p.attributes?.address;
    if (!pool) continue;
    const candles = await gtOhlcv(net, pool, range);
    if (candles.length >= 2) return candles;
  }
  return [];
}

/** DexScreener → the token's highest-liquidity pair address (covers pump/pumpswap pairs that the
 *  GeckoTerminal token→pools lookup sometimes misses); its OHLCV then comes from GeckoTerminal. */
async function fromDexScreenerPool(net: string, dsChain: string, mint: string, range: ChartRange): Promise<Candle[]> {
  const json = await fetchJson<{
    pairs?: { chainId?: string; pairAddress?: string; baseToken?: { address?: string }; liquidity?: { usd?: number } }[];
  }>(`${DS}/tokens/${mint}`);
  const pairs = (json?.pairs ?? []).filter(
    (p) => p.chainId === dsChain && p.baseToken?.address?.toLowerCase() === mint.toLowerCase() && p.pairAddress
  );
  if (!pairs.length) return [];
  pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return gtOhlcv(net, pairs[0].pairAddress!, range);
}

/** pump.fun's own bonding-curve candlesticks — the only source for a pre-graduation pump.fun token
 *  that has no AMM pool yet. Unofficial API (already used for pump metadata); parsed defensively. */
async function fromPumpFunCandles(mint: string, range: ChartRange): Promise<Candle[]> {
  const { minutes, limit } = PUMP_TF[range];
  const rows = await fetchJson<Record<string, unknown>[]>(
    `${PUMP}/candlesticks/${mint}?offset=0&limit=${limit}&timeframe=${minutes}`
  );
  if (!Array.isArray(rows)) return [];
  const pick = (r: Record<string, unknown>, keys: string[]): number | null => {
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "number" && isFinite(v)) return v;
      if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v))) return Number(v);
    }
    return null;
  };
  const candles = rows.map((r) => {
    const t = pick(r, ["timestamp", "time", "t"]);
    return {
      // Accept seconds or milliseconds.
      time: t == null ? NaN : t > 1e12 ? Math.floor(t / 1000) : t,
      open: pick(r, ["open", "o"]) ?? NaN,
      high: pick(r, ["high", "h"]) ?? NaN,
      low: pick(r, ["low", "l"]) ?? NaN,
      close: pick(r, ["close", "c"]) ?? NaN,
    };
  });
  return clean(candles);
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
  if (!net || !opts.contract) return [];
  const contract = opts.contract;

  // Layered fallbacks: the first source with ≥2 candles wins; [] only when all miss.
  const gt = await fromGeckoTerminal(net, contract, range);
  if (gt.length >= 2) return gt;

  const dsChain = DS_CHAIN[opts.chainId];
  if (dsChain) {
    const ds = await fromDexScreenerPool(net, dsChain, contract, range);
    if (ds.length >= 2) return ds;
  }

  if (opts.chainId === "solana" && isPumpMint(contract)) {
    const pf = await fromPumpFunCandles(contract, range);
    if (pf.length >= 2) return pf;
  }
  return [];
}
