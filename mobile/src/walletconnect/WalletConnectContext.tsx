/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { getSdkError } from "@walletconnect/utils";
import { humanizeError } from "../solana/errors";
import { activeEvmAccount as getEvmAccount } from "../wallet/vault";
import type { EvmAccount } from "../wallet/evm";
import { useWallet } from "../wallet/WalletContext";
import { connection } from "../solana/connection";
import { colors, font, radius, spacing } from "../theme";
import { requireReauth } from "../security/reauth";
import { wcEnabled } from "./config";
import { initWalletKit } from "./client";
import { approvedNamespaces } from "./namespaces";
import { describeRequest, handleEvmRequest, handleSolanaRequest } from "./handlers";

interface WCState {
  enabled: boolean;
  ready: boolean;
  sessions: any[];
  pair: (uri: string) => Promise<void>;
  disconnect: (topic: string) => Promise<void>;
}

const Ctx = createContext<WCState | null>(null);

export function WalletConnectProvider({ children }: { children: ReactNode }) {
  const { evmAddress, solanaAddress, keypair } = useWallet();
  const [ready, setReady] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [proposal, setProposal] = useState<any | null>(null);
  /**
   * Pending signature requests, oldest first — a queue, not a slot.
   *
   * This was a single value, so a second request arriving while one was open silently replaced it
   * and the first was never answered: the dApp waits until relay expiry with no error and no clue.
   * Issuing a Key is two to N signatures over one session, which makes that the flow most likely to
   * hit it. The head of the queue is what the modal shows.
   */
  const [queue, setQueue] = useState<any[]>([]);
  const request = queue[0] ?? null;
  const [busy, setBusy] = useState(false);

  const kitRef = useRef<any>(null);
  const evmAccountRef = useRef<EvmAccount | null>(null);
  const keypairRef = useRef(keypair);
  const evmAddrRef = useRef(evmAddress);
  const solAddrRef = useRef(solanaAddress);
  useEffect(() => {
    keypairRef.current = keypair;
    evmAddrRef.current = evmAddress;
    solAddrRef.current = solanaAddress;
  }, [keypair, evmAddress, solanaAddress]);

  /** Answered — drop it and let the next one, if any, open. */
  const shift = useCallback(() => setQueue((q) => q.slice(1)), []);

  const refreshSessions = useCallback(() => {
    const kit = kitRef.current;
    if (kit) setSessions(Object.values(kit.getActiveSessions() ?? {}));
  }, []);

  useEffect(() => {
    if (!wcEnabled || !keypair) return;
    let mounted = true;
    let onProposal: ((p: any) => void) | null = null;
    let onRequest: ((r: any) => void) | null = null;
    (async () => {
      try {
        const kit = await initWalletKit();
        if (!mounted) return;
        kitRef.current = kit;
        evmAccountRef.current = await getEvmAccount();

        // Named so the cleanup can remove exactly these. `initWalletKit` returns a cached
        // instance, so without the `off` below every wallet switch stacked another set of listeners
        // on the same object — and one proposal then opened as many modals as you had switched.
        onProposal = (p: any) => setProposal(p);
        onRequest = (r: any) => setQueue((q) => [...q, r]);
        kit.on("session_proposal", onProposal);
        kit.on("session_request", onRequest);
        kit.on("session_delete", refreshSessions);
        refreshSessions();
        setReady(true);
      } catch {
        /* WC failed to init — feature stays inert */
      }
    })();
    return () => {
      mounted = false;
      const kit = kitRef.current;
      if (!kit) return;
      if (onProposal) kit.off("session_proposal", onProposal);
      if (onRequest) kit.off("session_request", onRequest);
      kit.off("session_delete", refreshSessions);
    };
  }, [keypair, refreshSessions]);

  const pair = useCallback(async (uri: string) => {
    const kit = kitRef.current;
    if (kit) await kit.pair({ uri: uri.trim() });
  }, []);

  const disconnect = useCallback(
    async (topic: string) => {
      const kit = kitRef.current;
      if (kit) {
        await kit.disconnectSession({ topic, reason: getSdkError("USER_DISCONNECTED") });
        refreshSessions();
      }
    },
    [refreshSessions]
  );

  const approveProposal = useCallback(async () => {
    const kit = kitRef.current;
    if (!kit || !proposal) return;
    setBusy(true);
    try {
      const namespaces = approvedNamespaces(proposal.params, evmAddrRef.current, solAddrRef.current);
      await kit.approveSession({ id: proposal.id, namespaces });
      refreshSessions();
    } catch {
      Alert.alert(
        "Couldn't connect",
        "This dApp asked for a network or permission this wallet can't provide, so the connection was declined. Make sure the dApp is on a supported chain (Solana, Ethereum, or BSC)."
      );
      await kit.rejectSession({ id: proposal.id, reason: getSdkError("USER_REJECTED") }).catch(() => {});
    } finally {
      setBusy(false);
      setProposal(null);
    }
  }, [proposal, refreshSessions]);

  const rejectProposal = useCallback(async () => {
    const kit = kitRef.current;
    if (kit && proposal)
      await kit.rejectSession({ id: proposal.id, reason: getSdkError("USER_REJECTED") }).catch(() => {});
    setProposal(null);
  }, [proposal]);

  const approveRequest = useCallback(async () => {
    const kit = kitRef.current;
    if (!kit || !request) return;
    setBusy(true);
    const { topic, params, id } = request;
    const { request: rpc, chainId } = params;
    // Fund-moving / approval requests require a fresh possession proof (biometric or device
    // passcode) even though the app is unlocked — the session lock isn't enough for signing.
    if (/sendTransaction|signTransaction|signTypedData/i.test(rpc.method) && !(await requireReauth())) {
      await kit
        .respondSessionRequest({ topic, response: { id, jsonrpc: "2.0", error: getSdkError("USER_REJECTED") } })
        .catch(() => {});
      setBusy(false);
      shift();
      return;
    }
    try {
      let result: any;
      if (String(chainId).startsWith("eip155:")) {
        if (!evmAccountRef.current) throw new Error("No EVM account.");
        result = await handleEvmRequest(rpc.method, rpc.params, chainId, evmAccountRef.current);
      } else if (String(chainId).startsWith("solana:")) {
        if (!keypairRef.current) throw new Error("No Solana account.");
        result = await handleSolanaRequest(rpc.method, rpc.params, keypairRef.current, connection, chainId);
      } else {
        throw new Error("Unsupported chain.");
      }
      await kit.respondSessionRequest({ topic, response: { id, jsonrpc: "2.0", result } });
    } catch (e) {
      // Tell the USER, not just the dApp — otherwise the sheet silently closes as if it worked.
      const nativeSym = String(chainId).startsWith("solana:") ? "SOL" : String(chainId).includes(":56") ? "BNB" : "ETH";
      Alert.alert(
        "Request failed",
        humanizeError(e, { action: /send/i.test(rpc.method) ? "send" : undefined, native: nativeSym })
      );
      await kit
        .respondSessionRequest({
          topic,
          response: { id, jsonrpc: "2.0", error: { code: 5000, message: (e as Error).message } },
        })
        .catch(() => {});
    } finally {
      setBusy(false);
      shift();
    }
  }, [request, shift]);

  const rejectRequest = useCallback(async () => {
    const kit = kitRef.current;
    if (kit && request)
      await kit
        .respondSessionRequest({
          topic: request.topic,
          response: { id: request.id, jsonrpc: "2.0", error: getSdkError("USER_REJECTED") },
        })
        .catch(() => {});
    shift();
  }, [request, shift]);

  const value = useMemo<WCState>(
    () => ({ enabled: wcEnabled, ready, sessions, pair, disconnect }),
    [ready, sessions, pair, disconnect]
  );

  const proposerMeta = proposal?.params?.proposer?.metadata;
  const reqMethod = request?.params?.request?.method;
  const reqSummary = request ? describeRequest(reqMethod, request.params?.request?.params, request.params?.chainId) : null;
  const reqSession = request ? sessions.find((s: any) => s.topic === request.topic) : null;
  const reqAppName = reqSession?.peer?.metadata?.name;
  const proposalVerify = verifyBanner(proposal?.verifyContext);
  const requestVerify = verifyBanner(request?.verifyContext);

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* Session proposal */}
      <Modal visible={!!proposal} transparent animationType="fade" onRequestClose={rejectProposal}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>Connect to {proposerMeta?.name ?? "a dApp"}?</Text>
            <Text style={styles.url}>{proposerMeta?.url ?? ""}</Text>
            <VerifyBanner b={proposalVerify} />
            <Text style={styles.body}>
              This app will be able to request signatures and transactions from your wallet. It
              can’t move funds without your approval on each request.
            </Text>
            <Buttons busy={busy} onApprove={approveProposal} onReject={rejectProposal} approveLabel="Connect" />
          </View>
        </View>
      </Modal>

      {/* Sign request */}
      <Modal visible={!!request} transparent animationType="fade" onRequestClose={rejectRequest}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.title}>{reqSummary?.title ?? "Review request"}</Text>
            <Text style={styles.method}>
              {reqAppName ? `${reqAppName} · ` : ""}
              {reqMethod}
            </Text>
            <View style={styles.reqBox}>
              {reqSummary?.lines.map((l, i) => (
                <View key={i} style={styles.reqRow}>
                  <Text style={styles.reqLabel}>{l.label}</Text>
                  <Text style={styles.reqValue} numberOfLines={4}>
                    {l.value}
                  </Text>
                </View>
              ))}
            </View>
            {reqSummary?.danger && <Text style={styles.warn}>{reqSummary.danger}</Text>}
            <VerifyBanner b={requestVerify} />
            <Text style={styles.subtle}>Only approve if you trust this app and understand this action.</Text>
            <Buttons busy={busy} onApprove={approveRequest} onReject={rejectRequest} approveLabel="Approve" />
          </View>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

