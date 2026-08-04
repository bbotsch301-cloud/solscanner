import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useWalletConnect } from "../walletconnect/WalletConnectContext";
import { useWallet } from "../wallet/WalletContext";
import { describeUnknown, parseScan } from "../scan/parse";
import { humanizeWcError } from "../walletconnect/errors";
import { configNotice } from "../config/notice";
import { colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function ScanScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  // No `ready` here on purpose. The Continue button used to wait for WalletKit to initialise, which
  // also blocked the address path that has nothing to do with WalletConnect. It no longer needs to
  // for pairing either: `pair` holds a URI that arrives early and flushes it once the kit is up —
  // the same buffer that makes a cold-start deep link work.
  const { enabled, sessions, pair, disconnect } = useWalletConnect();
  const { activeChain } = useWallet();
  const [uri, setUri] = useState("");
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  /**
   * Act on whatever was scanned or pasted.
   *
   * This screen used to accept a pairing URI and answer everything else with "Paste or scan a link
   * that starts with wc:" — which says what the app wanted without saying what the scanner is FOR.
   * The natural mistake in a wallet is to point the camera at another wallet, and that message did
   * nothing to correct it. `parseScan` decides; this only routes.
   */
  const handle = async (value: string) => {
    const parsed = parseScan(value);

    if (parsed.kind === "unknown") {
      setScanning(false);
      Alert.alert("Can't use that code", describeUnknown(parsed.saw));
      return;
    }

    if (parsed.kind === "address") {
      // Refuse rather than switch. Changing the active chain because of something a camera saw,
      // moments before a send, is not a decision to make on someone's behalf.
      if (parsed.chain !== activeChain.kind) {
        setScanning(false);
        Alert.alert(
          "Wrong network for that address",
          parsed.chain === "evm"
            ? "That's an Ethereum-style address. Switch the wallet to Ethereum or BSC first."
            : "That's a Solana address. Switch the wallet to Solana first.",
        );
        return;
      }
      setScanning(false);
      // `replace`, not `navigate`: backing out of Send should return where the member came from,
      // not to a live camera pointed at the same code.
      nav.replace("Send", {
        to: parsed.address,
        ...(parsed.amount ? { amount: parsed.amount } : {}),
        ...(parsed.token ? { asset: parsed.token } : {}),
      });
      return;
    }

    setBusy(true);
    setScanning(false);
    try {
      await pair(parsed.uri);
      setUri("");
    } catch (e) {
      Alert.alert("Couldn't connect", humanizeWcError(e));
    } finally {
      setBusy(false);
    }
  };


  const startScan = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert("Camera needed", "Allow camera access to scan a WalletConnect QR code.");
        return;
      }
    }
    setScanning(true);
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
    >
      <View style={styles.topBar}>
        <Text style={styles.header}>Scan</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Unreachable in a normal build: `walletconnect/config.ts` compiles a project id in, so
          `enabled` is true. It stays for the one case that can still turn it off — a fork that
          overrides the id with an empty string — and it no longer prints a variable name at a
          member, which is what this screen used to do. */}
      {!enabled ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {configNotice(
              "EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID",
              "Connecting to a dApp isn’t available in this build.",
              "Free project id at cloud.reown.com — the web app must use the same one.",
            )}
          </Text>
        </View>
      ) : (
        <>
          {scanning ? (
            <View style={styles.scannerBox}>
              <CameraView
                style={{ flex: 1 }}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => data && handle(data)}
              />
              <Pressable onPress={() => setScanning(false)} style={styles.cancelScan}>
                <Text style={styles.cancelScanText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={startScan} style={styles.scanBtn}>
              <Ionicons name="qr-code-outline" size={20} color={colors.bg} />
              <Text style={styles.scanBtnText}>Scan a QR code</Text>
            </Pressable>
          )}

          <Text style={styles.or}>or paste a link or address</Text>
          <TextInput
            value={uri}
            onChangeText={setUri}
            placeholder="wc:… or a wallet address"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Pressable
            onPress={() => handle(uri)}
            disabled={busy || !uri}
            style={[styles.connectBtn, (busy || !uri) && { opacity: 0.5 }]}
          >
            <Text style={styles.connectText}>{busy ? "Working…" : "Continue"}</Text>
          </Pressable>

          <Text style={styles.sectionTitle}>Connected apps</Text>
          {sessions.length === 0 ? (
            <Text style={styles.empty}>No connected apps.</Text>
          ) : (
            <View style={styles.card}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {sessions.map((s: any, i: number) => (
                <View key={s.topic}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.appName}>{s.peer?.metadata?.name ?? "dApp"}</Text>
                      <Text style={styles.appUrl}>{s.peer?.metadata?.url ?? ""}</Text>
                    </View>
                    <Pressable onPress={() => disconnect(s.topic)} hitSlop={8}>
                      <Text style={styles.disconnect}>Disconnect</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  header: { color: colors.text, fontSize: font.h1, fontWeight: "900" },
  notice: { backgroundColor: colors.warning + "18", borderRadius: radius.md, padding: spacing(4) },
  noticeText: { color: colors.warning, fontSize: font.small, lineHeight: 19 },
  scannerBox: { height: 260, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#000" },
  cancelScan: { position: "absolute", bottom: spacing(3), alignSelf: "center", backgroundColor: "#000000AA", paddingHorizontal: spacing(5), paddingVertical: spacing(2), borderRadius: radius.pill },
  cancelScanText: { color: "#fff", fontWeight: "700" },
  scanBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill },
  scanBtnText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  or: { color: colors.textMuted, fontSize: font.small, textAlign: "center", marginVertical: spacing(4) },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4), color: colors.text, fontSize: font.body },
  connectBtn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", marginTop: spacing(3) },
  connectText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  sectionTitle: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing(7), marginBottom: spacing(3) },
  empty: { color: colors.textMuted, fontSize: font.small },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing(4) },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing(3.5) },
  appName: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  appUrl: { color: colors.textMuted, fontSize: font.small },
  disconnect: { color: colors.negative, fontSize: font.small, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.cardBorder },
});
