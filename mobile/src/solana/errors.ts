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
  /** The chain's native gas token (SOL / ETH / BNB) so fee messages name the right coin. */
  native?: string;
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
  const native = ctx.native ?? "SOL"; // gas token — SOL, ETH, or BNB

  // Messages we authored are already friendly and specific — pass them through.
  if (/recovery phrase|already have a wallet|secure randomness|wallet already exists|secure storage/.test(low))
    return raw;

  // Confirmation timeout — the tx was sent but the (slow/rate-limited) RPC didn't confirm it in
  // time. It MAY still land, so tell the user to check before resending (avoids double-sends).
  // Checked BEFORE generic connectivity so "timed out waiting…" doesn't read as "no internet".
  if (/not confirmed|unknown if it succeeded|node is behind|timed out waiting|confirmation tim|was not confirmed/.test(low))
    // Points at Settings, not at env vars: naming build-time variables in a message a user reads
    // gives them nothing they can act on.
    return "The network is congested and your transaction didn't confirm in time — it may still go through. Check it on the explorer before sending again. Setting a dedicated RPC in Settings makes this reliable.";

  // Connectivity ----------------------------------------------------------------
  if (/network request failed|failed to fetch|networkerror|timeout|timed out|econnreset|network error/.test(low))
    return "Couldn't reach the network. Check your internet connection and try again.";
  if (/\b429\b|rate.?limit|too many requests/.test(low))
    return ctx.action === "airdrop"
      ? "The test faucet is rate-limited. Wait a minute and try again."
      : "The network is busy right now (rate-limited). Wait a few seconds and try again. A private RPC makes this rare.";
  if (/\b(500|502|503)\b|service unavailable|internal error/.test(low))
    return "The RPC node is having trouble at the moment. Give it a few seconds and try again.";

  // Slippage (check before generic "insufficient") -------------------------------
  if (/slippage|0x1771|exceeds desired|price impact too high|price moved|exceeded slippage/.test(low))
    return "The price moved more than your slippage tolerance before the trade landed. Raise the slippage a little or try again.";

  // Expired / stale blockhash ----------------------------------------------------
  if (/block height exceeded|blockhash not found|transaction expired|too old|expired/.test(low))
    return "The transaction took too long and expired before it landed. Just try again.";

  // No route ---------------------------------------------------------------------
  if (/no route|could not find any route|no routes found|route not found/.test(low))
    return "No swap route is available for this pair right now. Try a different amount or token.";

  // EVM-specific ------------------------------------------------------------------
  if (/insufficient funds for gas|insufficient funds for transfer|gas required exceeds|out of gas|gas limit|max fee per gas|max priority fee/.test(low))
    return `Not enough ${native} to cover the amount plus the gas fee. Add ${native} and try again.`;
  if (/nonce too low|replacement transaction underpriced|already known|nonce has already been used/.test(low))
    return "A previous transaction is still pending. Wait for it to confirm, then try again.";
  if (/reverted|execution reverted|call exception|transaction may fail|intrinsic gas too low|transfer amount exceeds/.test(low))
    return "The transaction failed on-chain (reverted) — usually the amount, a token allowance, or a transfer restriction on the token. Double-check the details and try again.";
  // Swap build/route failed (0x / KyberSwap) -------------------------------------
  if (ctx.action === "swap" && /build failed|returned no transaction|no liquidity|not enough liquidity|allowance/.test(low))
    return "Couldn't build this swap right now — the route or provider is briefly unavailable or lacks liquidity. Try again, or use a different amount or token.";

  // Insufficient funds -----------------------------------------------------------
  if (/insufficient lamports|insufficient funds for rent|found no record of a prior credit|insufficient funds|custom program error: 0x1\b/.test(low)) {
    if (ctx.action === "swap")
      return `Not enough ${native} to complete the swap. You need the amount you're swapping plus a little extra ${native} for the network fee${native === "SOL" ? " and token-account rent" : ""}. Add ${native} or lower the amount.`;
    if (ctx.action === "send")
      return `Not enough to send this. You need enough ${asset}, plus a little ${native} for the network fee${native === "SOL" ? " — and if the recipient is a brand-new wallet, a bit more to create their token account" : ""}. Add ${native} and try again.`;
    return `Not enough ${native} to cover this. Add a little ${native} and try again.`;
  }

  // Missing token account --------------------------------------------------------
  if (/could not find account|account does not exist|tokenaccountnotfound|invalid account owner|account not found|incorrect program id/.test(low))
    return ctx.action === "send"
      ? "Couldn't set up the recipient's token account. This happens sending to a brand-new wallet — make sure you have a little extra SOL (about 0.002) to create it, then try again."
      : "That account doesn't exist on-chain yet — it may need to be funded or created first.";

  // Simulation failed with no useful logs — almost always the fee payer can't pay -
  if (/simulation failed|transaction simulation/.test(low))
    return ctx.action === "swap"
      ? `The network rejected the swap before running it — this is almost always too little ${native} for fees. Make sure you have some ${native} beyond the amount you're swapping, then try again.`
      : `The network rejected the transaction before running it — usually too little ${native} for the network fee${native === "SOL" ? " (and, for a new recipient, their token-account rent)" : ""}. Add a little ${native} and try again.`;

  // User cancelled (biometrics / a wallet or dApp prompt) ------------------------
  if (/user rejected|user cancell?ed|user denied|request rejected|cancell?ed by user|declined/.test(low))
    return "You cancelled the request — nothing was sent.";

  // Bad address ------------------------------------------------------------------
  if (/invalid public key|non-base58|base58|invalid address/.test(low))
    return "That doesn't look like a valid Solana address. Double-check it and paste it again.";

  // Fallback — every path leaves the user with a next step (never a dead end). ----
  if (ctx.action === "load")
    return "Couldn't load the latest data — likely a busy or unreachable network. Pull down to refresh or check your connection. Setting a dedicated RPC in Settings makes this rare.";
  if (ctx.action === "send" || ctx.action === "swap")
    return "It didn't go through — usually a momentarily busy network. Wait a few seconds and try again. Check the explorer first to be sure it didn't already land before resending.";
  if (ctx.action === "airdrop")
    return "The faucet didn't respond. Wait a minute and try again, or use a web faucet (faucet.solana.com).";
  return "Something went wrong. Wait a moment and try again — if it keeps happening, check your connection or switch to a private RPC.";
}
