/**
 * Chain-agnostic swap entry point. Solana routes through Jupiter (unchanged); EVM
 * routes through the meta-aggregator (best rate across providers). The Swap screen
 * only talks to this module.
 */
import type { Keypair } from "@solana/web3.js";
import { assertNever, type ChainDef } from "../chains/registry";
import type { EvmAccount } from "../wallet/evm";
import { fetchQuote as jupFetchQuote, executeSwap as jupExecuteSwap } from "../solana/swap";
import { fetchPrices } from "../solana/prices";
import { metaQuote } from "../evm/swap/metaQuote";
import { executeEvmSwap } from "../evm/swap/execute";
import { fetchEvmNativePrices, stableUsd } from "../evm/prices";
import { EVM_FEE_RECIPIENT, feeBpsFor } from "../config/swapFee";
import { toBaseUnits } from "../evm/units";
import { EVM_NATIVE, type SwapToken, type UnifiedQuote } from "./types";

export async function quoteSwap(
  chain: ChainDef,
  input: SwapToken,
  output: SwapToken,
  uiAmount: number,
  slippageBps: number,
  owner: string | null
): Promise<UnifiedQuote> {
  // Exhaustive: the EVM meta-aggregator used to be the implicit tail, so a chain family neither
  // Jupiter nor Kyber covers would have been quoted against the wrong network entirely.
  if (chain.kind !== "solana" && chain.kind !== "evm") {
    return assertNever(chain.kind, "chain kind in fetchUnifiedQuote");
  }
  if (chain.kind === "solana") {
    // Price BOTH tokens off the same feed as the portfolio (Jupiter Price API), in parallel with
    // the quote so it adds no latency — the swap then shows a true dollar value on each side,
    // including an output token the user doesn't hold yet.
    const [q, px] = await Promise.all([
      jupFetchQuote(input, output, uiAmount, slippageBps),
      fetchPrices([input.mint, output.mint]).catch(() => ({} as Record<string, { usdPrice: number }>)),
    ]);
    // Netting applies only when the fee comes out of the OUTPUT and Jupiter didn't already take
    // it — then we skim it afterwards, so the displayed receive must be net to stay true. On the
    // INPUT path nothing is skimmed from the output: the quote was already for the reduced trade
    // amount, so `outAmount` is exactly what lands.
    const selfCollect = q.feeSide === "output" && !q.platformFeeApplied && q.feeBps > 0;
    const netOut = selfCollect ? (q.outAmount * (10000 - q.feeBps)) / 10000 : q.outAmount;
    const inP = px[input.mint]?.usdPrice;
    const outP = px[output.mint]?.usdPrice;
    const inUsd = inP != null ? uiAmount * inP : undefined;
    const outUsd = outP != null ? netOut * outP : undefined;
    return {
      provider: "Jupiter",
      kind: "solana",
      input,
      output,
      outUi: netOut,
      minReceivedUi: (netOut * (10000 - slippageBps)) / 10000,
      priceImpactPct: q.priceImpactPct,
      routeLabels: q.routeLabels,
      feeBps: q.feeBps,
      platformFeeApplied: q.platformFeeApplied,
      inUsd,
      outUsd,
      solanaRaw: q.raw,
      venue: q.venue,
      isTreasuryPair: q.isTreasuryPair,
      fellBack: q.fellBack,
      gapBps: q.gapBps,
      feeAccountSetup: q.feeAccountSetup,
      feeSide: q.feeSide,
      feeBase: q.feeBase,
      inputDecimals: input.decimals,
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

  // Best-effort USD on EVM: native via live price, USDC/USDT ~ $1. Other ERC-20s have no in-app
  // price source, so they stay undefined and the UI estimates that side.
  try {
    const nativePrices = await fetchEvmNativePrices();
    const perUnit = (t: SwapToken): number | null => {
      if (t.mint.toLowerCase() === EVM_NATIVE.toLowerCase()) return nativePrices[chain.symbol] ?? null;
      const s = stableUsd(t.symbol);
      return s > 0 ? s : null;
    };
    const inP = perUnit(input);
    const outP = perUnit(output);
    if (inP != null) q.inUsd = uiAmount * inP;
    if (outP != null) q.outUsd = q.outUi * outP;
  } catch {
    /* leave USD undefined */
  }
  return q;
}

export async function executeUnifiedSwap(
  chain: ChainDef,
  quote: UnifiedQuote,
  signer: Keypair | EvmAccount,
  onStatus?: (s: string) => void
): Promise<string> {
  switch (quote.kind) {
    case "solana":
      return jupExecuteSwap(
        quote.solanaRaw,
        signer as Keypair,
        {
          feeBps: quote.feeBps,
          outputDecimals: quote.output.decimals,
          feeSide: quote.feeSide,
          feeBase: quote.feeBase,
          inputMint: quote.input.mint,
          inputDecimals: quote.inputDecimals ?? quote.input.decimals,
        },
        onStatus
      );
    case "evm":
      return executeEvmSwap(chain, quote, signer as EvmAccount, onStatus);
    default:
      // The `signer as X` casts below are only sound because this is exhaustive: an unhandled
      // quote kind would otherwise be handed the wrong chain family's private key.
      return assertNever(quote.kind, "quote kind in executeUnifiedSwap");
  }
}
