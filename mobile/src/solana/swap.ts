/**
 * Jupiter swap quotes (mainnet). Jupiter only has liquidity/routing on
 * mainnet-beta, so quotes reflect real mainnet rates even while the wallet runs
 * on devnet. Execution is intentionally not wired until we move to mainnet.
 */
const LOGO = (mint: string) =>
  `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mint}/logo.png`;

export interface SwapToken {
  mint: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

/** A small curated set of liquid mainnet tokens to swap between. */
export const SWAP_TOKENS: SwapToken[] = [
  { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", decimals: 9, logoURI: LOGO("So11111111111111111111111111111111111111112") },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6, logoURI: LOGO("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") },
  { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", decimals: 6, logoURI: LOGO("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB") },
  { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", symbol: "JUP", decimals: 6 },
  { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", decimals: 5 },
];

export interface Quote {
  /** UI output amount (decimals applied). */
  outAmount: number;
  /** Price impact as a percentage, e.g. 0.12 = 0.12%. */
  priceImpactPct: number;
  /** AMM labels the route goes through. */
  routeLabels: string[];
}

export async function fetchQuote(
  input: SwapToken,
  output: SwapToken,
  uiAmount: number,
  slippageBps = 50
): Promise<Quote> {
  const rawAmount = Math.round(uiAmount * 10 ** input.decimals);
  if (rawAmount <= 0) throw new Error("Enter an amount");

  const url =
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${input.mint}` +
    `&outputMint=${output.mint}&amount=${rawAmount}&slippageBps=${slippageBps}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`No route (${res.status})`);
  const j = (await res.json()) as {
    outAmount?: string;
    priceImpactPct?: string;
    routePlan?: { swapInfo?: { label?: string } }[];
  };
  if (!j?.outAmount) throw new Error("No route available");

  return {
    outAmount: Number(j.outAmount) / 10 ** output.decimals,
    priceImpactPct: Math.abs(Number(j.priceImpactPct ?? 0)) * 100,
    routeLabels: (j.routePlan ?? [])
      .map((r) => r.swapInfo?.label)
      .filter((l): l is string => !!l),
  };
}
