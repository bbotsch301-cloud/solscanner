/**
 * Chain-agnostic transaction activity. Solana uses signatures (via solana/history) and then derives
 * what actually moved (via solana/txParse); EVM uses the Etherscan V2 API (via evm/history). Both
 * normalize to HistoryItem so the Home + Activity screens render one shape.
 *
 * Solana enrichment is deliberately a SECOND stage. Signatures come back in one cheap call and the
 * rows can paint immediately; parsing the transactions is the expensive part, so it's layered on
 * top and any failure just leaves a row plain rather than blanking the feed.
 */
import type { ChainDef } from "./chains/registry";
import { fetchHistory } from "./solana/history";
import { solscanTx } from "./solana/connection";
import { cachedTokenMetas, fetchTokenMetas } from "./solana/tokens";
import { fetchPrices, WSOL_MINT } from "./solana/prices";
import { cachedParse, parseTransactions, type ActivityKind, type ParsedTx } from "./solana/txParse";
import { nativeLogo } from "./config/logos";
import { fetchEvmHistory } from "./evm/history";

/** One asset moving in a transaction, ready to render. */
export interface AssetMove {
  /** null = native SOL. */
  mint: string | null;
  symbol: string;
  amount: number;
  /** Value at TODAY's price — not the price when this happened. */
  usd?: number;
  logoURI?: string;
}

export interface HistoryItem {
  id: string; // signature or tx hash
  time: number | null; // unix seconds
  failed: boolean;
  direction: "in" | "out" | null; // EVM only; null for Solana
  valueLabel: string | null; // e.g. "0.5 ETH"; null when unknown
  explorerUrl: string;
  /** What kind of action this was. null while unparsed (or on EVM, which doesn't classify yet). */
  kind: ActivityKind | null;
  /** Assets that arrived / left. Empty until the transaction has been parsed. */
  moveIn: AssetMove[];
  moveOut: AssetMove[];
  /** Network fee in SOL, when this wallet paid it. */
  feeSol?: number;
}

const SOL: { symbol: string; logoURI?: string } = { symbol: "SOL", logoURI: nativeLogo.solana };

/** Attach symbols, logos and USD to a parsed transaction's raw mint/amount pairs. */
function decorate(
  p: ParsedTx,
  metas: Record<string, { symbol: string; logoURI?: string }>,
  prices: Record<string, { usdPrice: number }>
): { moveIn: AssetMove[]; moveOut: AssetMove[] } {
  const one = (m: { mint: string | null; amount: number }): AssetMove => {
    const meta = m.mint ? metas[m.mint] : SOL;
    // Native SOL is priced under the wrapped-SOL mint.
    const price = prices[m.mint ?? WSOL_MINT]?.usdPrice;
    return {
      mint: m.mint,
      symbol: meta?.symbol ?? (m.mint ? `${m.mint.slice(0, 4)}…` : "SOL"),
      amount: m.amount,
      usd: price != null ? m.amount * price : undefined,
      logoURI: m.mint ? meta?.logoURI : SOL.logoURI,
    };
  };
  return { moveIn: p.moveIn.map(one), moveOut: p.moveOut.map(one) };
}

/** Mints referenced by a set of parsed transactions (excluding native). */
function mintsOf(parsed: Iterable<ParsedTx>): string[] {
  const s = new Set<string>();
  for (const p of parsed) for (const m of [...p.moveIn, ...p.moveOut]) if (m.mint) s.add(m.mint);
  return [...s];
}

function toItem(sig: { signature: string; blockTime: number | null; failed: boolean }): HistoryItem {
  return {
    id: sig.signature,
    time: sig.blockTime,
    failed: sig.failed,
    direction: null,
    valueLabel: null,
    explorerUrl: solscanTx(sig.signature),
    kind: null,
    moveIn: [],
    moveOut: [],
  };
}

/** Fold a parsed transaction into its row. */
function applyParse(
  item: HistoryItem,
  p: ParsedTx,
  metas: Record<string, { symbol: string; logoURI?: string }>,
  prices: Record<string, { usdPrice: number }>
): HistoryItem {
  const { moveIn, moveOut } = decorate(p, metas, prices);
  return { ...item, kind: p.kind, moveIn, moveOut, feeSol: p.feeSol };
}

/**
 * Stage one: the signature list, plus whatever is already cached. Cheap — one RPC call — and the
 * caller can render this straight away.
 */
export async function fetchActivity(
  chain: ChainDef,
  address: string | null,
  limit = 25
): Promise<HistoryItem[]> {
  if (!address) return [];
  if (chain.kind === "solana") {
    const sigs = await fetchHistory(address, limit);
    // Anything parsed on a previous visit is applied immediately — `cachedTokenMetas` is
    // synchronous, so those rows are fully formed on first paint with no further calls.
    const cached = sigs.map((s) => cachedParse(address, s.signature)).filter((p): p is ParsedTx => !!p);
    const metas = cachedTokenMetas(mintsOf(cached));
    return sigs.map((s) => {
      const item = toItem(s);
      const p = cachedParse(address, s.signature);
      return p ? applyParse(item, p, metas, {}) : item;
    });
  }
  return (await fetchEvmHistory(chain, address, limit)).map((e) => ({
    ...e,
    kind: null,
    moveIn: [],
    moveOut: [],
  }));
}

/**
 * Stage two: parse whatever's still plain and return the upgraded list. Solana only. Safe to call
 * on every load — already-parsed transactions never hit the network again.
 */
export async function enrichActivity(
  chain: ChainDef,
  address: string | null,
  items: HistoryItem[]
): Promise<HistoryItem[]> {
  if (chain.kind !== "solana" || !address || !items.length) return items;
  const need = items.filter((i) => i.kind === null).map((i) => i.id);
  if (!need.length) return items;

  const parsed = await parseTransactions(need, address);
  if (!parsed.size) return items;

  const mints = mintsOf(parsed.values());
  const [metas, prices] = await Promise.all([
    fetchTokenMetas(mints).catch(() => cachedTokenMetas(mints)),
    // fetchPrices throws on a non-OK response; an unpriced row is far better than no rows.
    fetchPrices([WSOL_MINT, ...mints]).catch(() => ({}) as Record<string, { usdPrice: number }>),
  ]);

  return items.map((item) => {
    const p = parsed.get(item.id);
    return p ? applyParse(item, p, metas, prices) : item;
  });
}
