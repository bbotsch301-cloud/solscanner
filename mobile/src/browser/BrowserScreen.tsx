/**
 * The Browser tab: a multi-tab in-app dApp browser. Owns tab state, the injected-provider seed, and
 * the connect/sign approval flow — routing every dApp request through the same decode → approve →
 * sign pipeline WalletConnect uses (see ./signer + walletconnect/handlers).
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, BackHandler, Platform, Share, StyleSheet, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import type { WebView } from "react-native-webview";
import { useWallet } from "../wallet/WalletContext";
import { useWalletConnect } from "../walletconnect/WalletConnectContext";
import { requireReauth } from "../security/reauth";
import { isBlockedDomain } from "../safety/blocklist";
import { CHAINS } from "../chains/registry";
import { colors } from "../theme";
import { BrowserTab } from "./BrowserTab";
import { BrowserChrome } from "./BrowserChrome";
import { DiscoverHome } from "./DiscoverHome";
import { TabSwitcher } from "./TabSwitcher";
import { ConnectSheet, SignSheet } from "./RequestSheets";
import { BlockInterstitial } from "./BlockInterstitial";
import { BrowserMenu, ConnectedSitesModal } from "./BrowserMenu";
import { buildInjectedProvider } from "./injected";
import { addHistory, clearHistory, hostOf, isFavorite, toggleFavorite, toUrl } from "./dapps";
import { disconnectAll, disconnectOrigin, isConnected, listConnections, setConnected } from "./connections";
import { evmChainForHex, evmRpcPassthrough, runEvmRequest, runSolanaRequest, summarizeDappRequest } from "./signer";
import type { BridgeMessage, PendingRequest, Responder, TabState } from "./types";

const originOf = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
};

const EVM_SIGN = new Set([
  "personal_sign",
  "eth_sign",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "eth_sendTransaction",
  "eth_signTransaction",
]);

const blankTab = (id: string): TabState => ({ id, uri: "", currentUrl: "", title: "New tab", canGoBack: false, canGoForward: false, loading: false, progress: 0, blocked: undefined, remountKey: 0 });

export function BrowserScreen() {
  const insets = useSafeAreaInsets();
  const { keypair, evmAddress, solanaAddress, activeChain, setActiveChain } = useWallet();
  const { pair } = useWalletConnect();

  const [tabs, setTabs] = useState<TabState[]>(() => [blankTab("tab0")]);
  const [activeId, setActiveId] = useState("tab0");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [homeRev, setHomeRev] = useState(0);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sitesOpen, setSitesOpen] = useState(false);
  const [connRev, setConnRev] = useState(0);

  const idRef = useRef(1);
  const webviews = useRef<Record<string, WebView | null>>({});
  const queue = useRef<PendingRequest[]>([]);
  const overrides = useRef<Set<string>>(new Set()); // origins the user chose to proceed to
  const trustedFor = useRef<Record<string, string>>({}); // tabId → origin already eager-connected

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];

  // Injected-provider seed: report the active EVM chain (fall back to Ethereum when the wallet is on
  // Solana), plus both public addresses. Rebuilt when the account/chain changes.
  const evmChain = activeChain.kind === "evm" ? activeChain : CHAINS.find((c) => c.id === "ethereum");
  const evmChainIdHex = `0x${(evmChain?.evmChainId ?? 1).toString(16)}`;
  const injectedJS = useMemo(
    () => buildInjectedProvider({ evmAddress, evmChainIdHex, solAddress: solanaAddress }),
    [evmAddress, solanaAddress, evmChainIdHex]
  );

  // --- tab helpers ---
  const patchTab = useCallback((id: string, patch: Partial<TabState>) => {
    setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const onNav = useCallback((id: string, patch: Partial<TabState>) => {
    if (patch.currentUrl && patch.title !== undefined) addHistory(patch.currentUrl, patch.title, Date.now());
    // Silent reconnect: on landing on a new origin the user previously connected, push the trusted
    // state into the page so it reconnects without a prompt.
    if (patch.currentUrl) {
      const origin = originOf(patch.currentUrl);
      if (origin && trustedFor.current[id] !== origin) {
        trustedFor.current[id] = origin;
        const evm = isConnected(origin, "evm");
        const solana = isConnected(origin, "solana");
        if (evm || solana) {
          webviews.current[id]?.injectJavaScript(
            `window.__xgo&&window.__xgo.setTrusted(${JSON.stringify({ evm, solana, evmAddress, solAddress: solanaAddress })});true;`
          );
        }
      }
    }
    patchTab(id, patch);
  }, [patchTab, evmAddress, solanaAddress]);

  const checkBlocked = useCallback((url: string): boolean => {
    if (!isBlockedDomain(hostOf(url))) return false;
    return !overrides.current.has(originOf(url));
  }, []);

  const navigate = useCallback((input: string) => {
    const url = toUrl(input);
    if (!url) return;
    patchTab(activeId, { uri: url });
    const wv = webviews.current[activeId];
    if (activeTab?.uri === url && wv) wv.reload();
  }, [activeId, activeTab, patchTab]);

  const newTab = useCallback(() => {
    const id = `tab${idRef.current++}`;
    setTabs((ts) => [...ts, blankTab(id)]);
    setActiveId(id);
    setSwitcherOpen(false);
  }, []);

  const closeTab = useCallback((id: string) => {
    delete webviews.current[id];
    setTabs((ts) => {
      const next = ts.filter((t) => t.id !== id);
      if (next.length === 0) {
        const nid = `tab${idRef.current++}`;
        setActiveId(nid);
        return [blankTab(nid)];
      }
      if (id === activeId) setActiveId(next[next.length - 1].id);
      return next;
    });
  }, [activeId]);

  // --- request approval flow ---
  const dequeue = useCallback(() => {
    const next = queue.current.shift() ?? null;
    setPending(next);
  }, []);

  const respondFor = useCallback((tabId: string, msgId: string): Responder => (result, error) => {
    const wv = webviews.current[tabId];
    if (!wv) return;
    const r = result === undefined ? null : result;
    wv.injectJavaScript(`window.__xgo&&window.__xgo.resolve(${JSON.stringify(msgId)},${JSON.stringify(r)},${JSON.stringify(error)});true;`);
  }, []);

  const handleRequest = useCallback((tabId: string, msg: BridgeMessage) => {
    const respond = respondFor(tabId, msg.id);

    // Chain switch/add: no signing, just re-point the active chain if we support it.
    if (msg.kind === "evm" && (msg.method === "wallet_switchEthereumChain" || msg.method === "wallet_addEthereumChain")) {
      const hex = (msg.params as { chainId?: string }[])?.[0]?.chainId ?? "";
      const chain = evmChainForHex(hex);
      if (chain?.evmChainId) {
        setActiveChain(chain.id);
        respond(`0x${chain.evmChainId.toString(16)}`, null);
      } else {
        respond(null, { code: 4902, message: "This network isn't supported in XGO." });
      }
      return;
    }

    // Read-only EVM RPC → proxy to the chain RPC (no approval needed).
    if (msg.kind === "evm" && msg.method !== "connect" && !EVM_SIGN.has(msg.method)) {
      evmRpcPassthrough(msg.method, msg.params, evmChainIdHex).then(
        (r) => respond(r, null),
        (e) => respond(null, { message: e instanceof Error ? e.message : "RPC error" })
      );
      return;
    }

    // Silent reconnect for an already-approved origin (user-initiated connect call).
    if (msg.method === "connect") {
      const addr = msg.kind === "solana" ? solanaAddress : evmAddress;
      if (addr && isConnected(msg.origin, msg.kind)) {
        respond(addr, null);
        return;
      }
    }

    const type = msg.method === "connect" ? "connect" : "sign";
    const summary = type === "sign" ? summarizeDappRequest(msg.kind, msg.method, msg.params, evmChainIdHex) : null;
    const req: PendingRequest = { msg, respond, type, summary };
    setPending((cur) => {
      if (cur) {
        queue.current.push(req);
        return cur;
      }
      return req;
    });
  }, [respondFor, evmChainIdHex, setActiveChain, solanaAddress, evmAddress]);

  const closePending = useCallback(() => {
    setBusy(false);
    dequeue();
  }, [dequeue]);

  const approve = useCallback(async () => {
    if (!pending) return;
    const { msg, respond, type } = pending;
    setBusy(true);
    try {
      if (type === "connect") {
        const addr = msg.kind === "solana" ? solanaAddress : evmAddress;
        if (!addr) throw new Error("No account for this chain.");
        setConnected(msg.origin, msg.kind, Date.now());
        setConnRev((r) => r + 1);
        respond(addr, null);
      } else {
        const ok = await requireReauth("Confirm this dApp request");
        if (!ok) {
          respond(null, { code: 4001, message: "Rejected" });
          closePending();
          return;
        }
        if (msg.kind === "evm") {
          const result = await runEvmRequest(msg.method, (msg.params as unknown[]) ?? [], evmChainIdHex);
          respond(result, null);
        } else {
          if (!keypair) throw new Error("Wallet is locked.");
          const result = await runSolanaRequest(msg.method, (msg.params as Record<string, unknown>) ?? {}, keypair);
          respond(result, null);
        }
      }
    } catch (e) {
      respond(null, { message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      closePending();
    }
  }, [pending, solanaAddress, evmAddress, evmChainIdHex, keypair, closePending]);

  const reject = useCallback(() => {
    if (pending) pending.respond(null, { code: 4001, message: "User rejected" });
    closePending();
  }, [pending, closePending]);

  // --- chrome actions --- (read webviews.current inside handlers, never during render)
  const setTabRef = (id: string) => (w: WebView | null) => { webviews.current[id] = w; };
  const goBack = () => webviews.current[activeId]?.goBack();
  const goForward = () => webviews.current[activeId]?.goForward();
  const reload = () => webviews.current[activeId]?.reload();
  const stop = () => webviews.current[activeId]?.stopLoading();
  const goHome = () => patchTab(activeId, blankTab(activeId));
  const toggleFav = () => {
    if (!activeTab?.currentUrl) return;
    toggleFavorite(activeTab.currentUrl, activeTab.title);
    setHomeRev((r) => r + 1);
  };

  // --- phishing interstitial ---
  const proceedBlocked = () => {
    const url = activeTab?.blocked;
    if (!url) return;
    overrides.current.add(originOf(url));
    setTabs((ts) => ts.map((t) => (t.id === activeId ? { ...t, blocked: undefined, uri: url, remountKey: (t.remountKey ?? 0) + 1 } : t)));
  };

  // --- ••• menu + connected sites ---
  const copyLink = async () => { setMenuOpen(false); if (activeTab?.currentUrl) await Clipboard.setStringAsync(activeTab.currentUrl); };
  const shareLink = () => { setMenuOpen(false); if (activeTab?.currentUrl) Share.share({ message: activeTab.currentUrl, url: activeTab.currentUrl }).catch(() => {}); };
  const clearData = () => {
    setMenuOpen(false);
    Alert.alert("Clear browsing data", "This clears your recent browsing history. Connected sites are managed separately.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear", style: "destructive", onPress: () => { clearHistory().then(() => setHomeRev((r) => r + 1)); } },
    ]);
  };
  const disconnectSite = (origin: string) => {
    disconnectOrigin(origin);
    tabs.forEach((t) => { if (originOf(t.currentUrl) === origin) webviews.current[t.id]?.injectJavaScript("window.__xgo&&window.__xgo.setUntrusted();true;"); });
    Object.keys(trustedFor.current).forEach((k) => { if (trustedFor.current[k] === origin) delete trustedFor.current[k]; });
    setConnRev((r) => r + 1);
  };
  const disconnectEverything = () => {
    disconnectAll().then(() => {
      tabs.forEach((t) => webviews.current[t.id]?.injectJavaScript("window.__xgo&&window.__xgo.setUntrusted();true;"));
      trustedFor.current = {};
      setConnRev((r) => r + 1);
    });
  };
  const connections = useMemo(() => { void connRev; return listConnections(); }, [connRev]);

  // Android hardware back navigates the page's history first; only falls through (leaving the
  // browser) when there's nowhere left to go back to.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const onBack = () => {
        const t = tabs.find((x) => x.id === activeId);
        const wv = webviews.current[activeId];
        if (t?.canGoBack && wv) {
          wv.goBack();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [activeId, tabs])
  );

  const favNow = activeTab?.currentUrl ? isFavorite(activeTab.currentUrl) : false;

  return (
    <View style={styles.screen}>
      <View style={{ paddingTop: insets.top }}>
        <BrowserChrome
          tab={activeTab}
          tabCount={tabs.length}
          onNavigate={navigate}
          onBack={goBack}
          onForward={goForward}
          onReload={reload}
          onStop={stop}
          onHome={goHome}
          onTabs={() => setSwitcherOpen(true)}
          onMenu={() => setMenuOpen(true)}
        />
      </View>

      <View style={styles.body}>
        {tabs.filter((t) => t.uri).map((t) => (
          <BrowserTab
            key={t.id}
            ref={setTabRef(t.id)}
            tab={t}
            active={t.id === activeId}
            injectedJS={injectedJS}
            onNav={(patch) => onNav(t.id, patch)}
            onRequest={(msg) => handleRequest(t.id, msg)}
            onWcUri={(uri) => pair(uri).catch(() => {})}
            isBlocked={checkBlocked}
          />
        ))}
        {!activeTab?.uri && <DiscoverHome onOpen={navigate} rev={homeRev} />}
        {activeTab?.blocked && <BlockInterstitial url={activeTab.blocked} onBack={goHome} onProceed={proceedBlocked} />}
      </View>

      <ConnectSheet
        visible={!!pending && pending.type === "connect"}
        host={pending?.msg.host ?? ""}
        kind={pending?.msg.kind ?? "evm"}
        address={pending?.msg.kind === "solana" ? solanaAddress : evmAddress}
        chainName={pending?.msg.kind === "solana" ? "Solana" : evmChain?.name ?? "Ethereum"}
        busy={busy}
        onApprove={approve}
        onReject={reject}
      />
      <SignSheet
        visible={!!pending && pending.type === "sign"}
        host={pending?.msg.host ?? ""}
        method={pending?.msg.method ?? ""}
        summary={pending?.summary ?? null}
        busy={busy}
        onApprove={approve}
        onReject={reject}
      />
      <TabSwitcher
        visible={switcherOpen}
        tabs={tabs}
        activeId={activeId}
        onSelect={(id) => { setActiveId(id); setSwitcherOpen(false); }}
        onClose={closeTab}
        onNewTab={newTab}
        onDone={() => setSwitcherOpen(false)}
      />
      <BrowserMenu
        visible={menuOpen}
        hasUrl={!!activeTab?.currentUrl}
        isFav={favNow}
        onClose={() => setMenuOpen(false)}
        onToggleFav={() => { setMenuOpen(false); toggleFav(); }}
        onCopy={copyLink}
        onShare={shareLink}
        onConnectedSites={() => { setMenuOpen(false); setConnRev((r) => r + 1); setSitesOpen(true); }}
        onClearData={clearData}
      />
      <ConnectedSitesModal
        visible={sitesOpen}
        connections={connections}
        onClose={() => setSitesOpen(false)}
        onDisconnect={disconnectSite}
        onDisconnectAll={disconnectEverything}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
});