/**
 * Turn WalletKit's `verifyContext` into a user-facing safety banner. WalletKit resolves the dApp's
 * declared identity against the origin it actually connected from: `isScam` flags a domain on the
 * known-scam registry, `validation: "INVALID"` means the origin doesn't match the claimed identity
 * (classic phishing), and `"UNKNOWN"` means it couldn't be checked. `"VALID"` → no banner.
 */
function verifyBanner(vc: any): { text: string; scam: boolean } | null {
  const v = vc?.verified;
  if (!v) return null;
  if (v.isScam)
    return { text: "⚠ This app is flagged as a known scam. Do not connect or approve.", scam: true };
  if (v.validation === "INVALID")
    return { text: "⚠ This app's domain doesn't match its identity — likely phishing.", scam: true };
  if (v.validation === "UNKNOWN")
    return { text: "Couldn't verify this app's domain. Proceed only if you trust it.", scam: false };
  return null;
}

function VerifyBanner({ b }: { b: { text: string; scam: boolean } | null }) {
  if (!b) return null;
  return (
    <View style={[styles.verifyBanner, b.scam ? styles.verifyScam : styles.verifyUnknown]}>
      <Text style={[styles.verifyText, { color: b.scam ? colors.negative : colors.warning }]}>{b.text}</Text>
    </View>
  );
}

