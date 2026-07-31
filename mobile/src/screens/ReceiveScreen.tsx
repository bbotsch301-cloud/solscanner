import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { useWallet } from "../wallet/WalletContext";
import { CLUSTER } from "../solana/connection";
import { colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function ReceiveScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const { activeChain, activeAddress } = useWallet();
  const address = activeAddress;
  const [copied, setCopied] = useState(false);
  const isSolana = activeChain.kind === "solana";
  const network = isSolana ? (CLUSTER === "devnet" ? "Devnet" : "Mainnet") : activeChain.name;

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Receive</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.qrCard}>
          {address ? (
            <QRCode value={address} size={200} backgroundColor="#fff" color="#0B0B0F" />
          ) : null}
        </View>

        <Text style={styles.label}>Your wallet</Text>
        <View style={styles.netPill}>
          <View style={styles.dot} />
          <Text style={styles.netText}>{network}</Text>
        </View>

        <Text style={styles.address}>{address}</Text>

        <Pressable onPress={copy} style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={colors.bg} />
          <Text style={styles.copyText}>{copied ? "Copied" : "Copy address"}</Text>
        </Pressable>

        <Text style={styles.hint}>
          {isSolana
            ? `Only send Solana (SPL) assets to this address on ${network}.`
            : `Only send ${activeChain.name} assets — ${activeChain.symbol} and its tokens — to this address. Sending assets from another chain will lose them.`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  body: { alignItems: "center", marginTop: spacing(8), gap: spacing(3) },
  qrCard: { backgroundColor: "#fff", padding: spacing(5), borderRadius: radius.lg, minWidth: 240, minHeight: 240, alignItems: "center", justifyContent: "center" },
  label: { color: colors.text, fontSize: font.h3, fontWeight: "700", marginTop: spacing(2) },
  netPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  netText: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "800" },
  address: { color: colors.textMuted, fontSize: font.small, textAlign: "center", paddingHorizontal: spacing(6), marginTop: spacing(2) },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    backgroundColor: colors.primary,
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(3.5),
    borderRadius: radius.pill,
    marginTop: spacing(3),
  },
  copyText: { color: colors.bg, fontSize: font.body, fontWeight: "800" },
  hint: { color: colors.textFaint, fontSize: font.small, textAlign: "center", marginTop: spacing(4), paddingHorizontal: spacing(6) },
});
