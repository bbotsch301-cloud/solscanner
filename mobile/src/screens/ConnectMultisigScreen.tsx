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
import { useWallet } from "../wallet/WalletContext";
import { inspectMultisig, isMember, type MultisigInfo } from "../solana/multisig";
import { setMultisigAddress } from "../config/multisig";
import { colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function ConnectMultisigScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const { solanaAddress } = useWallet();
  const [addr, setAddr] = useState("");
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<MultisigInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    const a = addr.trim();
    if (!a) return;
    setChecking(true);
    setFound(null);
    setNotFound(false);
    try {
      const info = await inspectMultisig(a);
      if (info) setFound(info);
      else setNotFound(true);
    } finally {
      setChecking(false);
    }
  };

  const connect = async () => {
    if (!found || busy) return;
    setBusy(true);
    try {
      await setMultisigAddress(found.address);
      Alert.alert(
        "Multisig connected",
        isMember(found, solanaAddress)
          ? "You're a signer — you can review and approve its proposals here."
          : "You can view this treasury and its proposals. This account isn't a signer, so approvals happen from a signer's wallet.",
        [{ text: "View treasury", onPress: () => nav.navigate("TreasuryMultisig") }]
      );
    } catch (e) {
      Alert.alert("Couldn't connect", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const youAreSigner = found && isMember(found, solanaAddress);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: insets.top + spacing(2), paddingBottom: insets.bottom + spacing(4) }]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => nav.canGoBack() && nav.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.title}>Connect a multisig</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        <Text style={styles.sub}>
          Point this wallet at an existing Squads multisig treasury by its address. You&apos;ll be
          able to view its holdings and proposals; if this account is a signer, you can approve too.
        </Text>

        <Text style={styles.label}>Multisig address</Text>
        <TextInput
          value={addr}
          onChangeText={(t) => {
            setAddr(t);
            setFound(null);
            setNotFound(false);
          }}
          placeholder="Squads multisig address"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          onSubmitEditing={check}
        />

        {notFound && (
          <Text style={styles.warn}>
            No Squads multisig found at that address. Double-check it — and that you&apos;re on the
            right network (devnet vs mainnet).
          </Text>
        )}

        {!found && (
          <Pressable onPress={check} style={[styles.checkBtn, (!addr.trim() || checking) && { opacity: 0.6 }]} disabled={!addr.trim() || checking}>
            {checking ? <ActivityIndicator color={colors.text} /> : <Text style={styles.checkText}>Look up</Text>}
          </Pressable>
        )}

        {found && (
          <View style={styles.foundCard}>
            <View style={styles.foundHead}>
              <Ionicons name="people-circle-outline" size={20} color={colors.accent} />
              <Text style={styles.foundTitle}>Squads multisig</Text>
              <Text style={styles.foundThreshold}>
                {found.threshold} of {found.members.length}
              </Text>
            </View>
            <Text style={styles.foundAddr}>{shortAddress(found.address, 6, 6)}</Text>
            <View style={styles.signerRow}>
              <Ionicons
                name={youAreSigner ? "checkmark-circle" : "eye-outline"}
                size={16}
                color={youAreSigner ? colors.positive : colors.textMuted}
              />
              <Text style={[styles.signerText, youAreSigner && { color: colors.positive }]}>
                {youAreSigner
                  ? "This account is a signer — you can approve proposals."
                  : "This account isn't a signer — view only."}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>
            Signers whose keys live in another wallet (e.g. Phantom) approve from that wallet — in
            the Squads app (app.squads.so) or wherever they hold the key. This screen just lets this
            device track and, if it&apos;s a signer, sign.
          </Text>
        </View>
      </ScrollView>

      {found && (
        <Pressable disabled={busy} onPress={connect} style={[styles.primaryBtn, busy && { opacity: 0.7 }]}>
          {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Connect this multisig</Text>}
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(5) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.body, lineHeight: 22, marginTop: spacing(5) },
  label: { color: colors.text, fontSize: font.body, fontWeight: "800", marginTop: spacing(6), marginBottom: spacing(2) },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    color: colors.text,
    fontSize: font.body,
  },
  warn: { color: colors.warning, fontSize: font.small, marginTop: spacing(2), lineHeight: 18 },
  checkBtn: {
    marginTop: spacing(4),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingVertical: spacing(3.5),
    alignItems: "center",
  },
  checkText: { color: colors.text, fontSize: font.body, fontWeight: "800" },
  foundCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4), marginTop: spacing(4), gap: spacing(2) },
  foundHead: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  foundTitle: { flex: 1, color: colors.text, fontSize: font.h3, fontWeight: "800" },
  foundThreshold: { color: colors.accent, fontSize: font.body, fontWeight: "900" },
  foundAddr: { color: colors.textMuted, fontSize: font.small, fontWeight: "600" },
  signerRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginTop: spacing(1) },
  signerText: { flex: 1, color: colors.textMuted, fontSize: font.small, fontWeight: "600" },
  note: { flexDirection: "row", gap: spacing(2), backgroundColor: colors.primary + "12", borderRadius: radius.md, padding: spacing(4), marginTop: spacing(6) },
  noteText: { flex: 1, color: colors.textMuted, fontSize: font.small, lineHeight: 18 },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", justifyContent: "center", minHeight: 52 },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
});
