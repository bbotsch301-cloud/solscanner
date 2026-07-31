/**
 * Chain-agnostic swap entry point. Solana routes through Jupiter (unchanged); EVM
 * routes through the meta-aggregator (best rate across providers). The Swap screen
 * only talks to this module.
 */
import type { Keypair } from "@solana/web3.js";
import type { ChainDef } from "../chains/registry";
import type { EvmAccount } from "../wallet/evm";
import { fetchQuote as jupFetchQuote, executeSwap as jupExecuteSwap } from "../solana/swap";
import { metaQuote } from "../evm/swap/metaQuote";
import { executeEvmSwap } from "../evm/swap/execute";
import { EVM_FEE_RECIPIENT, feeBpsFor } from "../config/swapFee";
import { toBaseUnits } from "../evm/units";
import type { SwapToken, UnifiedQuote } from "./types";

export async function quoteSwap(
  chain: ChainDef,
  input: SwapToken,
  output: SwapToken,
  uiAmount: number,
  slippageBps: number,
  owner: string | null
): Promise<UnifiedQuote> {
  if (chain.kind === "solana") {
    const q = await jupFetchQuote(input, output, uiAmount, slippageBps);
    return {
      provider: "Jupiter",
      kind: "solana",
      input,
      output,
      outUi: q.outAmount,
      minReceivedUi: (q.outAmount * (10000 - slippageBps)) / 10000,
      priceImpactPct: q.priceImpactPct,
      routeLabels: q.routeLabels,
      feeBps: q.feeBps,
      solanaRaw: q.raw,
      venue: q.venue,
      isTreasuryPair: q.isTreasuryPair,
      fellBack: q.fellBack,
      gapBps: q.gapBps,
    };
  }

  if (!owner) throw new Error("No EVM wallet on this device.");
  const feeBps = EVM_FEE_RECIPIENT ? feeBpsFor(input.mint, output.mint) : 0;
  const q = await metaQuote({
    chain,
    input,
    output,
    amountInWei: toBaseUnits(uiAmount, input.decimals),
    slippageBps,
    owner,
    feeBps,
    feeRecipient: EVM_FEE_RECIPIENT,
  });
  if (!q) throw new Error("No route available");
  return q;
}

export async function executeUnifiedSwap(
  chain: ChainDef,
  quote: UnifiedQuote,
  signer: Keypair | EvmAccount,
  onStatus?: (s: string) => void
): Promise<string> {
  if (quote.kind === "solana") return jupExecuteSwap(quote.solanaRaw, signer as Keypair);
  return executeEvmSwap(chain, quote, signer as EvmAccount, onStatus);
}
