/**
 * Working out what a confirmed Solana transaction actually DID to your wallet.
 *
 * The activity feed only ever had signatures, so every row read "Transaction" — the same line
 * whether you swapped, were paid, or approved something. This derives the real story by diffing the
 * owner's balances across the transaction: which assets left, which arrived, and therefore what
 * kind of action it was.
 *
 * The diff itself is the one in `deposits.ts`, generalised — that version keeps only inflows
 * (it exists to spot treasury deposits), whereas a history row needs the outgoing side too.
 *
 * Parsed results are cached FOREVER, keyed by signature. A confirmed transaction is immutable, so
 * unlike balances or prices there is nothing to invalidate — which is what makes enriching 25 rows
 * affordable on a rate-limited RPC. Second visit costs zero calls.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { connection, CLUSTER, isPublicRpc } from "./connection";
import { WSOL_MINT } from "./prices";

export type ActivityKind = "swap" | "received" | "sent" | "interaction" | "failed";

export interface AssetMove {
  /** null = native SOL. */
  mint: string | null;
  /** Positive magnitude; the direction is which list it's in. */
  amount: number;
}

export interface ParsedTx {
  signature: string;
  kind: ActivityKind;
  /** Assets that arrived in the wallet. */
  moveIn: AssetMove[];
  /** Assets that left it. */
  moveOut: AssetMove[];
  /** Network fee in SOL, when this wallet paid it. */
  feeSol: number;
}

const CACHE_KEY = "tx.parsed.v1:";
// Keyed by OWNER as well as signature, and scoped to the cluster. The same transaction means
// different things to different wallets — what one account received, another sent — so a
// signature-only key would show the wrong label after an account switch.
const keyFor = (owner: string, signature: string) => `${CLUSTER}:${owner}:${signature}`;
// Creating or closing a token account moves ~0.00204 SOL of rent-exempt deposit, which is
// indistinguishable from a small transfer by amount alone. So native movement alongside other
// assets only counts as a real leg once it exceeds roughly one account's rent — otherwise every
// swap that opened an ATA would also claim you sent SOL. When native is the ONLY thing that moved
// there's no rent to confuse it with, so a genuine small send still reads correctly.
const RENT_NOISE_SOL = 0.0025;
const DUST_SOL = 0.00001;

const memo = new Map<string, ParsedTx>();

/** Synchronously read an already-parsed transaction, for instant rendering. */
export function cachedParse(owner: string, signature: string): ParsedTx | undefined {
  return memo.get(keyFor(owner, signature));
}

/** Warm the in-memory cache from disk at startup, so a cold open paints enriched rows. */
export async function loadParsedTxCache(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(CACHE_KEY));
    if (!keys.length) return;
    for (const [k, raw] of await AsyncStorage.multiGet(keys)) {
      if (!raw) continue;
      try {
        memo.set(k.slice(CACHE_KEY.length), JSON.parse(raw) as ParsedTx);
      } catch {
        /* skip a corrupt entry */
      }
    }
  } catch {
    /* best-effort */
  }
}

function remember(owner: string, p: ParsedTx): void {
  const k = keyFor(owner, p.signature);
  memo.set(k, p);
  AsyncStorage.setItem(CACHE_KEY + k, JSON.stringify(p)).catch(() => {});
}

type Parsed = NonNullable<Awaited<ReturnType<typeof connection.getParsedTransactions>>[number]>;

/**
 * Net per-asset movement for `owner`, with the two things that otherwise produce confident wrong
 * answers already handled.
 */
