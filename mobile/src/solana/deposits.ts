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

// The number of the treasury's token accounts we fan `getSignaturesForAddress` across — the single
// heaviest, most rate-limited part of the feed. It's ADAPTIVE so the app works with no RPC key out
// of the box: on the public endpoint we stay light (or the whole feed 429s and shows "couldn't
// load"); on a dedicated RPC we scan the full set so no SPL fee ATA is missed. The common swap fee
// (a SOL-output swap) lands on the treasury WALLET itself, which is always scanned, so even the
// light path catches it without a key.
const MAX_TOKEN_ACCOUNTS_DEDICATED = 40;
const PER_ACCOUNT_SIGS = 4;
// The public path scans the wallet alone, so it can afford a deeper slice of its history.
const PER_ACCOUNT_SIGS_PUBLIC = 10;

/**
 * Thrown when the deposits feed can't reach the RPC (vs. genuinely having no deposits) — lets the
 * screen show "couldn't load" instead of a misleading "No deposits yet".
 */
export class DepositsUnavailableError extends Error {}

export async function fetchDeposits(address: string, limit = 10): Promise<Deposit[]> {
  let owner: PublicKey;
  try {
    owner = new PublicKey(address);
  } catch {
    return [];
  }
  const ownerStr = owner.toBase58();

  // The public endpoint can't survive the full scan: enumerating token accounts (2 calls) plus a
  // signature call per account (9+) plus getParsedTransactions, mostly in parallel bursts, reliably
  // 429s and the whole feed fails closed. So the public path deliberately scans ONLY the treasury
  // wallet — 2 calls total. That still catches the self-collected swap fee, which is a plain SOL
  // transfer to the wallet itself; it's SPL deposits into fresh ATAs that need the wide scan and a
  // dedicated RPC. Partial data beats "couldn't load".
  const light = isPublicRpc();

  try {
    // 1. The treasury's token accounts (both token programs) — their ATAs receive SPL deposits.
    //    Skipped entirely on the public endpoint, and never fatal: losing the ATA list just means
    //    a wallet-only scan, which is far better than no feed at all.
    let tokenAccts: PublicKey[] = [];
    if (!light) {
      const [legacy, t22] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }).catch(() => null),
        connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }).catch(() => null),
      ]);
      // A swap fee lands as a *small* amount in a possibly-fresh ATA, so we can't prioritize by
      // balance or age — coverage is the only way not to miss it.
      tokenAccts = [...(legacy?.value ?? []), ...(t22?.value ?? [])]
        .slice(0, MAX_TOKEN_ACCOUNTS_DEDICATED)
        .map((a) => a.pubkey);
    }
    const accounts = [owner, ...tokenAccts];

    // 2. Recent signatures across the wallet + token accounts, deduped, newest first. Sequential on
    //    the public endpoint (one call) so there's no parallel burst to rate-limit.
    const perAccount = light ? PER_ACCOUNT_SIGS_PUBLIC : PER_ACCOUNT_SIGS;
    const sigLists = await Promise.all(
      accounts.map((a) => connection.getSignaturesForAddress(a, { limit: perAccount }).catch(() => []))
    );
    const seen = new Set<string>();
    const sigs = sigLists
      .flat()
      .filter((s) => !s.err && !seen.has(s.signature) && (seen.add(s.signature), true))
      .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
      .slice(0, limit)
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

    // 4. Enrich with symbol/logo + USD value.
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
