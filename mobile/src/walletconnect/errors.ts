/**
 * Friendly, actionable messages for WalletConnect PAIRING / session errors (distinct from the
 * on-chain tx errors handled by solana/errors.ts humanizeError). WalletKit throws plain Errors
 * whose .message is a relay/URI phrase; map the common ones so the user always knows the fix.
 */
function raw(e: unknown): string {
  if (typeof e === "string") return e;
  const m = (e as { message?: unknown })?.message;
  return typeof m === "string" ? m : "";
}

export function humanizeWcError(e: unknown): string {
  const low = raw(e).toLowerCase();
  console.warn(`[walletconnect] ${raw(e) || String(e)}`);

  if (/expired|expiry|past ttl/.test(low))
    return "That connection link has expired. In the dApp, open the WalletConnect prompt again to get a fresh QR or link, then scan/paste it right away.";
  if (/pairing already exists|already paired|already connected|session already/.test(low))
    return "You're already connected to this dApp (or this link was already used). Check Connected apps below, or get a fresh link from the dApp.";
  if (/invalid|malformed|missing|no matching|not a valid|uri/.test(low))
    return "That doesn't look like a valid WalletConnect link. Copy it again from the dApp — it should start with “wc:”.";
  if (/network|failed to fetch|timeout|timed out|relay|websocket|connection/.test(low))
    return "Couldn't reach the WalletConnect relay. Check your internet connection and try again.";
  if (/rejected|user disconnect/.test(low))
    return "The connection was cancelled.";
  return "Couldn't connect to the dApp. Get a fresh WalletConnect link from it and try again.";
}
