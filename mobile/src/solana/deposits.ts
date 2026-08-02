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
import { connection, solscanTx } from "./connection";
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

// The swap fee lands in a *fresh* ATA (one per output mint), so the scan must cover the treasury's
// full set of token accounts — capping it low silently drops recently-created fee accounts. The cap
// stays only as a safety bound against a treasury with hundreds of dust accounts. getSignatures +
// getParsedTransactions are the heaviest RPC methods, so a private RPC (EXPO_PUBLIC_MAINNET_RPC) is
// strongly recommended; the shared throttle retries 429s, but the public endpoint is still slow.
const MAX_TOKEN_ACCOUNTS = 40; // bound the number of getSignaturesForAddress calls
const PER_ACCOUNT_SIGS = 4;

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

  try {
    // 1. The treasury's token accounts (both token programs) — their ATAs receive SPL deposits.
    const [legacy, t22] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
    // Scan ALL token accounts (up to the safety bound). A swap fee lands as a *small* amount in a
    // possibly-fresh ATA, so we can't prioritize by balance or age — the only way not to miss it is
    // to cover the full set. For a real treasury this is every account; the bound just guards against
    // a wallet spammed with hundreds of dust accounts.
    const tokenAccts = [...legacy.value, ...t22.value].slice(0, MAX_TOKEN_ACCOUNTS).map((a) => a.pubkey);
    const accounts = [owner, ...tokenAccts];

    // 2. Recent signatures across the wallet + token accounts, deduped, newest first.
    const sigLists = await Promise.all(
      accounts.map((a) => connection.getSignaturesForAddress(a, { limit: PER_ACCOUNT_SIGS }).catch(() => []))
    );
    const seen = new Set<string>();
    const sigs = sigLists
      .flat()
      .filter((s) => !s.err && !seen.has(s.signature) && (seen.add(s.signature), true))
      .sort((a, b) => (b.blockTime ?? 0) - (a.blockTime ?? 0))
      .slice(0, limit)
      .map((s) => s.signature);
    if (sigs.length === 0) return [];

    // 3. Parse the transactions and diff the treasury's balances.
    const txs = await connection.getParsedTransactions(sigs, { maxSupportedTransactionVersion: 0 });
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
