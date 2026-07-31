/**
 * Turn raw web3.js / Jupiter / RPC errors into plain-English messages with a clear
 * recourse. Users should never see a "code" error like `SendTransactionError` or
 * "Logs: []". The technical detail is still logged to the dev console (visible in
 * Metro / device logs) so we can debug — only the friendly string reaches the UI.
 */

export type ErrorAction = "swap" | "send" | "airdrop" | "load";

interface HumanizeContext {
  action?: ErrorAction;
  /** Symbol of the asset involved, used to make messages specific. */
  symbol?: string;
}

/** Pull every bit of text out of whatever was thrown (Error, SendTransactionError, string, …). */
function rawText(e: unknown): string {
  if (e == null) return "";
  if (typeof e === "string") return e;
  const any = e as { message?: unknown; logs?: unknown; toString?: () => string };
  const parts: string[] = [];
  if (typeof any.message === "string") parts.push(any.message);
  if (Array.isArray(any.logs)) parts.push(any.logs.join(" "));
  if (!parts.length && typeof any.toString === "function") {
    const s = any.toString();
    if (s !== "[object Object]") parts.push(s);
  }
  return parts.join(" ");
}

/**
 * Map a thrown error to a friendly, actionable message. Always logs the raw detail
 * for debugging first.
 */
export function humanizeError(e: unknown, ctx: HumanizeContext = {}): string {
  const raw = rawText(e);
  const low = raw.toLowerCase();
  // Keep the technical detail for us — shows up in Metro / device logs.
  console.warn(`[${ctx.action ?? "error"}] ${raw || String(e)}`);

  const asset = ctx.symbol ?? "the token";

  // Messages we authored are already friendly and specific — pass them through.
  if (/recovery phrase|already have a wallet/.test(low)) return raw;

  // Connectivity ----------------------------------------------------------------
  if (/network request failed|failed to fetch|networkerror|timeout|timed out|econnreset|network error/.test(low))
    return "Couldn't reach the network. Check your internet connection and try again.";
  if (/\b429\b|rate.?limit|too many requests/.test(low))
    return ctx.action === "airdrop"
      ? "The devnet faucet is rate-limited. Wait a minute and try again."
      : "The network is busy right now (rate-limited). Wait a few seconds and try again. Using a private RPC (set EXPO_PUBLIC_MAINNET_RPC) makes this rare.";
  if (/\b(500|502|503)\b|service unavailable|internal error/.test(low))
    return "Solana's RPC is having trouble at the moment. Give it a few seconds and try again.";

  // Slippage (check before generic "insufficient") -------------------------------
  if (/slippage|0x1771|exceeds desired|price impact too high|price moved|exceeded slippage/.test(low))
    return "The price moved more than your slippage tolerance before the trade landed. Raise the slippage a little or try again.";

  // Expired / stale blockhash ----------------------------------------------------
  if (/block height exceeded|blockhash not found|transaction expired|too old|expired/.test(low))
    return "The transaction took too long and expired before it landed. Just try again.";

  // No route ---------------------------------------------------------------------
  if (/no route|could not find any route|no routes found|route not found/.test(low))
    return "No swap route is available for this pair right now. Try a different amount or token.";

  // Insufficient funds -----------------------------------------------------------
  if (/insufficient lamports|insufficient funds for rent|found no record of a prior credit|insufficient funds|custom program error: 0x1\b/.test(low)) {
    if (ctx.action === "swap")
      return "Not enough SOL to complete the swap. You need the amount you're swapping plus a little extra SOL (about 0.005) for the network fee and token-account rent. Add SOL or lower the amount.";
    if (ctx.action === "send")
      return `Not enough balance to send this. Make sure you have enough ${asset}, plus a little SOL (about 0.001) for the network fee.`;
    return "Not enough SOL to cover this. Add a little SOL and try again.";
  }

  // Simulation failed with no useful logs — almost always the fee payer can't pay -
  if (/simulation failed|transaction simulation/.test(low))
    return ctx.action === "swap"
      ? "The network rejected the swap before running it — this is almost always too little SOL for fees. Make sure you have some SOL beyond the amount you're swapping, then try again."
      : "The network rejected the transaction before running it — usually too little SOL for fees. Add a little SOL and try again.";

  // Bad address ------------------------------------------------------------------
  if (/invalid public key|non-base58|base58|invalid address/.test(low))
    return "That doesn't look like a valid Solana address. Double-check it and paste it again.";

  // Fallback — still readable, no code dump. Raw detail is in the logs above. -----
  return "Something went wrong and it didn't go through. Please try again in a moment. If it keeps happening, the details are in the app logs.";
}
