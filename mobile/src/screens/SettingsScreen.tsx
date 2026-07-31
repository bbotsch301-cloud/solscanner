import * as Clipboard from "expo-clipboard";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth";
import { useWallet } from "../wallet/WalletContext";
import { CLUSTER, solscanAccount } from "../solana/connection";
import { colors, font, radius, shortAddress, spacing } from "../theme";

function Row({
  icon,
  label,
  value,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={20} color={danger ? colors.negative : colors.primary} />
      <Text style={[styles.rowLabel, danger && { color: colors.negative }]}>{label}</Text>
      <View style={styles.rowRight}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      </View>
    </Pressable>
  );
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { lock } = useAuth();
  const { address, reset } = useWallet();
  const network = CLUSTER === "devnet" ? "Devnet" : CLUSTER;

  const confirmReset = () => {
    Alert.alert(
      "Reset wallet?",
      "This deletes the key on this device. On devnet there are no real funds, but you'll get a brand-new address.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: () => reset() },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
    >
      <Text style={styles.header}>Settings</Text>

      <View style={styles.walletCard}>
        <View style={styles.walletAvatar}>
          <Ionicons name="wallet" size={22} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.walletName}>Main wallet</Text>
          <Text style={styles.walletAddr}>{address ? shortAddress(address, 6, 6) : "—"}</Text>
        </View>
        <Pressable onPress={() => address && Clipboard.setStringAsync(address)} hitSlop={10}>
          <Ionicons name="copy-outline" size={20} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Network</Text>
      <View style={styles.group}>
        <Row icon="git-network-outline" label="Cluster" value={network} />
        <View style={styles.divider} />
        <Row
          icon="open-outline"
          label="View on Solscan"
          onPress={() => address && Linking.openURL(solscanAccount(address))}
        />
      </View>

      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.group}>
        <Row icon="finger-print-outline" label="Face ID / passcode" value="On" />
        <View style={styles.divider} />
        <Row icon="lock-closed" label="Lock wallet now" onPress={lock} />
      </View>

      <Text style={styles.sectionTitle}>Danger zone</Text>
      <View style={styles.group}>
        <Row icon="trash-outline" label="Reset wallet" danger onPress={confirmReset} />
      </View>

      <View style={styles.notice}>
        <Ionicons name="flask-outline" size={16} color={colors.warning} />
        <Text style={styles.noticeText}>
          Live on Solana {network} — real keypair, real transactions, test money only.
          Mainnet (real funds) is a deliberate later step.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { color: colors.text, fontSize: font.h1, fontWeight: "900", marginBottom: spacing(4) },
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
  },
  walletAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent + "33",
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  walletName: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  walletAddr: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(6),
    marginBottom: spacing(2),
  },
  group: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3.5) },
  rowLabel: { flex: 1, color: colors.text, fontSize: font.body, fontWeight: "600" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  rowValue: { color: colors.textMuted, fontSize: font.body },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  notice: {
    flexDirection: "row",
    gap: spacing(2),
    backgroundColor: colors.warning + "18",
    borderRadius: radius.md,
    padding: spacing(4),
    marginTop: spacing(6),
  },
  noticeText: { flex: 1, color: colors.warning, fontSize: font.small, lineHeight: 18 },
});
