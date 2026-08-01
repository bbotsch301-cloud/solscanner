import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useWalletConnect } from "../walletconnect/WalletConnectContext";
import { humanizeWcError } from "../walletconnect/errors";
import { colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function WalletConnectScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const { enabled, ready, sessions, pair, disconnect } = useWalletConnect();
  const [uri, setUri] = useState("");
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  const connect = async (value: string) => {
    const v = value.trim();
    if (!v.startsWith("wc:")) {
      Alert.alert("Not a WalletConnect link", "Paste or scan a link that starts with “wc:”.");
      return;
    }
    setBusy(true);
    setScanning(false);
    try {
      await pair(v);
      setUri("");
    } catch (e) {
      Alert.alert("Couldn’t connect", humanizeWcError(e));
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
        <Text style={styles.header}>Connect to a dApp</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      {!enabled ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            dApp connect needs a WalletConnect project id. Set EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID
            (free at cloud.reown.com) and restart.
          </Text>
        </View>
      ) : (
        <>
          {scanning ? (
            <View style={styles.scannerBox}>
              <CameraView
                style={{ flex: 1 }}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => data && connect(data)}
              />
              <Pressable onPress={() => setScanning(false)} style={styles.cancelScan}>
                <Text style={styles.cancelScanText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={startScan} style={styles.scanBtn}>
              <Ionicons name="qr-code-outline" size={20} color={colors.bg} />
              <Text style={styles.scanBtnText}>Scan WalletConnect QR</Text>
            </Pressable>
          )}

          <Text style={styles.or}>or paste the link</Text>
          <TextInput
            value={uri}
            onChangeText={setUri}
            placeholder="wc:…"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Pressable
            onPress={() => connect(uri)}
            disabled={busy || !uri || !ready}
            style={[styles.connectBtn, (busy || !uri || !ready) && { opacity: 0.5 }]}
          >
            <Text style={styles.connectText}>{busy ? "Connecting…" : "Connect"}</Text>
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
