/**
 * Treasury allocation — shared by the Home treasury and the multisig vault view so both show the
 * SAME pie + list. Turns holdings + prices + metadata + off-chain assets into: colored pie slices
 * and ready-to-render Holding rows. With `topN`, crypto beyond the top N (by USD) is lumped into a
 * single "Other holdings" row/slice so the list stays short. Off-chain assets are never grouped.
 */
import { PIE_COLORS, type PieSlice } from "../components/PieChart";
import type { AssetIcon } from "../components/AssetLogo";
import { OFFCHAIN_ASSETS } from "../config/treasuryAssets";
import { nativeLogo } from "../config/logos";
import { offchainValue, type OffchainPrices } from "../prices/offchain";
import { colors, shortAddress } from "../theme";
import { WSOL_MINT, type PriceInfo } from "./prices";
import type { TokenMeta } from "./tokens";
import type { Holdings } from "./treasury";

/** A ready-to-render row for the Holdings list. */
export interface AllocRow {
  key: string;
  name: string;
  symbol: string;
  amount?: number;
  usdValue?: number;
  pct: number;
  color: string;
  logoURI?: string;
  icon?: AssetIcon;
  /** Off-chain quantity detail (renders with an "off-chain" tag). */
  offchainDetail?: string;
  /** Plain subtitle override (e.g. "12 smaller assets" for the Other row). */
  subtitle?: string;
  /** For the grouped "Other holdings" row: the individual lumped assets (for tap-to-expand). */
  children?: AllocRow[];
}

export interface Allocation {
  slices: PieSlice[];
  rows: AllocRow[];
  /** Sum of everything we could put a price on. When `unpriced > 0` this is a LOWER BOUND, not
   *  the treasury's value — callers must not render it as final. */
  total: number;
  solUsd: number;
  tokensUsd: number;
  offchainUsd: number;
  /** Non-zero crypto holdings we could price. */
  priced: number;
  /** Non-zero crypto holdings we could NOT price. A holding of zero counts as neither: its
   *  contribution is zero whether or not we know the price. */
  unpriced: number;
}

interface CryptoItem {
  key: string;
  name: string;
  symbol: string;
  amount?: number;
  usdValue?: number;
  value: number;
  logoURI?: string;
  color: string;
  subtitle?: string;
  children?: AllocRow[];
}

export function buildAllocation(
  holdings: Holdings | null,
  prices: Record<string, PriceInfo>,
  metas: Record<string, TokenMeta>,
  ocPrices: OffchainPrices,
  opts: { includeOffchain?: boolean; topN?: number } = {}
): Allocation {
  const includeOffchain = opts.includeOffchain ?? true;

  // "Unknown" and "zero" are different facts and are counted separately, so a screen can tell a
  // treasury that's genuinely empty from one whose prices simply haven't arrived. A holding of
  // zero is never counted either way — it contributes nothing regardless of its price.
  let priced = 0;
  let unpriced = 0;
  const countPricing = (amount: number, price: number | undefined) => {
    if (amount <= 0) return;
    if (price != null) priced++;
    else unpriced++;
  };

  const solAmount = holdings?.sol ?? 0;
  const solPrice = prices[WSOL_MINT]?.usdPrice;
  countPricing(solAmount, solPrice);
  const solUsd = solAmount * (solPrice ?? 0);
  const solItem: CryptoItem = {
    key: "SOL",
    name: "Solana",
    symbol: "SOL",
    amount: solAmount,
    // Matches the token rows below, which already did this. Previously SOL alone reported a
    // confident `$0.00` whenever the SOL price hadn't loaded.
    usdValue: solPrice != null ? solUsd : undefined,
    value: solUsd,
    logoURI: nativeLogo.solana,
    color: colors.accent,
  };
  const tokenItems: CryptoItem[] = (holdings?.tokens ?? []).map((t) => {
    const price = prices[t.mint]?.usdPrice;
    countPricing(t.amount, price);
    const value = t.amount * (price ?? 0);
    return {
      key: t.mint,
      name: metas[t.mint]?.name ?? shortAddress(t.mint, 4, 4),
      symbol: metas[t.mint]?.symbol ?? t.mint.slice(0, 3),
      amount: t.amount,
      usdValue: price != null ? value : undefined,
      value,
      logoURI: metas[t.mint]?.logoURI,
      color: colors.primary,
    };
  });
  const tokensUsd = tokenItems.reduce((s, x) => s + x.value, 0);
  const offchain = includeOffchain ? OFFCHAIN_ASSETS : [];
  const offchainUsd = offchain.reduce((s, a) => s + offchainValue(a, ocPrices), 0);
  const total = solUsd + tokensUsd + offchainUsd;
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);

  // SOL + tokens ranked by value; group everything past topN into one "Other holdings" entry.
  const crypto = [solItem, ...tokenItems].sort((a, b) => b.value - a.value);
  let cryptoDisplay = crypto;
  if (opts.topN != null && crypto.length > opts.topN) {
    const rest = crypto.slice(opts.topN);
    const restVal = rest.reduce((s, x) => s + x.value, 0);
    // The sum is only a real figure if every lumped holding was priced. A zero-balance holding
    // contributes zero either way, so a missing price on one of those doesn't spoil it. The old
    // `restVal > 0 ? restVal : undefined` read "unknown" as "zero" and vice versa.
    const restKnown = rest.every((x) => x.usdValue != null || (x.amount ?? 0) <= 0);
    cryptoDisplay = [
      ...crypto.slice(0, opts.topN),
      {
        key: "other",
        name: "Other holdings",
        symbol: `+${rest.length}`,
        value: restVal,
        usdValue: restKnown ? restVal : undefined,
        color: colors.textMuted,
        subtitle: `${rest.length} smaller ${rest.length === 1 ? "asset" : "assets"} · tap to expand`,
        children: rest.map((x) => ({
          key: x.key,
          name: x.name,
          symbol: x.symbol,
          amount: x.amount,
          usdValue: x.usdValue,
          pct: pct(x.value),
          color: x.color,
          logoURI: x.logoURI,
        })),
      },
    ];
  }

  const rows: AllocRow[] = [
    ...cryptoDisplay.map((x) => ({
      key: x.key,
      name: x.name,
      symbol: x.symbol,
      amount: x.amount,
      usdValue: x.usdValue,
      pct: pct(x.value),
      color: x.color,
      logoURI: x.logoURI,
      subtitle: x.subtitle,
      children: x.children,
    })),
    ...offchain.map((a) => {
      const v = offchainValue(a, ocPrices);
      return {
        key: a.label,
        name: a.label,
        symbol: a.category,
        usdValue: v,
        pct: pct(v),
        color: colors.accent,
        icon: a.icon,
        offchainDetail: a.amount != null ? `${a.amount.toLocaleString("en-US")} ${a.unit ?? ""}`.trim() : a.category,
      };
    }),
  ];

  // Pie uses the SAME grouped set, with distinct palette colors.
  const slices: PieSlice[] = [
    ...cryptoDisplay.map((x) => ({ label: x.symbol, value: x.value })),
    ...offchain.map((a) => ({ label: a.label, value: offchainValue(a, ocPrices) })),
  ]
    .map((s, i) => ({ label: s.label, value: s.value, color: PIE_COLORS[i % PIE_COLORS.length] }))
    .filter((s) => s.value > 0);

  return { slices, rows, total, solUsd, tokensUsd, offchainUsd, priced, unpriced };
}
