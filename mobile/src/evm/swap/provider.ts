/** Shared shape every EVM swap provider implements. */
import type { ChainDef } from "../../chains/registry";
import type { SwapToken, UnifiedQuote } from "../../swap/types";

export interface EvmQuoteParams {
  chain: ChainDef;
  input: SwapToken;
  output: SwapToken;
  amountInWei: bigint;
  slippageBps: number;
  owner: string;
  feeBps: number;
  feeRecipient: string;
}

/** Returns a normalized quote, or null if the provider can't serve this pair. */
export type EvmProvider = (p: EvmQuoteParams) => Promise<UnifiedQuote | null>;
