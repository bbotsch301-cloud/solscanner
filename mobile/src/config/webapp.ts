/**
 * The Goshen web app — the half of the system this wallet is not.
 *
 * The split is deliberate and worth stating where the link is made: **the web app facilitates, the
 * wallet holds.** Marketplace, communities, creation and content delivery live there; holding keys,
 * proving what you own, opening what you own, and signing live here. So the wallet does not grow a
 * marketplace — it opens the one that exists, through the bridged browser, and whatever is bought
 * lands back here as a Key.
 *
 * Unset by default, exactly like `config/vault.ts`: with no URL configured, the rows that would
 * link out simply stay disabled, and the wallet is complete without them. Setting it switches them
 * on with no app release.
 *
 * Note this is the SITE, not the API. `EXPO_PUBLIC_VAULT_API` points at an API prefix (`/_api`) and
 * the two are separate values even when they happen to share a host.
 */
import { isSafeContentUrl } from "../solana/uri";

export const WEBAPP_URL = (process.env.EXPO_PUBLIC_WEBAPP_URL ?? "").replace(/\/+$/, "");

export function webappConfigured(): boolean {
  return isSafeContentUrl(WEBAPP_URL);
}

/**
 * A URL on the web app, or null when it isn't configured or isn't safe to open.
 *
 * Checked rather than trusted. A misconfigured environment variable must not become a way to send
 * a member somewhere arbitrary in a browser that has their wallet bridged into it — the same reason
 * `access/resolve.ts` runs attacker-supplied metadata URLs through `isSafeContentUrl` before the
 * app will touch them. https only; anything else is refused here rather than at the browser.
 */
export function webappUrl(path: string): string | null {
  if (!webappConfigured()) return null;
  const url = `${WEBAPP_URL}/${path.replace(/^\/+/, "")}`;
  return isSafeContentUrl(url) ? url : null;
}
