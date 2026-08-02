/**
 * A single browser tab: a WebView with the injected wallet providers. Reports navigation state up,
 * forwards bridge messages up, and intercepts `wc:` deep links + non-http schemes. Kept mounted
 * (hidden when inactive) so switching tabs preserves each page's state.
 */
import { forwardRef } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview";
import { colors } from "../theme";
import type { BridgeMessage, TabState } from "./types";

export const BrowserTab = forwardRef<WebView, {
  tab: TabState;
  active: boolean;
  injectedJS: string;
  onNav: (patch: Partial<TabState>) => void;
  onRequest: (msg: BridgeMessage) => void;
  onWcUri: (uri: string) => void;
}>(function BrowserTab({ tab, active, injectedJS, onNav, onRequest, onWcUri }, ref) {
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const m = JSON.parse(e.nativeEvent.data) as BridgeMessage;
      if (m && m.id && (m.kind === "evm" || m.kind === "solana")) onRequest(m);
    } catch {
      /* not one of ours */
    }
  };

  const onNavChange = (s: WebViewNavigation) => {
    onNav({ currentUrl: s.url, title: s.title ?? tab.title, canGoBack: s.canGoBack, canGoForward: s.canGoForward });
  };

  // Intercept non-http(s) navigations: hand WalletConnect `wc:` links to the pairing flow, and open
  // other app schemes (mailto:, tel:, etc.) with the OS instead of failing inside the WebView.
  const onShouldStart = (req: { url: string }): boolean => {
    const url = req.url;
    if (/^https?:/i.test(url) || url === "about:blank") return true;
    if (/^wc:/i.test(url)) {
      onWcUri(url);
      return false;
    }
    Linking.openURL(url).catch(() => {});
    return false;
  };

  return (
    <View style={[styles.fill, !active && styles.hidden]} pointerEvents={active ? "auto" : "none"}>
      <WebView
        ref={ref}
        source={{ uri: tab.uri }}
        injectedJavaScriptBeforeContentLoaded={injectedJS}
        onMessage={onMessage}
        onNavigationStateChange={onNavChange}
        onLoadProgress={(e) => onNav({ progress: e.nativeEvent.progress })}
        onLoadStart={() => onNav({ loading: true })}
        onLoadEnd={() => onNav({ loading: false, progress: 1 })}
        onShouldStartLoadWithRequest={onShouldStart}
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        startInLoadingState
        allowsInlineMediaPlayback
        applicationNameForUserAgent="XGOWallet"
        style={styles.web}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  hidden: { opacity: 0, zIndex: -1 },
  web: { flex: 1, backgroundColor: colors.bg },
});
