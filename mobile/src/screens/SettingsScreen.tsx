import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import { Alert, DevSettings, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth";
import type { RootNav } from "../navigation";
import { useWallet } from "../wallet/WalletContext";
import { CLUSTER, IS_MAINNET, setNetwork, solscanAccount, type Network } from "../solana/connection";
import { isBiometricEnabled, setBiometricEnabled, isNotificationsEnabled, setNotificationsEnabled } from "../security/prefs";
import { requestNotificationPermission } from "../ui/notifications";
import { PinActionModal, type PinAction } from "../components/PinActionModal";
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
  const nav = useNavigation<RootNav>();
  const { lock } = useAuth();
  const { address, reset, pinEnabled } = useWallet();
  const network = CLUSTER === "devnet" ? "Devnet" : CLUSTER;
  const [biometric, setBiometric] = useState(isBiometricEnabled());
  const [notifications, setNotifications] = useState(isNotificationsEnabled());
  const [pinAction, setPinAction] = useState<PinAction>(null);

  const toggleNotifications = async (v: boolean) => {
    if (v) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert("Notifications blocked", "Allow notifications for XGO in your phone's Settings to get receive alerts.");
        return; // leave the toggle off
      }
    }
    setNotifications(v);
    await setNotificationsEnabled(v);
  };

  const toggleBiometric = (v: boolean) => {
    setBiometric(v);
    setBiometricEnabled(v);
    Alert.alert(
      v ? "Face ID required" : "Face ID off",
      v
        ? "Your wallet will ask for Face ID / passcode to open."
        : "Your wallet will open without Face ID. Applies next time it locks.",
    );
  };

  const switchTo = (n: Network) => {
    if ((n === "mainnet-beta") === IS_MAINNET) return; // already there
    const doIt = async () => {
      await setNetwork(n);
      try {
        DevSettings.reload();
      } catch {
        Alert.alert("Restart needed", "Close and reopen the app to apply the change.");
      }
    };
    if (n === "mainnet-beta") {
      Alert.alert("Switch to Mainnet?", "This uses REAL funds. The app will reload.", [
        { text: "Cancel", style: "cancel" },
        { text: "Switch", style: "destructive", onPress: doIt },
      ]);
    } else {
      Alert.alert("Switch to Devnet?", "Test network (no real funds). The app will reload.", [
        { text: "Cancel", style: "cancel" },
        { text: "Switch", onPress: doIt },
      ]);
    }
  };

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
      <View style={styles.topBar}>
        <Text style={styles.header}>Settings</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

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
        <View style={styles.netRow}>
          <Ionicons name="git-network-outline" size={20} color={colors.primary} />
          <Text style={styles.rowLabel}>Cluster</Text>
          <View style={styles.netToggle}>
            <Pressable
              onPress={() => switchTo("devnet")}
              style={[styles.netOpt, !IS_MAINNET && styles.netOptActive]}
            >
              <Text style={[styles.netOptText, !IS_MAINNET && { color: colors.bg }]}>Devnet</Text>
            </Pressable>
            <Pressable
              onPress={() => switchTo("mainnet-beta")}
              style={[styles.netOpt, IS_MAINNET && styles.netOptActive]}
            >
              <Text style={[styles.netOptText, IS_MAINNET && { color: colors.bg }]}>Mainnet</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.divider} />
        <Row
          icon="open-outline"
          label="View on Solscan"
          onPress={() => address && Linking.openURL(solscanAccount(address))}
        />
      </View>

      <Text style={styles.sectionTitle}>Security</Text>
      <View style={styles.group}>
        <Row
          icon="key-outline"
          label="Recovery phrase"
          onPress={() => nav.navigate("Backup")}
        />
        <View style={styles.divider} />
        {/* App PIN is the primary lock — shown first. */}
        {pinEnabled ? (
          <>
            <Row icon="keypad-outline" label="Change PIN" onPress={() => setPinAction("change")} />
            <View style={styles.divider} />
            <Row icon="keypad-outline" label="Turn off app PIN" danger onPress={() => setPinAction("disable")} />
          </>
        ) : (
          <Row
            icon="keypad-outline"
            label="Set up app PIN"
            value="Encrypts wallets"
            onPress={() => setPinAction("set")}
          />
        )}
        <View style={styles.divider} />
        <View style={styles.netRow}>
          <Ionicons name="finger-print-outline" size={20} color={colors.primary} />
          <Text style={styles.rowLabel}>Face ID / passcode</Text>
          <Switch
            value={biometric}
            onValueChange={toggleBiometric}
            trackColor={{ true: colors.primary, false: colors.cardBorder }}
            thumbColor={colors.text}
          />
        </View>
        {pinEnabled && (
          <Text style={styles.hint}>Your PIN is the active lock. Face ID applies only when no PIN is set.</Text>
        )}
        {biometric && !pinEnabled && (
          <>
            <View style={styles.divider} />
            <Row icon="lock-closed" label="Lock wallet now" onPress={lock} />
          </>
        )}
      </View>

      <PinActionModal action={pinAction} onClose={() => setPinAction(null)} />

      <Text style={styles.sectionTitle}>Notifications</Text>
      <View style={styles.group}>
        <View style={styles.netRow}>
          <Ionicons name="notifications-outline" size={20} color={colors.primary} />
          <Text style={styles.rowLabel}>Receive alerts</Text>
          <Switch
            value={notifications}
            onValueChange={toggleNotifications}
            trackColor={{ true: colors.primary, false: colors.cardBorder }}
            thumbColor={colors.text}
          />
        </View>
        <Text style={styles.hint}>Get a notification whenever funds arrive while the app is open.</Text>
      </View>

      <Text style={styles.sectionTitle}>Connections</Text>
      <View style={styles.group}>
        <Row icon="link" label="Connect to a dApp" onPress={() => nav.navigate("WalletConnect")} />
        <Row icon="shield-checkmark-outline" label="Token approvals" onPress={() => nav.navigate("TokenApprovals")} />
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
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  header: { color: colors.text, fontSize: font.h1, fontWeight: "900" },
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
  netRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  netToggle: { flexDirection: "row", backgroundColor: colors.bgElevated, borderRadius: radius.pill, padding: 3 },
  netOpt: { paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: radius.pill },
  netOptActive: { backgroundColor: colors.primary },
  netOptText: { color: colors.textMuted, fontSize: font.small, fontWeight: "800" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  rowValue: { color: colors.textMuted, fontSize: font.body },
  hint: { color: colors.textFaint, fontSize: font.small, lineHeight: 17, paddingBottom: spacing(3) },
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
