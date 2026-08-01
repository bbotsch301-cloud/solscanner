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
  if (/recovery phrase|already have a wallet|secure randomness|wallet already exists|secure storage/.test(low))
    return raw;

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

  // Confirmation timeout — the tx was sent but the (slow/rate-limited) RPC didn't confirm it in
  // time. It MAY still land, so tell the user to check before resending (avoids double-sends).
  if (/not confirmed|unknown if it succeeded|node is behind|timed out waiting|confirmation tim|was not confirmed/.test(low))
    return "The network is congested and your transaction didn't confirm in time — it may still go through. Check it on the explorer before sending again. A private RPC (set EXPO_PUBLIC_MAINNET_RPC / EXPO_PUBLIC_DEVNET_RPC) makes this reliable.";

  // Expired / stale blockhash ----------------------------------------------------
  if (/block height exceeded|blockhash not found|transaction expired|too old|expired/.test(low))
    return "The transaction took too long and expired before it landed. Just try again.";

  // No route ---------------------------------------------------------------------
  if (/no route|could not find any route|no routes found|route not found/.test(low))
    return "No swap route is available for this pair right now. Try a different amount or token.";

  // EVM-specific ------------------------------------------------------------------
  if (/insufficient funds for gas|insufficient funds for transfer|gas required exceeds/.test(low))
    return "Not enough native balance to cover the amount plus the gas fee. Top up (ETH on Ethereum, BNB on BSC) and try again.";
  if (/nonce too low|replacement transaction underpriced|already known/.test(low))
    return "A previous transaction is still pending. Wait for it to confirm, then try again.";
  if (/execution reverted|transaction may fail|intrinsic gas too low/.test(low))
    return "The transaction would fail on-chain. Double-check the amount and the recipient, then try again.";

  // Insufficient funds -----------------------------------------------------------
  if (/insufficient lamports|insufficient funds for rent|found no record of a prior credit|insufficient funds|custom program error: 0x1\b/.test(low)) {
    if (ctx.action === "swap")
      return "Not enough SOL to complete the swap. You need the amount you're swapping plus a little extra SOL (about 0.005) for the network fee and token-account rent. Add SOL or lower the amount.";
    if (ctx.action === "send")
      return `Not enough to send this. You need enough ${asset}, plus a little SOL (about 0.002) for the network fee — and if the recipient is a brand-new wallet, a bit more to create their token account. Add SOL and try again.`;
    return "Not enough SOL to cover this. Add a little SOL and try again.";
  }

  // Missing token account --------------------------------------------------------
  if (/could not find account|account does not exist|tokenaccountnotfound|invalid account owner|account not found|incorrect program id/.test(low))
    return ctx.action === "send"
      ? "Couldn't set up the recipient's token account. This happens sending to a brand-new wallet — make sure you have a little extra SOL (about 0.002) to create it, then try again."
      : "That account doesn't exist on-chain yet — it may need to be funded or created first.";

  // Simulation failed with no useful logs — almost always the fee payer can't pay -
  if (/simulation failed|transaction simulation/.test(low))
    return ctx.action === "swap"
      ? "The network rejected the swap before running it — this is almost always too little SOL for fees. Make sure you have some SOL beyond the amount you're swapping, then try again."
      : "The network rejected the transaction before running it — usually too little SOL for the network fee (and, for a new recipient, their token-account rent). Add a little SOL and try again.";

  // User cancelled (biometrics / a wallet or dApp prompt) ------------------------
  if (/user rejected|user cancell?ed|user denied|request rejected|cancell?ed by user|declined/.test(low))
    return "You cancelled the request — nothing was sent.";

  // Bad address ------------------------------------------------------------------
  if (/invalid public key|non-base58|base58|invalid address/.test(low))
    return "That doesn't look like a valid Solana address. Double-check it and paste it again.";

  // Fallback — every path leaves the user with a next step (never a dead end). ----
  if (ctx.action === "load")
    return "Couldn't load the latest data — likely a busy or unreachable network. Pull down to refresh or check your connection. A private RPC (EXPO_PUBLIC_MAINNET_RPC / EXPO_PUBLIC_DEVNET_RPC) makes this rare.";
  if (ctx.action === "send" || ctx.action === "swap")
    return "It didn't go through — usually a momentarily busy network. Wait a few seconds and try again. Check the explorer first to be sure it didn't already land before resending.";
  if (ctx.action === "airdrop")
    return "The faucet didn't respond. Wait a minute and try again, or use a web faucet (faucet.solana.com).";
  return "Something went wrong. Wait a moment and try again — if it keeps happening, check your connection or switch to a private RPC.";
}
