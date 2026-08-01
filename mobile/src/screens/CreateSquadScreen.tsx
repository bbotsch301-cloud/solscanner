import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
import { createMultisig } from "../solana/multisig";
import { humanizeError } from "../solana/errors";
import { IS_MAINNET, CLUSTER } from "../solana/connection";
import { colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function CreateSquadScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const { keypair, solanaAddress } = useWallet();
  const [members, setMembers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [threshold, setThreshold] = useState(1);
  const [busy, setBusy] = useState(false);

  const total = 1 + members.length; // you (the creator) + the others

  const addMember = () => {
    const a = input.trim();
    if (!a) return;
    try {
      new PublicKey(a); // throws if not a valid address
    } catch {
      Alert.alert("Invalid address", "That isn't a valid Solana address.");
      return;
    }
    if (a === solanaAddress || members.includes(a)) {
      Alert.alert("Already a signer", "That address is already on the list.");
      return;
    }
    setMembers([...members, a]);
    setInput("");
  };

  const removeMember = (a: string) => {
    const next = members.filter((m) => m !== a);
    setMembers(next);
    if (threshold > 1 + next.length) setThreshold(1 + next.length);
  };

  const create = () => {
    if (!keypair || busy) return;
    Alert.alert(
      "Create this multisig?",
      `${threshold} of ${total} signers must approve every spend.\n\nThis deploys a Squads multisig on ${
        IS_MAINNET ? "MAINNET — a small real fee + rent applies" : `${CLUSTER} (test)`
      }, paid and signed by your wallet.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Create",
          onPress: async () => {
            setBusy(true);
            try {
              await createMultisig(keypair, members, threshold);
              Alert.alert("Multisig created", "Your treasury is now a Squads multisig.", [
                { text: "Done", onPress: () => nav.goBack() },
              ]);
            } catch (e) {
              // Surface the real error for this advanced action (generic fallback hides it).
              const detail = e instanceof Error ? e.message : humanizeError(e, { action: "load" });
              Alert.alert("Couldn't create", detail);
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: insets.top + spacing(2), paddingBottom: insets.bottom + spacing(4) }]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.title}>Create a Squad</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        <Text style={styles.sub}>
          A multisig treasury (Squads Protocol). Add each signer&apos;s Solana address and set how
          many approvals a spend needs. You&apos;re included automatically.
        </Text>

        <Text style={styles.label}>Signers</Text>
        <View style={styles.list}>
          <View style={styles.row}>
            <Ionicons name="person-circle" size={22} color={colors.primary} />
            <Text style={styles.rowAddr}>{solanaAddress ? shortAddress(solanaAddress, 6, 6) : "You"}</Text>
            <Text style={styles.youTag}>You</Text>
          </View>
          {members.map((m) => (
            <View key={m} style={styles.row}>
              <Ionicons name="person" size={20} color={colors.textMuted} />
              <Text style={styles.rowAddr}>{shortAddress(m, 6, 6)}</Text>
              <Pressable onPress={() => removeMember(m)} hitSlop={10}>
                <Ionicons name="close-circle" size={20} color={colors.negative} />
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.addRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Add a signer's Solana address"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            onSubmitEditing={addMember}
          />
          <Pressable onPress={addMember} style={styles.addBtn}>
            <Ionicons name="add" size={22} color={colors.bg} />
          </Pressable>
        </View>

        <Text style={styles.label}>Approvals required</Text>
        <View style={styles.thresholdRow}>
          <Pressable
            onPress={() => setThreshold((t) => Math.max(1, t - 1))}
            style={styles.stepBtn}
          >
            <Ionicons name="remove" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.thresholdText}>
            {threshold} of {total}
          </Text>
          <Pressable
            onPress={() => setThreshold((t) => Math.min(total, t + 1))}
            style={styles.stepBtn}
          >
            <Ionicons name="add" size={22} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.warn}>
          <Ionicons name="shield-checkmark" size={16} color={colors.accent} />
          <Text style={styles.warnText}>
            Powered by Squads Protocol (audited). Deploying on {IS_MAINNET ? "mainnet costs a small fee + rent" : `${CLUSTER}`}.
            Add real signers you trust — a {threshold}-of-{total} threshold means any {threshold} of them can move funds.
          </Text>
        </View>
      </ScrollView>

      <Pressable disabled={busy} onPress={create} style={[styles.primaryBtn, busy && { opacity: 0.7 }]}>
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Create multisig</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(5) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.body, lineHeight: 22, marginTop: spacing(5) },
  label: { color: colors.text, fontSize: font.body, fontWeight: "800", marginTop: spacing(6), marginBottom: spacing(2) },
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
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  thresholdRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(5) },
  stepBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  thresholdText: { color: colors.text, fontSize: font.h2, fontWeight: "900", minWidth: 110, textAlign: "center" },
  warn: { flexDirection: "row", gap: spacing(2), backgroundColor: colors.accent + "18", borderRadius: radius.md, padding: spacing(4), marginTop: spacing(6) },
  warnText: { flex: 1, color: colors.accent, fontSize: font.small, lineHeight: 18 },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", justifyContent: "center", minHeight: 52 },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
});
