/**
 * Jupiter swap quotes + execution. Jupiter only has liquidity/routing on
 * mainnet-beta, so quotes reflect real mainnet rates even while the wallet runs
 * on devnet; executeSwap only does anything real once NETWORK is mainnet.
 */
import { Buffer } from "buffer";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { connection } from "./connection";

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
  /** Full Jupiter quote response, needed to build the swap transaction. */
  raw: unknown;
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
    raw: j,
  };
}

/**
 * Execute a swap on the CURRENT network. Only meaningful on mainnet — Jupiter has
 * no devnet liquidity. Builds the swap transaction from the quote, signs it with
 * the wallet keypair, and submits it. Returns the transaction signature.
 */
export async function executeSwap(rawQuote: unknown, keypair: Keypair): Promise<string> {
  const res = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: rawQuote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
    }),
  });
  if (!res.ok) throw new Error(`Swap build failed (${res.status})`);
  const { swapTransaction } = (await res.json()) as { swapTransaction?: string };
  if (!swapTransaction) throw new Error("No swap transaction returned");

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
  tx.sign([keypair]);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  const bh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  return sig;
}
