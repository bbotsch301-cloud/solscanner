/**
 * Opens pass content in an in-app custom tab (SFSafariViewController / Chrome Custom Tabs).
 *
 * Why not the app's own WebView: it's a stripped-down engine. Android's renders no PDFs at all,
 * Office documents render nowhere, and downloads are dead (`onFileDownload` is unset). A custom
 * tab is the platform's real browser, so file handling stops being our problem — while still
 * living inside the app and returning control on dismiss.
 *
 * It deliberately has NO wallet bridge. Pages that need `window.solana` must keep going to the
 * Browser tab; `resolve.ts` decides which door an item takes.
 */
import { Linking } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { isBlockedDomain } from "../safety/blocklist";
import { hostOf } from "../browser/dapps";
import { isSafeContentUrl } from "../solana/uri";
import { colors } from "../theme";

export type OpenResult = "opened" | "blocked" | "unsafe" | "failed";

/**
 * Open `url` in a custom tab. Refuses anything that isn't https (NFT metadata is
 * attacker-controlled) and anything on the phishing blocklist the in-app browser already uses.
 */
export async function openContentUrl(url: string): Promise<OpenResult> {
  if (!isSafeContentUrl(url)) return "unsafe";
  if (isBlockedDomain(hostOf(url))) return "blocked";
  try {
    await WebBrowser.openBrowserAsync(url, {
      toolbarColor: colors.bg,
      controlsColor: colors.primary,
      dismissButtonStyle: "close",
      enableBarCollapsing: true,
      showTitle: true,
      // Android: keep the tab in OUR task, so dismissing returns to the app rather than
      // stranding the user on the home screen.
      createTask: false,
    });
    return "opened";
  } catch {
    // No Custom Tabs provider installed (some Android devices) — fall back to the system browser
    // rather than leaving the button dead.
    try {
      await Linking.openURL(url);
      return "opened";
    } catch {
      return "failed";
    }
  }
}
