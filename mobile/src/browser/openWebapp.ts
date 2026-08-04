/**
 * Handing a member off to the Goshen web app.
 *
 * The wallet holds keys and proves what you own; buying, browsing and issuing happen on the web app,
 * and whatever you get there lands back here as a Key. So the handoff is a route into the bridged
 * browser rather than a screen rebuilt inside a wallet.
 *
 * Extracted because it was three lines repeated wherever it appeared, and it is about to appear in
 * three places rather than one: More, the empty Keys tab, and the empty Vault. Three copies of a
 * haptic-plus-navigate is how one of them ends up forgetting the haptic, or the browser, or both.
 *
 * `webappUrl` returns null when nothing is configured or the URL isn't https, so a caller that
 * checks for null gets the honest disabled state for free — no button that goes nowhere.
 */
import { requestBrowserUrl } from "./openRequest";
import { webappUrl } from "../config/webapp";
import { haptics } from "../ui/haptics";

/** Minimal shape of what this needs from navigation, so callers can pass their typed `nav`. */
interface Navigator {
  navigate: (screen: "Browser") => void;
}

/** The Marketplace URL, or null when there is no web app to send anyone to. */
export function marketUrl(): string | null {
  return webappUrl("market");
}

/** Open a web-app URL in the bridged browser. Pass a URL that `webappUrl` produced. */
export function openWebapp(nav: Navigator, url: string): void {
  haptics.tap();
  requestBrowserUrl(url);
  nav.navigate("Browser");
}
