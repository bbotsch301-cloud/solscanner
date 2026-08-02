/**
 * Jupiter swap quotes + execution. Jupiter only has liquidity/routing on
 * mainnet-beta, so quotes reflect real mainnet rates even while the wallet runs
 * on devnet; executeSwap only does anything real once NETWORK is mainnet.
 */
import { Buffer } from "buffer";
import { Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { connection } from "./connection";
import { XGO_MINT } from "./token2022";
import { feeBpsFor, TREASURY_FEE_OWNER } from "../config/swapFee";
import { recordFeeAttempt } from "./feeDiagnostics";
import { solLogo } from "../config/logos";
import { toBaseUnits } from "../units";
import { confirmWithRecovery } from "./tx";

/**
 * Jupiter's DEX label(s) for the AMMs the treasury owns liquidity on. The treasury
 * pool is a Raydium CPMM (program CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C).
 * Jupiter labels it "Raydium CP"; both spellings are included in case the label
 * text changes — a non-matching label is simply ignored by Jupiter. The exact
 * current label is the value for that program id at:
 *   https://lite-api.jup.ag/swap/v1/program-id-to-label
 * Note: plain "Raydium" (AMM v4) is deliberately NOT listed — that's a different
 * pool we don't own. If we open treasury pools on Meteora/Orca later, add those.
 * If the label is ever wrong, routing degrades gracefully: the pinned quote just
 * returns nothing and we fall back to the open market (which still routes through
 * our pool whenever it's the deepest XGO liquidity).
 */
const TREASURY_DEX_LABELS = ["Raydium CP", "Raydium CPMM"];

/**
 * Route XGO trades through the treasury's own pool by default, and only fall back
 * to the open market when the treasury price is worse by MORE than this many basis
 * points ("unless the price is crazy off"). Higher = stickier to our pool; lower =
 * quicker to bail for a better fill. 150 bps = 1.5%. Tunable.
 */
const PREFER_OWN_POOL_MAX_WORSE_BPS = Number(
  process.env.EXPO_PUBLIC_TREASURY_MAX_WORSE_BPS ?? 150
);

const SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * The token the treasury pool quotes XGO against. The primary pool is XGO/SOL —
 * SOL is Solana's universal routing hop, so an XGO/SOL pool sits on the XGO leg of
 * almost every XGO trade (USDC→SOL→XGO, BONK→SOL→XGO, …), not just direct SOL
 * swaps. Only SOL↔XGO is a single-hop trade against our pool; for other XGO pairs
 * we let Jupiter hop through SOL and detect when the route used our pool.
 */
const TREASURY_QUOTE_MINT = SOL_MINT;

const JUP_QUOTE = "https://lite-api.jup.ag/swap/v1/quote";

const LOGO = (mint: string): string | undefined => solLogo[mint];

export interface SwapToken {
  mint: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  /** Full token name, for the picker subtitle. */
  name?: string;
  /** True when Jupiter lists the token as verified. Undefined = unknown. */
  verified?: boolean;
}

/**
 * XGO — the treasury/community token, the default "receive" side of the swapper.
 * NOTE: XGO isn't listed yet; `decimals` is normally read live on-chain. 6 is a
 * placeholder that only affects the pre-quote receive display (there's no quote until
 * XGO has liquidity) — confirm against the live mint before mainnet launch.
 */
export const XGO_TOKEN: SwapToken = { mint: XGO_MINT, symbol: "XGO", decimals: 6 };

/** A small curated set of liquid mainnet tokens to swap between. */
export const SWAP_TOKENS: SwapToken[] = [
  { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", decimals: 9, logoURI: LOGO("So11111111111111111111111111111111111111112") },
  { mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6, logoURI: LOGO("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v") },
  { mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT", decimals: 6, logoURI: LOGO("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB") },
  { mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", symbol: "JUP", decimals: 6, logoURI: LOGO("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN") },
  { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", symbol: "BONK", decimals: 5, logoURI: LOGO("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263") },
  XGO_TOKEN,
];

/** Where a quote ends up routing. */
export type Venue = "treasury" | "market";

export interface Quote {
  /** UI output amount (decimals applied). */
  outAmount: number;
  /** Price impact as a percentage, e.g. 0.12 = 0.12%. */
  priceImpactPct: number;
  /** AMM labels the route goes through. */
  routeLabels: string[];
  /** Full Jupiter quote response, needed to build the swap transaction. */
  raw: unknown;
  /** Which liquidity this quote uses. */
  venue: Venue;
  /** True when this pair has a treasury pool we try to prefer (i.e. an XGO trade). */
  isTreasuryPair: boolean;
  /**
   * True when it's a treasury pair but the treasury pool was priced badly enough
   * that we fell back to the open market to protect the trade.
   */
  fellBack: boolean;
  /** How much worse the treasury pool was vs the best market price, in bps (null if unknown). */
  gapBps: number | null;
  /** Community fee applied to this quote, in bps (0 for XGO trades / when uncollected). */
  feeBps: number;
  /** True when Jupiter actually charged the platform fee on this quote. It returns platformFee:null
   *  for SOL-output swaps (the SOL leg it unwraps) and sub-threshold amounts — in which case the fee
   *  is self-collected by executeSwap instead, so the treasury is funded either way. */
  platformFeeApplied: boolean;
  /** True when executing will also create the treasury's fee token account for the output mint —
   *  a one-time ~0.002 SOL rent the swapper pays. Disclosed in the UI. */
  feeAccountSetup: boolean;
}

interface RawQuote {
  json: {
    outAmount?: string;
    priceImpactPct?: string;
    routePlan?: { swapInfo?: { label?: string } }[];
  };
  outRaw: number;
}

/** One Jupiter quote request. `restrictToTreasury` pins routing to our pool's AMM. */
async function requestQuote(
  inputMint: string,
  outputMint: string,
  rawAmount: bigint,
  slippageBps: number,
  restrictToTreasury: boolean,
  platformFeeBps: number
): Promise<RawQuote | null> {
  let url =
    `${JUP_QUOTE}?inputMint=${inputMint}&outputMint=${outputMint}` +
    `&amount=${rawAmount}&slippageBps=${slippageBps}`;
  if (platformFeeBps > 0) url += `&platformFeeBps=${platformFeeBps}`;
  if (restrictToTreasury) {
    // Force a single-hop route on the AMM(s) we own liquidity on.
    url +=
      `&dexes=${encodeURIComponent(TREASURY_DEX_LABELS.join(","))}` +
      `&onlyDirectRoutes=true`;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as RawQuote["json"];
    if (!json?.outAmount) return null;
    return { json, outRaw: Number(json.outAmount) };
  } catch {
    return null;
  }
}

// Whether the treasury already has a fee token account for `mint`. Cached per mint so the quote
// debounce doesn't re-check on every keystroke (only the output token matters, not the amount).
const feeAtaExistsCache = new Map<string, boolean>();
async function treasuryFeeAtaExists(mint: string): Promise<boolean> {
  if (!TREASURY_FEE_OWNER) return true;
  const cached = feeAtaExistsCache.get(mint);
  if (cached !== undefined) return cached;
  try {
    const mintPk = new PublicKey(mint);
    const mintInfo = await connection.getAccountInfo(mintPk);
    const programId = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const ata = getAssociatedTokenAddressSync(mintPk, new PublicKey(TREASURY_FEE_OWNER), true, programId);
    const exists = !!(await connection.getAccountInfo(ata));
    feeAtaExistsCache.set(mint, exists);
    return exists;
  } catch {
    return true; // on RPC error, don't show a misleading setup cost
  }
}

export async function fetchQuote(
  input: SwapToken,
  output: SwapToken,
  uiAmount: number,
  slippageBps = 50
): Promise<Quote> {
  const rawAmount = toBaseUnits(uiAmount, input.decimals); // exact base units — never float-multiply
  if (rawAmount <= 0n) throw new Error("Enter an amount");

  const isTreasuryPair = input.mint === XGO_MINT || output.mint === XGO_MINT;
  const otherMint = input.mint === XGO_MINT ? output.mint : input.mint;
  // Only SOL↔XGO is a single hop against our pool; pin routing just for that case.
  // Other XGO pairs route through SOL, and we detect our pool from the labels.
  const directlyPoolable = isTreasuryPair && otherMint === TREASURY_QUOTE_MINT;

  // Community fee: 0.44% on non-XGO trades (0 for XGO, which its own transfer fee already taxes),
  // collected to the treasury. executeSwap deposits it into the treasury's output-token account.
  const feeBps = TREASURY_FEE_OWNER ? feeBpsFor(input.mint, output.mint) : 0;
  // A one-time ~0.002 SOL rent applies when executing will create the treasury's fee account for
  // this output mint (the first swapper into a token pays it). Disclose it in the quote.
  const feeAccountSetup = feeBps > 0 && !(await treasuryFeeAtaExists(output.mint));

  const [market, pinned] = await Promise.all([
    requestQuote(input.mint, output.mint, rawAmount, slippageBps, false, feeBps),
    directlyPoolable
      ? requestQuote(input.mint, output.mint, rawAmount, slippageBps, true, feeBps)
      : Promise.resolve(null),
  ]);

  if (!market && !pinned) throw new Error("No route available");

  // Prefer the pinned treasury pool unless it's worse than the open market by more
  // than the "crazy off" threshold. If only one quote exists, take it.
  let chosen: RawQuote;
  let fellBack = false;
  let gapBps: number | null = null;

  if (pinned && market) {
    gapBps = Math.max(0, ((market.outRaw - pinned.outRaw) / market.outRaw) * 10000);
    if (gapBps <= PREFER_OWN_POOL_MAX_WORSE_BPS) {
      chosen = pinned;
    } else {
      chosen = market;
      fellBack = true; // our pool was priced too far off; protect the trade
    }
  } else {
    chosen = pinned ?? market!;
  }

  const j = chosen.json;
  // Whether Jupiter actually charged the platform fee (it echoes a non-null platformFee only then).
  const pfAmount = (j as { platformFee?: { amount?: string | number } | null }).platformFee?.amount;
  const platformFeeApplied = Number(pfAmount ?? 0) > 0;
  const routeLabels = (j.routePlan ?? [])
    .map((r) => r.swapInfo?.label)
    .filter((l): l is string => !!l);
  // Venue is truth-checked against the actual route: treasury when any leg runs on
  // our AMM (covers both the pinned SOL↔XGO hop and a market route that hops
  // through our XGO/SOL pool, e.g. USDC→SOL→XGO).
  const venue: Venue = routeLabels.some((l) => TREASURY_DEX_LABELS.includes(l))
    ? "treasury"
    : "market";

  return {
    outAmount: chosen.outRaw / 10 ** output.decimals,
    priceImpactPct: Math.abs(Number(j.priceImpactPct ?? 0)) * 100,
    routeLabels,
    raw: j,
    venue,
    isTreasuryPair,
    fellBack,
    gapBps,
    feeBps,
    platformFeeApplied,
    feeAccountSetup,
  };
}

/** Community fee (output token) when Jupiter didn't take it — a best-effort SECOND transaction that
 *  transfers `feeBase` of the output to the treasury. SOL output → a plain lamport transfer to the
 *  treasury wallet; SPL output → a transferChecked into the treasury's (idempotently-created) ATA.
 *  Throws are the caller's to swallow: the swap already succeeded, so a failed fee never fails it. */
async function selfCollectFee(keypair: Keypair, outputMint: string, decimals: number, feeBase: bigint): Promise<string> {
  if (feeBase <= 0n) throw new Error("computed fee was zero (check the quote's outAmount)");
  if (!TREASURY_FEE_OWNER) throw new Error("no TREASURY_FEE_OWNER configured");
  const owner = new PublicKey(TREASURY_FEE_OWNER);
  const tx = new Transaction();
  if (outputMint === SOL_MINT) {
    // The swap unwrapped wSOL, so the user holds native SOL; skim the fee to the treasury wallet.
    tx.add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: owner, lamports: Number(feeBase) }));
  } else {
    const mintPk = new PublicKey(outputMint);
    const mintInfo = await connection.getAccountInfo(mintPk);
    const programId = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const userAta = getAssociatedTokenAddressSync(mintPk, keypair.publicKey, false, programId);
    const treasuryAta = getAssociatedTokenAddressSync(mintPk, owner, true, programId);
    if (!(await connection.getAccountInfo(treasuryAta))) {
      tx.add(createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, treasuryAta, owner, mintPk, programId));
    }
    tx.add(createTransferCheckedInstruction(userAta, mintPk, treasuryAta, keypair.publicKey, feeBase, decimals, [], programId));
  }
  return await sendAndConfirmTransaction(connection, tx, [keypair]);
}

/**
 * Execute a swap on the CURRENT network. Only meaningful on mainnet — Jupiter has
 * no devnet liquidity. Builds the swap transaction from the quote, signs it with
 * the wallet keypair, and submits it. Returns the transaction signature.
 *
 * `feeCtx` lets the community fee be self-collected when Jupiter declines to charge its platform fee
 * (notably SOL-output swaps), so the treasury is funded on every non-XGO swap regardless.
 */
export async function executeSwap(
  rawQuote: unknown,
  keypair: Keypair,
  feeCtx?: { feeBps: number; outputDecimals: number }
): Promise<string> {
  // The community fee (present on the quote as `platformFee`) is taken in the OUTPUT token and
  // paid to the treasury's associated token account for that mint. Jupiter won't create that
  // account, so create it idempotently first (a one-time ~0.002 SOL rent, only the first time
  // anyone swaps into a given token). Then hand the account to Jupiter as the feeAccount.
  const q = rawQuote as { outputMint?: string; platformFee?: { amount?: string } | null };
  let feeAccount: string | undefined;
  if (q.platformFee && q.outputMint && TREASURY_FEE_OWNER) {
    const owner = new PublicKey(TREASURY_FEE_OWNER);
    const mintPk = new PublicKey(q.outputMint);
    const mintInfo = await connection.getAccountInfo(mintPk);
    const programId = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const ata = getAssociatedTokenAddressSync(mintPk, owner, true, programId);
    if (!(await connection.getAccountInfo(ata))) {
      const setup = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, ata, owner, mintPk, programId)
      );
      await sendAndConfirmTransaction(connection, setup, [keypair]);
    }
    feeAccount = ata.toBase58();
  }

  const res = await fetch("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: rawQuote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      ...(feeAccount ? { feeAccount } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Swap build failed (${res.status})`);
  const { swapTransaction, lastValidBlockHeight } = (await res.json()) as {
    swapTransaction?: string;
    lastValidBlockHeight?: number;
  };
  if (!swapTransaction) throw new Error("No swap transaction returned");

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
  tx.sign([keypair]);

  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  // Confirm against the transaction's OWN blockhash + expiry window (from Jupiter), not a
  // blockhash fetched after send — otherwise the confirmation deadline doesn't match the tx.
  const strategy =
    lastValidBlockHeight != null
      ? { signature: sig, blockhash: tx.message.recentBlockhash, lastValidBlockHeight }
      : { signature: sig, ...(await connection.getLatestBlockhash()) };
  await confirmWithRecovery(sig, strategy); // guard: a landed-but-slow confirm resolves as success

  // If Jupiter didn't charge the platform fee (e.g. a SOL-output swap), skim the community fee
  // ourselves so the treasury is still funded. Best-effort: the swap has already landed, so a
  // failed fee transfer is logged, never surfaced as a swap failure.
  const feeBps = feeCtx?.feeBps ?? 0;
  if (q.platformFee && feeAccount) {
    // Jupiter charged it inline as part of the swap itself — nothing more to send.
    recordFeeAttempt({
      at: Date.now(),
      swapSignature: sig,
      outputMint: q.outputMint ?? "",
      feeBase: String(q.platformFee.amount ?? ""),
      route: "jupiter",
      ok: true,
      detail: `charged inline to ${feeAccount}`,
    });
  } else if (feeBps > 0 && q.outputMint) {
    const outAmount = BigInt((rawQuote as { outAmount?: string }).outAmount ?? "0");
    const feeBase = (outAmount * BigInt(feeBps)) / 10000n;
    const base = {
      at: Date.now(),
      swapSignature: sig,
      outputMint: q.outputMint,
      feeBase: String(feeBase),
      route: "self" as const,
    };
    try {
      const feeSig = await selfCollectFee(keypair, q.outputMint, feeCtx?.outputDecimals ?? 0, feeBase);
      recordFeeAttempt({ ...base, ok: true, detail: feeSig });
    } catch (e) {
      // Still swallowed — the swap already landed and must not be reported as failed — but the
      // reason is now recorded so the swap screen and the treasury can both explain it.
      recordFeeAttempt({ ...base, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return sig;
}
