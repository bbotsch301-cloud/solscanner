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
// Transactions to sample per deposit asked for — see the slice below. Kept modest for the same
// reason as the account cap: each extra transaction is another batched RPC call competing with the
// signature fan-out for the same rate limit.
const SIG_OVERSAMPLE = 2;

/**
 * Thrown when the deposits feed can't reach the RPC (vs. genuinely having no deposits) — lets the
 * screen show "couldn't load" instead of a misleading "No deposits yet".
 */
export class DepositsUnavailableError extends Error {}

/**
 * What the last scan actually saw. This feed has now been "fixed" several times on guesswork about
 * where coverage was being lost; these counts turn the next report into evidence.
 */
export interface ScanStats {
  tokenAccounts: number;
  scannedAccounts: number;
  signatures: number;
  parsed: number;
  deposits: number;
}
let lastScan: ScanStats | null = null;
export function lastDepositScan(): ScanStats | null {
  return lastScan;
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
    const waveSize = light ? SIG_WAVE_PUBLIC : SIG_WAVE;
    for (let i = 0; i < accounts.length; i += waveSize) {
      const wave = await Promise.all(
        accounts
          .slice(i, i + waveSize)
          .map((a) => connection.getSignaturesForAddress(a, { limit: perAccount }).catch(() => []))
      );
      sigLists.push(...wave);
    }
    const seen = new Set<string>();
    const sigs = sigLists
      .flat()
      .filter((s) => !s.err && !seen.has(s.signature) && (seen.add(s.signature), true))
      .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
      // `limit` counts DEPOSITS, not transactions. Most of a treasury's recent activity produces
      // no inflow at all, so slicing signatures to `limit` meant asking for 15 deposits and
      // parsing only 15 transactions — of which just a few were deposits. Over-fetch instead.
      .slice(0, Math.min(limit * SIG_OVERSAMPLE, light ? 18 : 40))
      .map((s) => s.signature);
    // Signatures came back, so the treasury address itself is reachable. From here on, an RPC
    // failure degrades to fewer deposits rather than none.
    if (sigs.length === 0) return [];

    // 3. Parse the transactions and diff the treasury's balances. Fetched in small chunks so one
    //    rate-limited batch costs a few rows instead of the entire feed.
    const CHUNK = light ? 3 : 10;
    const txs: Awaited<ReturnType<typeof connection.getParsedTransactions>> = [];
    for (let i = 0; i < sigs.length; i += CHUNK) {
      const batch = await connection
        .getParsedTransactions(sigs.slice(i, i + CHUNK), { maxSupportedTransactionVersion: 0 })
        .catch(() => []);
      txs.push(...batch);
    }
    // Every batch failed and we have nothing to show — that's an outage, not an empty treasury.
    if (txs.length === 0) throw new DepositsUnavailableError("Couldn't read treasury transactions.");
    lastScan = {
      tokenAccounts: all.length,
      scannedAccounts: accounts.length,
      signatures: sigs.length,
      parsed: txs.filter(Boolean).length,
      deposits: 0,
    };
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
  } catch {
    // The RPC calls (token-account lookup / getParsedTransactions) failed — signal "couldn't load"
    // so the screen doesn't render a misleading "No deposits yet". Genuine no-inflows still returns [].
    throw new DepositsUnavailableError("Couldn't reach the RPC to read treasury deposits.");
  }
}
