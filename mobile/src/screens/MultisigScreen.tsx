import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../wallet/WalletContext";
import { fetchMultisigInfo, isMember, type MultisigInfo } from "../solana/multisig";
import { fetchHoldings, type Holdings } from "../solana/treasury";
import { multisigConfigured, setMultisigAddress } from "../config/multisig";
import { solscanAccount } from "../solana/connection";
import { colors, compact, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

function ActionRow({
  icon,
  label,
  sub,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const tint = danger ? colors.negative : colors.primary;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={20} color={tint} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, danger && { color: colors.negative }]}>{label}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {!danger && <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
    </Pressable>
  );
}

export function MultisigScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { solanaAddress } = useWallet();
  const [configured, setConfigured] = useState(multisigConfigured());
  const [info, setInfo] = useState<MultisigInfo | null>(null);
  const [vault, setVault] = useState<Holdings | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const isConfigured = multisigConfigured();
    setConfigured(isConfigured);
    if (!isConfigured) {
      setInfo(null);
      setVault(null);
      return;
    }
    setLoading(true);
    try {
      const i = await fetchMultisigInfo();
      setInfo(i);
      setVault(i ? await fetchHoldings(i.vault).catch(() => null) : null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-read on every focus so create/connect/disconnect elsewhere reflect immediately.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const member = isMember(info, solanaAddress);

  const disconnect = () => {
    Alert.alert(
      "Disconnect this multisig?",
      "This only removes it from this device — the on-chain Squad and its funds are untouched. You can reconnect anytime with its address.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            await setMultisigAddress("");
            await load();
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Multisig treasury</Text>
        <Pressable onPress={() => nav.canGoBack() && nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6) }} showsVerticalScrollIndicator={false}>
        {!configured ? (
          <>
            <Text style={styles.intro}>
              A shared treasury governed by Squads Protocol (audited): multiple signers must
              approve every spend. Create a new one, or connect an existing Squad by its address.
            </Text>
            <View style={styles.group}>
              <ActionRow
                icon="add-circle-outline"
                label="Create a Squad"
                sub="Deploy a new multisig you control"
                onPress={() => nav.navigate("CreateSquad")}
              />
              <View style={styles.divider} />
              <ActionRow
                icon="link-outline"
                label="Connect an existing multisig"
                sub="Track or sign an existing Squad by address"
                onPress={() => nav.navigate("ConnectMultisig")}
              />
            </View>
          </>
        ) : (
          <>
            <View style={styles.statusCard}>
              <View style={styles.statusHead}>
                <Ionicons name="people-circle-outline" size={20} color={colors.accent} />
                <Text style={styles.statusTitle}>Squads multisig</Text>
                {info && (
                  <Text style={styles.threshold}>
                    {info.threshold} of {info.members.length}
                  </Text>
                )}
              </View>
              {loading && !info ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing(2) }} />
              ) : info ? (
                <>
                  <Text style={styles.balanceLabel}>Vault balance</Text>
                  <Text style={styles.balanceValue}>
                    {vault ? `${compact(vault.sol)} SOL` : "…"}
                    {vault && vault.tokens.length > 0 && (
                      <Text style={styles.balanceSub}>
                        {"  +"}
                        {vault.tokens.length} token{vault.tokens.length === 1 ? "" : "s"}
                      </Text>
                    )}
                  </Text>
                  <Pressable onPress={() => Linking.openURL(solscanAccount(info.vault))} hitSlop={6}>
                    <Text style={styles.vaultLine}>
                      Vault {shortAddress(info.vault, 5, 5)} · view on Solscan ↗
                    </Text>
                  </Pressable>
                  <Text style={styles.memberLine}>
                    {member ? "You're a signer on this treasury." : "You're viewing only — not a signer."}
                  </Text>
                </>
              ) : (
                <Text style={styles.memberLine}>
                  Couldn&apos;t load this multisig. Check your network matches where it was created.
                </Text>
              )}
            </View>

            <View style={styles.group}>
              <ActionRow icon="list-outline" label="View proposals" onPress={() => nav.navigate("TreasuryMultisig")} />
              {member && (
                <>
                  <View style={styles.divider} />
                  <ActionRow icon="paper-plane-outline" label="Propose a transfer" onPress={() => nav.navigate("ProposeTransfer")} />
                  <View style={styles.divider} />
                  <ActionRow icon="people-outline" label="Manage signers" onPress={() => nav.navigate("ManageSigners")} />
                </>
              )}
            </View>

            <Text style={styles.sectionTitle}>Switch</Text>
            <View style={styles.group}>
              <ActionRow icon="add-circle-outline" label="Create a new Squad" onPress={() => nav.navigate("CreateSquad")} />
              <View style={styles.divider} />
              <ActionRow icon="link-outline" label="Connect a different multisig" onPress={() => nav.navigate("ConnectMultisig")} />
              <View style={styles.divider} />
              <ActionRow icon="close-circle-outline" label="Disconnect this multisig" onPress={disconnect} danger />
            </View>
          </>
        )}

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>
            The multisig vault is separate from the main Global Goshens treasury shown on Home.
            Powered by Squads Protocol (audited) — your keys never leave this device.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  intro: { color: colors.textMuted, fontSize: font.body, lineHeight: 22, marginBottom: spacing(4) },
  statusCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4), marginBottom: spacing(4), gap: spacing(2) },
  statusHead: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  statusTitle: { flex: 1, color: colors.text, fontSize: font.h3, fontWeight: "800" },
  threshold: { color: colors.accent, fontSize: font.body, fontWeight: "900" },
  balanceLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing(1) },
  balanceValue: { color: colors.text, fontSize: font.h2, fontWeight: "900" },
  balanceSub: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  vaultLine: { color: colors.primary, fontSize: font.small, fontWeight: "700", marginTop: spacing(1) },
  memberLine: { color: colors.textMuted, fontSize: font.small },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(6),
    marginBottom: spacing(2),
  },
  group: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing(4) },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3.5) },
  rowLabel: { color: colors.text, fontSize: font.body, fontWeight: "600" },
  rowSub: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  note: { flexDirection: "row", gap: spacing(2), backgroundColor: colors.primary + "12", borderRadius: radius.md, padding: spacing(4), marginTop: spacing(6) },
  noteText: { flex: 1, color: colors.textMuted, fontSize: font.small, lineHeight: 18 },
});
