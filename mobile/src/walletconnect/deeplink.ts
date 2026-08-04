/**
 * Pulling a WalletConnect pairing URI out of a link the OS handed us.
 *
 * The wallet has always told every dApp it could be reached at `xgowallet://` —
 * `WC_METADATA.redirect.native` in `config.ts`. Nothing registered that scheme and nothing listened
 * for it, so a mobile dApp handing off to the wallet reached nothing at all. Advertised behaviour
 * that doesn't exist is worse than an absent feature: the dApp does its half correctly and the
 * failure looks like the member's fault.
 *
 * Two shapes arrive, and both are real:
 *
 *   • `wc:<topic>@2?relay-protocol=irn&symKey=<hex>` — the pairing URI itself, when the OS routes
 *     the `wc:` scheme straight here.
 *   • `xgowallet://wc?uri=<percent-encoded pairing URI>` — the conventional wrapper a dApp builds
 *     when it wants a specific wallet.
 *
 * Pure, so the parsing is tested rather than trusted. See `deeplink.test.ts`.
 */

/** True for something that is actually a v2 pairing URI rather than merely starting with `wc:`. */
function looksLikePairing(uri: string): boolean {
  return uri.toLowerCase().startsWith("wc:") && uri.includes("symKey=");
}

/**
 * The pairing URI inside `url`, or null if there isn't one.
 *
 * Returns null rather than throwing for anything unrecognised — this runs on every link the OS
 * delivers, most of which have nothing to do with WalletConnect.
 */
export function wcUriFrom(url: string | null | undefined): string | null {
  if (!url) return null;
  const raw = url.trim();
  if (raw.toLowerCase().startsWith("wc:")) return looksLikePairing(raw) ? raw : null;

  const q = raw.indexOf("?");
  if (q < 0) return null;

  // The ordinary case: `uri` is percent-encoded, so a query parser returns it whole.
  const fromParams = new URLSearchParams(raw.slice(q + 1)).get("uri")?.trim();
  if (fromParams && looksLikePairing(fromParams)) return fromParams;

  // The malformed-but-seen case: the pairing URI was embedded WITHOUT encoding, so its own
  // `&symKey=...` reads as a second parameter of the outer link and a query parser truncates it at
  // the first `&`. Taking the raw remainder recovers it. Guarded by `looksLikePairing` on both
  // branches so this only ever rescues something that is genuinely a pairing URI.
  const at = raw.indexOf("uri=");
  if (at < 0) return null;
  const remainder = decodeURIComponent(raw.slice(at + 4)).trim();
  return looksLikePairing(remainder) ? remainder : null;
}
