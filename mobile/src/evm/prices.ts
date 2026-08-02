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

/**
 * Unit price for an ERC-20, or **null when we don't know it** — which is every token that isn't a
 * stablecoin, since there's no EVM price feed here yet.
 *
 * `stableUsd` returns 0 for those, and multiplying a balance by that produced a confident $0.00:
 * a real holding declared worthless. Harmless-looking while each chain was shown alone, actively
 * wrong now that one total spans them all. Prefer this wherever a value is displayed or summed.
 */
export function erc20Usd(symbol: string, balance: number): number | null {
  const p = stableUsd(symbol);
  return p > 0 ? balance * p : null;
}
