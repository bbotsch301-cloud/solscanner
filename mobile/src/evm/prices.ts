/**
 * USD prices for EVM assets. Native ETH/BNB via CoinGecko (best-effort); the curated
 * tokens are USD stablecoins, so they're treated as $1 rather than adding a second
 * price call. Returns a symbol→usd map.
 */
const COINGECKO = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin&vs_currencies=usd";

export async function fetchEvmNativePrices(): Promise<Record<string, number>> {
  try {
    const res = await fetch(COINGECKO);
    if (!res.ok) return {};
    const j = (await res.json()) as { ethereum?: { usd?: number }; binancecoin?: { usd?: number } };
    return {
      ETH: j.ethereum?.usd ?? 0,
      BNB: j.binancecoin?.usd ?? 0,
    };
  } catch {
    return {};
  }
}

/** Stablecoins in the curated list peg to $1. */
export function stableUsd(symbol: string): number {
  return symbol === "USDT" || symbol === "USDC" ? 1 : 0;
}
