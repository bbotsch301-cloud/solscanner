import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { NETWORK, WALLET_ADDRESS, WALLET_LABEL } from "../data/mockWallet";
import { colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function ReceiveScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(WALLET_ADDRESS);
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
          <QRCode value={WALLET_ADDRESS} size={200} backgroundColor="#fff" color="#0B0B0F" />
        </View>

        <Text style={styles.label}>{WALLET_LABEL}</Text>
        <View style={styles.netPill}>
          <View style={styles.dot} />
          <Text style={styles.netText}>{NETWORK}</Text>
        </View>

        <Text style={styles.address}>{WALLET_ADDRESS}</Text>

        <Pressable onPress={copy} style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={18}
            color={colors.bg}
          />
          <Text style={styles.copyText}>{copied ? "Copied" : "Copy address"}</Text>
        </Pressable>

        <Text style={styles.hint}>
          Only send Solana (SPL) assets to this address on {NETWORK}.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  body: { alignItems: "center", marginTop: spacing(8), gap: spacing(3) },
  qrCard: {
    backgroundColor: "#fff",
    padding: spacing(5),
    borderRadius: radius.lg,
  },
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
  address: {
    color: colors.textMuted,
    fontSize: font.small,
    textAlign: "center",
    paddingHorizontal: spacing(6),
    marginTop: spacing(2),
  },
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
  hint: {
    color: colors.textFaint,
    fontSize: font.small,
    textAlign: "center",
    marginTop: spacing(4),
    paddingHorizontal: spacing(6),
  },
});
