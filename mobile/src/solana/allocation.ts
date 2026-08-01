/**
 * Treasury allocation — shared by the Treasury tab and the Home (Ecosystem) page so both show
 * the SAME pie/total. Turns holdings + prices + metadata + off-chain assets into colored slices
 * (SOL, each token, each off-chain asset) plus the USD subtotals. Zero-value slices are dropped.
 */
import { PIE_COLORS, type PieSlice } from "../components/PieChart";
import { OFFCHAIN_ASSETS } from "../config/treasuryAssets";
import { offchainValue, type OffchainPrices } from "../prices/offchain";
import { shortAddress } from "../theme";
import { WSOL_MINT, type PriceInfo } from "./prices";
import type { TokenMeta } from "./tokens";
import type { Holdings } from "./treasury";

export interface Allocation {
  slices: PieSlice[];
  total: number;
  solUsd: number;
  tokensUsd: number;
  offchainUsd: number;
  /** Held tokens with their USD value, highest first (for the Holdings list). */
  sortedTokens: { t: Holdings["tokens"][number]; value: number }[];
}

export function buildAllocation(
  holdings: Holdings | null,
  prices: Record<string, PriceInfo>,
  metas: Record<string, TokenMeta>,
  ocPrices: OffchainPrices,
  /** Include the off-chain silver/dinar (the main treasury). A multisig vault sets this false. */
  includeOffchain = true
): Allocation {
  const solUsd = (holdings?.sol ?? 0) * (prices[WSOL_MINT]?.usdPrice ?? 0);
  const sortedTokens = (holdings?.tokens ?? [])
    .map((t) => ({ t, value: t.amount * (prices[t.mint]?.usdPrice ?? 0) }))
    .sort((a, b) => b.value - a.value);
  const tokensUsd = sortedTokens.reduce((s, x) => s + x.value, 0);
  const offchain = includeOffchain ? OFFCHAIN_ASSETS : [];
  const offchainUsd = offchain.reduce((s, a) => s + offchainValue(a, ocPrices), 0);
  const total = solUsd + tokensUsd + offchainUsd;

  const slices: PieSlice[] = [
    { label: "SOL", value: solUsd, color: PIE_COLORS[0] },
    ...sortedTokens.map((x, i) => ({
      label: metas[x.t.mint]?.symbol ?? shortAddress(x.t.mint, 3, 3),
      value: x.value,
      color: PIE_COLORS[(i + 1) % PIE_COLORS.length],
    })),
    ...offchain.map((a, i) => ({
      label: a.label,
      value: offchainValue(a, ocPrices),
      color: PIE_COLORS[(sortedTokens.length + 1 + i) % PIE_COLORS.length],
    })),
  ].filter((s) => s.value > 0);

  return { slices, total, solUsd, tokensUsd, offchainUsd, sortedTokens };
}