function Buttons({
  busy,
  onApprove,
  onReject,
  approveLabel,
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  approveLabel: string;
}) {
  return (
    <View style={styles.btnRow}>
      <Pressable onPress={onReject} disabled={busy} style={[styles.btn, styles.reject]}>
        <Text style={styles.rejectText}>Reject</Text>
      </Pressable>
      <Pressable onPress={onApprove} disabled={busy} style={[styles.btn, styles.approve]}>
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.approveText}>{approveLabel}</Text>}
      </Pressable>
    </View>
  );
}

export function useWalletConnect(): WCState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWalletConnect must be used within WalletConnectProvider");
  return ctx;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000AA", alignItems: "center", justifyContent: "center", padding: spacing(5) },
  sheet: { width: "100%", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg, padding: spacing(5), gap: spacing(3) },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  url: { color: colors.primary, fontSize: font.small },
  method: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  body: { color: colors.textMuted, fontSize: font.small, lineHeight: 19 },
  reqBox: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing(3), gap: spacing(2) },
  reqRow: { gap: 2 },
  reqLabel: { color: colors.textFaint, fontSize: font.tiny, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  reqValue: { color: colors.text, fontSize: font.small, fontFamily: undefined },
  warn: { color: colors.negative, fontSize: font.small, fontWeight: "700" },
  verifyBanner: { borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing(2.5), paddingHorizontal: spacing(3) },
  verifyScam: { backgroundColor: colors.negative + "1A", borderColor: colors.negative },
  verifyUnknown: { backgroundColor: colors.warning + "1A", borderColor: colors.warning },
  verifyText: { fontSize: font.small, fontWeight: "700", lineHeight: 18 },
  subtle: { color: colors.textMuted, fontSize: font.small },
  btnRow: { flexDirection: "row", gap: spacing(3), marginTop: spacing(2) },
  btn: { flex: 1, paddingVertical: spacing(3.5), borderRadius: radius.pill, alignItems: "center" },
  reject: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder },
  rejectText: { color: colors.text, fontSize: font.body, fontWeight: "800" },
  approve: { backgroundColor: colors.primary },
  approveText: { color: colors.bg, fontSize: font.body, fontWeight: "800" },
});
