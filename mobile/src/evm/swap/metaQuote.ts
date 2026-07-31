/**
 * Meta-aggregator: query every enabled provider in parallel and return the quote with
 * the highest minimum-received (net of the community fee), so users always get the
 * best available rate. Adding a provider is just appending to PROVIDERS.
 */
import type { UnifiedQuote } from "../../swap/types";
import type { EvmQuoteParams } from "./provider";
import { kyberProvider } from "./providers/kyber";
import { zeroxProvider } from "./providers/zerox";

const PROVIDERS = [kyberProvider, zeroxProvider];

export async function metaQuote(p: EvmQuoteParams): Promise<UnifiedQuote | null> {
  const results = await Promise.all(PROVIDERS.map((fn) => fn(p).catch(() => null)));
  const quotes = results.filter((q): q is UnifiedQuote => q != null && q.minReceivedUi > 0);
  if (!quotes.length) return null;
  quotes.sort((a, b) => b.minReceivedUi - a.minReceivedUi);
  return quotes[0];
}
