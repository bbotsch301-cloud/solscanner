/**
 * 7-day price history + current price via CoinGecko (best-effort, keyless free tier).
 * Natives resolve by coin id; other tokens by contract/platform. Stablecoins and
 * anything without market data simply return null and the detail screen hides the chart.
 */
import type { ChainId } from "../chains/registry";

const CG = "https://api.coingecko.com/api/v3";

const NATIVE_ID: Record<string, string> = {
  SOL: "solana",
  ETH: "ethereum",
  BNB: "binancecoin",
};

const PLATFORM: Partial<Record<ChainId, string>> = {
  solana: "solana",
  ethereum: "ethereum",
  bsc: "binance-smart-chain",
};

export interface TokenChart {
  /** Daily-ish price points over ~7 days. */
  prices: number[];
  /** % change across the window. */
  changePct: number | null;
  /** Latest price in USD. */
  priceUsd: number | null;
}

export async function fetchTokenChart(opts: {
  chainId: ChainId;
  symbol: string;
  isNative: boolean;
  contract: string | null;
}): Promise<TokenChart | null> {
  if (/^(usdc|usdt|dai|busd|usd)$/i.test(opts.symbol)) return null; // stablecoins: flat
  try {
    let url: string | null = null;
    if (opts.isNative) {
      const id = NATIVE_ID[opts.symbol];
      if (id) url = `${CG}/coins/${id}/market_chart?vs_currency=usd&days=7&interval=daily`;
    } else if (opts.contract) {
      const platform = PLATFORM[opts.chainId];
      if (platform)
        url = `${CG}/coins/${platform}/contract/${opts.contract}/market_chart?vs_currency=usd&days=7&interval=daily`;
    }
    if (!url) return null;

    const res = await fetch(url);
    if (!res.ok) return null;
    const j = (await res.json()) as { prices?: [number, number][] };
    const prices = (j.prices ?? []).map((p) => p[1]).filter((n) => typeof n === "number");
    if (prices.length < 2) return null;

    const priceUsd = prices[prices.length - 1];
    const first = prices[0];
    const changePct = first > 0 ? ((priceUsd - first) / first) * 100 : null;
    return { prices, changePct, priceUsd };
  } catch {
    return null;
  }
}