function deltasFor(tx: Parsed, owner: string): { byAsset: Map<string | null, number>; feeSol: number } {
  const byAsset = new Map<string | null, number>();
  const meta = tx.meta!;
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());

  // TRAP 1 — the fee makes a pure receive look like a swap. The network fee comes out of the native
  // balance, so being paid a token leaves SOL at −fee, and a naive diff sees "one asset out, one
  // in" and calls it a swap. Only the fee payer (the first signer) is actually charged.
  const feeSol = keys[0] === owner ? meta.fee / LAMPORTS_PER_SOL : 0;

  const wi = keys.indexOf(owner);
  if (wi >= 0) {
    const native = (meta.postBalances[wi] - meta.preBalances[wi]) / LAMPORTS_PER_SOL + feeSol;
    if (native !== 0) byAsset.set(null, native);
  }

  const pre = new Map<string, number>();
  for (const b of meta.preTokenBalances ?? []) {
    if (b.owner === owner) pre.set(`${b.accountIndex}:${b.mint}`, b.uiTokenAmount.uiAmount ?? 0);
  }
  const seen = new Set<string>();
  for (const b of meta.postTokenBalances ?? []) {
    if (b.owner !== owner) continue;
    const k = `${b.accountIndex}:${b.mint}`;
    seen.add(k);
    const delta = (b.uiTokenAmount.uiAmount ?? 0) - (pre.get(k) ?? 0);
    if (delta === 0) continue;
    // TRAP 2 — wrapped SOL double-counts a leg. Swapping SOL wraps it to WSOL and unwraps after, so
    // the WSOL movement and the native movement describe the same side of the trade. Fold WSOL into
    // native rather than reporting "SOL → WSOL → USDC".
    const key = b.mint === WSOL_MINT ? null : b.mint;
    byAsset.set(key, (byAsset.get(key) ?? 0) + delta);
  }
  // A token account emptied and closed has a post balance of zero that never appears in
  // postTokenBalances — catch those as outflows.
  for (const [k, amount] of pre) {
    if (seen.has(k) || amount === 0) continue;
    const mint = k.slice(k.indexOf(":") + 1);
    const key = mint === WSOL_MINT ? null : mint;
    byAsset.set(key, (byAsset.get(key) ?? 0) - amount);
  }

  // Apply the native threshold LAST — after WSOL folding, which can cancel native back to ~zero
  // (or create it). The bar depends on whether anything else moved, per RENT_NOISE_SOL above.
  const nat = byAsset.get(null);
  if (nat !== undefined) {
    const soleLeg = byAsset.size === 1;
    const floor = soleLeg ? DUST_SOL : RENT_NOISE_SOL;
    if (Math.abs(nat) <= floor) byAsset.delete(null);
  }

  return { byAsset, feeSol };
}

function classify(tx: Parsed, owner: string): ParsedTx {
  const signature = tx.transaction.signatures[0];
  if (tx.meta?.err) return { signature, kind: "failed", moveIn: [], moveOut: [], feeSol: 0 };

  const { byAsset, feeSol } = deltasFor(tx, owner);
  const moveIn: AssetMove[] = [];
  const moveOut: AssetMove[] = [];
  for (const [mint, delta] of byAsset) {
    if (delta > 0) moveIn.push({ mint, amount: delta });
    else if (delta < 0) moveOut.push({ mint, amount: -delta });
  }
  // Biggest movement first, so the row leads with what matters.
  moveIn.sort((a, b) => b.amount - a.amount);
  moveOut.sort((a, b) => b.amount - a.amount);

  const kind: ActivityKind =
    moveIn.length && moveOut.length ? "swap" : moveIn.length ? "received" : moveOut.length ? "sent" : "interaction";

  return { signature, kind, moveIn, moveOut, feeSol };
}

/**
 * Parse any signatures not already cached. Never throws — an unparsed signature simply stays
 * unenriched and its row keeps the plain appearance it had before, which must never be a
 * regression on what the feed showed previously.
 */
export async function parseTransactions(signatures: string[], owner: string): Promise<Map<string, ParsedTx>> {
  const out = new Map<string, ParsedTx>();
  const missing: string[] = [];
  for (const s of signatures) {
    const hit = memo.get(keyFor(owner, s));
    if (hit) out.set(s, hit);
    else missing.push(s);
  }
  if (!missing.length) return out;

  // Same batching the treasury feed had to settle on — a wider fan-out rate-limits into failure.
  const chunk = isPublicRpc() ? 3 : 10;
  for (let i = 0; i < missing.length; i += chunk) {
    await parseChunk(missing.slice(i, i + chunk), owner, out);
  }
  return out;
}

/**
 * Parse one batch, halving on failure.
 *
 * web3.js sends `getParsedTransactions` as a SINGLE batched JSON-RPC POST and throws if any one
 * element comes back with an error — so a plain catch around a 10-wide batch loses ten rows to one
 * unreadable signature. Splitting isolates the bad one and keeps its neighbours.
 */
async function parseChunk(sigs: string[], owner: string, out: Map<string, ParsedTx>): Promise<void> {
  if (!sigs.length) return;
  let batch: Awaited<ReturnType<typeof connection.getParsedTransactions>> | null = null;
  try {
    batch = await connection.getParsedTransactions(sigs, { maxSupportedTransactionVersion: 0 });
  } catch {
    if (sigs.length === 1) return; // genuinely unreadable — leave the row plain
    const mid = Math.ceil(sigs.length / 2);
    await parseChunk(sigs.slice(0, mid), owner, out);
    await parseChunk(sigs.slice(mid), owner, out);
    return;
  }
  for (const tx of batch ?? []) {
    if (!tx?.meta) continue;
    try {
      const p = classify(tx, owner);
      remember(owner, p);
      out.set(p.signature, p);
    } catch {
      /* one unreadable transaction shouldn't cost the rest of the feed */
    }
  }
}
