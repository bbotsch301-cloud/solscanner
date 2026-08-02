/**
 * Recent DEPOSITS (inflows) into a treasury address — SOL received + SPL tokens received,
 * including the 0.44% swap fees (which land in the treasury's token accounts). There's no
 * Solana history-parsing elsewhere in the app, so this reads and diffs transactions directly:
 * a positive change in the treasury's SOL or token balance across a transaction = a deposit.
 *
 * Note: SPL fee deposits reference the treasury's *token account* (ATA), not the wallet, so we
 * gather signatures from the wallet AND each of its token accounts. Heavier RPC (getParsed
 * transactions) — best on a private RPC (EXPO_PUBLIC_MAINNET_RPC). Best-effort; fails soft.
 */
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connection, isPublicRpc, solscanTx } from "./connection";
import { fetchTokenMetas } from "./tokens";
import { fetchPrices, WSOL_MINT } from "./prices";
import { nativeLogo } from "../config/logos";

export interface Deposit {
  signature: string;
  time: number | null;
  /** null = native SOL. */
  mint: string | null;
  symbol: string;
  amountUi: number;
  usd?: number;
  logoURI?: string;
  explorerUrl: string;
}

// How many of the treasury's token accounts we fan `getSignaturesForAddress` across — the single
// heaviest, most rate-limited part of the feed, so it's adaptive: a handful on the public endpoint
// (more and it 429s into "couldn't load"), the full set on a dedicated RPC so no SPL fee ATA is
// missed. Note the fee usually IS an SPL deposit — Jupiter charges it in the swap's output token,
// so it only lands as native SOL when the output is SOL.
//
// This was briefly raised to 120 on the theory that a fee could land in an account beyond the cap.
// It backfired: 121 accounts means 121 signature calls, and every one of them is wrapped in a
// catch that returns [] — so once the rate limiter starts refusing, coverage silently gets WORSE,
// not better. Breadth is not free. 40 is what was observably working.
const MAX_TOKEN_ACCOUNTS_DEDICATED = 40;
// Enough to cover the treasury's actively-paid mints without exhausting the public endpoint.
const MAX_TOKEN_ACCOUNTS_PUBLIC = 6;
const PER_ACCOUNT_SIGS = 4;
const PER_ACCOUNT_SIGS_PUBLIC = 3;
// Concurrent signature lookups per wave. Helius' free tier allows ~10 requests/second, and the
// dedicated path can span 40+ accounts — so these go out in waves instead of one burst.
const SIG_WAVE = 5;
const SIG_WAVE_PUBLIC = 3;
// Transactions to sample per deposit asked for. The floor is really "at least one per account" —
// see the round-robin below — with this as the multiplier once accounts are few.
const SIG_OVERSAMPLE = 2;
// Hard ceiling on transactions parsed per load, so a treasury with many accounts can't melt the
// rate limit. Parsed in chunks of 10, so this is ~6 batched calls.
const MAX_SIGNATURES = 60;

/** How far the scan got before it gave up — so the UI can say what actually failed. */
export type DepositsFailure = "signatures" | "transactions";

/**
 * Thrown when the deposits feed can't reach the RPC (vs. genuinely having no deposits) — lets the
 * screen show "couldn't load" instead of a misleading "No deposits yet".
 */
export class DepositsUnavailableError extends Error {
  constructor(
    message: string,
    /** "signatures" = couldn't even list the treasury's transactions; "transactions" = listed them
     *  but couldn't read a single one. Different problems, different advice. */
    readonly stage: DepositsFailure
  ) {
    super(message);
  }
}

/**
 * What the last scan actually saw. This feed has now been "fixed" several times on guesswork about
 * where coverage was being lost; these counts turn the next report into evidence. Recorded as soon
 * as signatures are in hand — a scan that fails LATER is exactly the one whose numbers we need.
 */
export interface ScanStats {
  tokenAccounts: number;
  scannedAccounts: number;
  /** Accounts whose signature lookup failed outright (rate limit, transport). */
  accountsFailed: number;
  signatures: number;
  /** Signatures whose transaction couldn't be read, even one at a time. */
  unreadable: number;
  parsed: number;
  deposits: number;
  /** Whether this ran against the shared public endpoint or a dedicated RPC. */
  publicRpc: boolean;
}
let lastScan: ScanStats | null = null;
export function lastDepositScan(): ScanStats | null {
  return lastScan;
}

type ParsedTxs = Awaited<ReturnType<typeof connection.getParsedTransactions>>;

/**
 * Read transactions with a split-retry.
 *
 * `getParsedTransactions` is ONE batched HTTP POST, and it rejects wholesale if any single element
 * in the batch errors — so one unparseable transaction used to cost the entire chunk, and if that
 * happened to every chunk, the whole feed reported "couldn't load" on a perfectly healthy RPC.
 * Halving on failure isolates the bad signature: only it is dropped, everything around it survives.
 * (Same trick as solana/txParse.ts, which hit this first.)
 */
