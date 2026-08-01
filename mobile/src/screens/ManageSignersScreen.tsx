import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "../wallet/WalletContext";
import {
  fetchMultisigInfo,
  prepareAddSigner,
  prepareRemoveSigner,
  prepareChangeThreshold,
  type MultisigInfo,
  type PreparedTx,
} from "../solana/multisig";
import { humanizeError } from "../solana/errors";
import { colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function ManageSignersScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { keypair, solanaAddress } = useWallet();
  const [info, setInfo] = useState<MultisigInfo | null>(null);
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setInfo(await fetchMultisigInfo());
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    load();
  }, [load]);

  // Any config change is a proposal the current signers must approve, then execute.
  const propose = async (
    title: string,
    detail: string,
    prepare: (kp: NonNullable<typeof keypair>) => Promise<PreparedTx>
  ) => {
    if (!keypair || busy) return;
    setBusy(true);
    let prepared: PreparedTx;
    try {
      prepared = await prepare(keypair);
    } catch (e) {
      Alert.alert("Couldn't prepare", e instanceof Error ? e.message : "Please try again.");
      return;
    } finally {
      setBusy(false);
    }
    Alert.alert(
      title,
      `${detail}\n\nCreates a proposal your co-signers must approve (${info?.threshold} of ${info?.members.length}).\n` +
        `Network fee ≈ ${prepared.feeSol.toFixed(6)} SOL${prepared.rent ? " + a small refundable rent" : ""}.` +
        (prepared.warn ? `\n\n⚠️ ${prepared.warn}` : ""),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: prepared.warn ? "Propose anyway" : "Propose",
          onPress: async () => {
            setBusy(true);
            try {
              await prepared.send();
              Alert.alert("Proposed", "Your co-signers can now approve it.", [
                { text: "View proposals", onPress: () => nav.navigate("TreasuryMultisig") },
                { text: "Done" },
              ]);
              setAddr("");
            } catch (e) {
              Alert.alert("Couldn't propose", humanizeError(e, { action: "send" }));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const addSigner = () => {
    const a = addr.trim();
    try {
      new PublicKey(a);
    } catch {
      Alert.alert("Invalid address", "That isn't a valid Solana address.");
      return;
    }
    if (info?.members.some((m) => m.key === a)) {
      Alert.alert("Already a signer", "That address is already on the multisig.");
      return;
    }
    propose("Add signer?", `Add ${shortAddress(a, 6, 6)} as a signer.`, (kp) => prepareAddSigner(kp, a));
  };

  const removeSigner = (a: string) => {
    const newCount = (info?.members.length ?? 1) - 1;
    const willLower = !!info && info.threshold > newCount;
    const detail =
      `Remove ${shortAddress(a, 6, 6)} from the multisig.` +
      (willLower ? ` Approvals will drop to ${newCount} of ${newCount}.` : "");
    propose("Remove signer?", detail, (kp) => prepareRemoveSigner(kp, a));
  };

  const changeThreshold = (n: number) => {
    if (!info || n < 1 || n > info.members.length || n === info.threshold) return;
    propose("Change approvals?", `Require ${n} of ${info.members.length} signers to approve spends.`, (kp) =>
      prepareChangeThreshold(kp, n)
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: insets.top + spacing(2), paddingBottom: insets.bottom + spacing(4) }]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => nav.canGoBack() && nav.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.title}>Signers</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing(4) }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.sub}>
          Changes here — adding or removing a signer, or changing how many approvals a spend
          needs — are proposals your current signers must approve.
        </Text>

        <View style={styles.headerRow}>
          <Text style={styles.label}>Current signers</Text>
          <Text style={styles.thresholdTag}>
            {info ? `${info.threshold} of ${info.members.length}` : "—"}
          </Text>
        </View>
        <View style={styles.list}>
          {info?.members.map((m) => (
            <View key={m.key} style={styles.row}>
              <Ionicons name="person" size={18} color={colors.textMuted} />
              <Text style={styles.rowAddr}>{shortAddress(m.key, 6, 6)}</Text>
              {m.key === solanaAddress && <Text style={styles.youTag}>You</Text>}
              <Pressable onPress={() => removeSigner(m.key)} hitSlop={10} disabled={busy}>
                <Ionicons name="remove-circle" size={20} color={colors.negative} />
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.addRow}>
          <TextInput
            value={addr}
            onChangeText={setAddr}
            placeholder="Add a signer's Solana address"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={addSigner}
          />
          <Pressable onPress={addSigner} style={styles.addBtn} disabled={busy}>
            <Ionicons name="add" size={22} color={colors.bg} />
          </Pressable>
        </View>

        {info && (
          <>
            <Text style={styles.label}>Approvals required</Text>
            <View style={styles.thresholdRow}>
              <Pressable onPress={() => changeThreshold(info.threshold - 1)} style={styles.stepBtn} disabled={busy}>
                <Ionicons name="remove" size={22} color={colors.text} />
              </Pressable>
              <Text style={styles.thresholdText}>
                {info.threshold} of {info.members.length}
              </Text>
              <Pressable onPress={() => changeThreshold(info.threshold + 1)} style={styles.stepBtn} disabled={busy}>
                <Ionicons name="add" size={22} color={colors.text} />
              </Pressable>
            </View>
            <Text style={styles.hint}>Tapping ± proposes a new threshold for your signers to approve.</Text>
          </>
        )}

        {busy && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing(4) }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(5) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.body, lineHeight: 22, marginTop: spacing(5) },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing(6), marginBottom: spacing(2) },
  label: { color: colors.text, fontSize: font.body, fontWeight: "800" },
  thresholdTag: { color: colors.accent, fontSize: font.body, fontWeight: "900" },
  list: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing(4) },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  rowAddr: { flex: 1, color: colors.text, fontSize: font.body, fontWeight: "600" },
  youTag: { color: colors.primary, fontSize: font.small, fontWeight: "800" },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginTop: spacing(3) },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    color: colors.text,
    fontSize: font.body,
  },
  addBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  thresholdRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(5), marginTop: spacing(2) },
  stepBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, alignItems: "center", justifyContent: "center" },
  thresholdText: { color: colors.text, fontSize: font.h2, fontWeight: "900", minWidth: 110, textAlign: "center" },
  hint: { color: colors.textFaint, fontSize: font.small, textAlign: "center", marginTop: spacing(2) },
});