async function readTransactions(sigs: string[], dropped: { n: number }): Promise<ParsedTxs> {
  if (sigs.length === 0) return [];
  try {
    return await connection.getParsedTransactions(sigs, { maxSupportedTransactionVersion: 0 });
  } catch {
    if (sigs.length === 1) {
      dropped.n += 1; // this one signature is the problem; lose it, not its neighbours
      return [];
    }
    const mid = sigs.length >> 1;
    const [a, b] = await Promise.all([
      readTransactions(sigs.slice(0, mid), dropped),
      readTransactions(sigs.slice(mid), dropped),
    ]);
    return [...a, ...b];
  }
}

export async function fetchDeposits(address: string, limit = 10): Promise<Deposit[]> {
  let owner: PublicKey;
  try {
    owner = new PublicKey(address);
  } catch {
    return [];
  }
  const ownerStr = owner.toBase58();

  // The public endpoint can't survive the full scan (enumerating token accounts, a signature call
  // per account, then getParsedTransactions) — it 429s and the feed fails closed. So it runs a
  // narrower version rather than being skipped: the treasury wallet plus a handful of token
  // accounts.
  //
  // The token accounts are the important part and must NOT be dropped. When a swap's output is an
  // SPL token, Jupiter charges the community fee inline into the treasury's ATA for that mint —
  // it only arrives as native SOL on a SOL-output swap. A wallet-only scan would therefore miss
  // the ordinary case entirely and report "no deposits" on a treasury that is in fact being paid.
  const light = isPublicRpc();

  try {
    // 1. The treasury's token accounts (both token programs) — their ATAs receive SPL deposits.
    //    Never fatal: losing the list degrades to a wallet-only scan rather than no feed at all.
    const [legacy, t22] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }).catch(() => null),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => null),
    ]);
    // ORDER MATTERS, and this was the bug. getParsedTokenAccountsByOwner returns every token
    // account the treasury has ever opened — including long-empty leftovers — in no useful order.
    // Taking the first N therefore let dead accounts consume the slots that actively-paid mints
    // needed, so a fee could land in a real holding that simply never got scanned.
    //
    // Balance is the right priority after all: a fee that just arrived leaves a NON-ZERO balance,
    // and it's the empty accounts that are safe to drop. Non-empty first (largest first), then
    // empties fill whatever room is left, in case a fee arrived somewhere since swept.
    const all = [...(legacy?.value ?? []), ...(t22?.value ?? [])];
    const amountOf = (a: (typeof all)[number]) =>
      Number(a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0);
    const held = all.filter((a) => amountOf(a) > 0).sort((x, y) => amountOf(y) - amountOf(x));
    const empty = all.filter((a) => amountOf(a) <= 0);
    const tokenAccts = [...held, ...empty]
      .slice(0, light ? MAX_TOKEN_ACCOUNTS_PUBLIC : MAX_TOKEN_ACCOUNTS_DEDICATED)
      .map((a) => a.pubkey);
    const accounts = [owner, ...tokenAccts];

    // 2. Recent signatures across the wallet + token accounts, deduped, newest first.
    //    Issued in small waves rather than all at once: with a dedicated RPC this can be 40+
    //    accounts, and firing them in one parallel burst blows through a free tier's
    //    requests-per-second limit — which failed the whole feed even though the key was fine.
    const perAccount = light ? PER_ACCOUNT_SIGS_PUBLIC : PER_ACCOUNT_SIGS;
    const sigLists: Awaited<ReturnType<typeof connection.getSignaturesForAddress>>[] = [];
    let accountsFailed = 0;
    const waveSize = light ? SIG_WAVE_PUBLIC : SIG_WAVE;
    for (let i = 0; i < accounts.length; i += waveSize) {
      const wave = await Promise.all(
        accounts.slice(i, i + waveSize).map((a) =>
          // null (not []) for a failure, so a rate-limited account is counted rather than looking
          // like an account with no history. That distinction is the whole point of the stats.
          connection.getSignaturesForAddress(a, { limit: perAccount }).then(
            (r) => r,
            () => null
          )
        )
      );
      for (const list of wave) {
        if (list === null) accountsFailed += 1;
        else sigLists.push(list);
      }
    }
    // THE SELECTION, and this is where recent fees were being lost. Pooling ~4 signatures from
    // each of 39 accounts and then keeping the newest 30 OVERALL sounds reasonable, but a single
    // busy account can fill that entire cut — the treasury wallet trades, so its own transactions
    // are always the newest. Every fee sitting in a quiet token account got crowded out, no matter
    // how completely we scanned (the device reported 39 of 39 accounts covered, and still nothing).
    //
    // Round-robin instead: take each account's NEWEST transaction before any account's second.
    // Every account that saw activity gets represented, which is exactly what a fee arriving in an
    // otherwise-idle account needs.
    const budget = Math.min(
      Math.max(limit * SIG_OVERSAMPLE, accounts.length),
      light ? 18 : MAX_SIGNATURES
    );
    const seen = new Set<string>();
    const picked: string[] = [];
    const deepest = sigLists.reduce((m, l) => Math.max(m, l.length), 0);
    for (let depth = 0; depth < deepest && picked.length < budget; depth++) {
      for (const list of sigLists) {
        if (picked.length >= budget) break;
        const sig = list[depth];
        if (!sig || sig.err || seen.has(sig.signature)) continue;
        seen.add(sig.signature);
        picked.push(sig.signature);
      }
    }
    const sigs = picked;

    // Record what the scan reached BEFORE the expensive part. Previously these stats were written
    // only on the happy path, so the runs that actually needed explaining — the ones that ended in
    // "Couldn't load deposits" — reported nothing at all.
    lastScan = {
      tokenAccounts: all.length,
      scannedAccounts: accounts.length,
      accountsFailed,
      signatures: sigs.length,
      unreadable: 0,
      parsed: 0,
      deposits: 0,
      publicRpc: light,
    };

    // Not a single account answered — the treasury address itself is unreachable, which is an
    // outage rather than a treasury with no history.
    if (sigs.length === 0) {
      if (accountsFailed > 0) {
        throw new DepositsUnavailableError("Couldn't list the treasury's transactions.", "signatures");
      }
      return [];
    }

    // 3. Parse the transactions and diff the treasury's balances. Chunked, and each chunk halves
    //    itself on failure, so one unreadable transaction costs one row instead of the feed.
    const CHUNK = light ? 3 : 10;
    const dropped = { n: 0 };
    const txs: ParsedTxs = [];
    for (let i = 0; i < sigs.length; i += CHUNK) {
      txs.push(...(await readTransactions(sigs.slice(i, i + CHUNK), dropped)));
    }
    lastScan.unreadable = dropped.n;
    lastScan.parsed = txs.filter(Boolean).length;
    // Nothing readable at all — an outage, not an empty treasury.
    if (txs.length === 0) {
      throw new DepositsUnavailableError("Couldn't read treasury transactions.", "transactions");
    }
    const raw: { signature: string; time: number | null; mint: string | null; amountUi: number }[] = [];
    for (const tx of txs) {
      if (!tx || !tx.meta || tx.meta.err) continue;
      const signature = tx.transaction.signatures[0];
      const time = tx.blockTime ?? null;
      const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());

      // SOL inflow to the wallet itself.
      const wi = keys.indexOf(ownerStr);
      if (wi >= 0) {
        const delta = (tx.meta.postBalances[wi] - tx.meta.preBalances[wi]) / LAMPORTS_PER_SOL;
        if (delta > 0.000001) raw.push({ signature, time, mint: null, amountUi: delta });
      }

      // SPL inflow to any treasury-owned token account.
      const pre = new Map<string, number>();
      for (const b of tx.meta.preTokenBalances ?? []) {
        if (b.owner === ownerStr) pre.set(`${b.accountIndex}:${b.mint}`, b.uiTokenAmount.uiAmount ?? 0);
      }
      for (const b of tx.meta.postTokenBalances ?? []) {
        if (b.owner !== ownerStr) continue;
        const delta = (b.uiTokenAmount.uiAmount ?? 0) - (pre.get(`${b.accountIndex}:${b.mint}`) ?? 0);
        if (delta > 0) raw.push({ signature, time, mint: b.mint, amountUi: delta });
      }
    }
    if (raw.length === 0) return [];

    // 4. Newest first, trimmed to what was asked for, THEN enriched — oversampling above means
    //    `raw` can hold far more than `limit`, and pricing rows nobody will see is wasted calls.
    raw.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
    raw.splice(limit);
    if (lastScan) lastScan.deposits = raw.length;

    const mints = [...new Set(raw.map((r) => r.mint).filter((m): m is string => !!m))];
    const [metas, prices] = await Promise.all([
      fetchTokenMetas(mints).catch(() => ({}) as Awaited<ReturnType<typeof fetchTokenMetas>>),
      fetchPrices([WSOL_MINT, ...mints]).catch(() => ({}) as Awaited<ReturnType<typeof fetchPrices>>),
    ]);
    return raw
      .map((r) => {
        const meta = r.mint ? metas[r.mint] : undefined;
        const priceMint = r.mint ?? WSOL_MINT;
        const price = prices[priceMint]?.usdPrice;
        return {
          signature: r.signature,
          time: r.time,
          mint: r.mint,
          symbol: r.mint ? meta?.symbol ?? `${r.mint.slice(0, 4)}…` : "SOL",
          amountUi: r.amountUi,
          usd: price != null ? r.amountUi * price : undefined,
          logoURI: r.mint ? meta?.logoURI : nativeLogo.solana,
          explorerUrl: solscanTx(r.signature),
        };
      })
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  } catch (e) {
    // The RPC calls (token-account lookup / getParsedTransactions) failed — signal "couldn't load"
    // so the screen doesn't render a misleading "No deposits yet". Genuine no-inflows still returns [].
    if (e instanceof DepositsUnavailableError) throw e; // already staged; don't flatten it
    throw new DepositsUnavailableError("Couldn't reach the RPC to read treasury deposits.", "signatures");
  }
}
