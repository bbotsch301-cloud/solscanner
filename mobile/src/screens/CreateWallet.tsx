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
import { HelpTip } from "../components/HelpTip";
import { humanizeError } from "../solana/errors";
import { colors, font, radius, spacing } from "../theme";

/** Full-screen "create a new wallet" flow (with the optional BIP-39 passphrase). */
export function CreateWallet({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const { create } = useWallet();
  const [passphrase, setPassphrase] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const run = async () => {
      setBusy(true);
      try {
        await create(passphrase);
        onDone();
      } catch (e) {
        Alert.alert("Couldn't create wallet", humanizeError(e, { action: "load" }));
        setBusy(false);
      }
    };
    if (passphrase) {
      Alert.alert(
        "Use a passphrase (25th word)?",
        "You'll need BOTH your recovery phrase AND this exact passphrase to ever restore this " +
          "wallet. If you lose the passphrase, the funds are gone forever — no one can recover it. " +
          "Save it with your recovery phrase.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "I've saved it — create", style: "destructive", onPress: run },
        ]
      );
    } else {
      run();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: insets.top + spacing(2), paddingBottom: insets.bottom + spacing(4) }]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={onCancel} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.title}>Create wallet</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Ionicons name="wallet" size={28} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>A fresh wallet</Text>
          <Text style={styles.heroSub}>
            This creates a new 24-word recovery phrase — a separate, independent wallet. You&apos;ll
            be asked to write the phrase down and back it up next.
          </Text>
        </View>

        <Pressable onPress={() => setShowAdvanced((v) => !v)} style={styles.advToggle} hitSlop={8}>
          <Ionicons name={showAdvanced ? "chevron-down" : "chevron-forward"} size={16} color={colors.textMuted} />
          <Text style={styles.advText}>Advanced · add a passphrase (25th word)</Text>
          <HelpTip topic="passphrase" />
        </Pressable>

        {showAdvanced && (
          <View style={styles.advBox}>
            <Text style={styles.advHint}>
              An optional extra secret mixed into your seed for a hidden wallet. It&apos;s
              case-sensitive and must be saved alongside your recovery phrase — if you lose it, the
              wallet is gone forever and no one can recover it. Leave blank for a normal wallet.
            </Text>
            <TextInput
              value={passphrase}
              onChangeText={setPassphrase}
              placeholder="Passphrase (optional)"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.input}
            />
          </View>
        )}
      </ScrollView>

      <Pressable disabled={busy} onPress={submit} style={[styles.primaryBtn, busy && { opacity: 0.7 }]}>
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Create wallet</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(5) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  hero: { alignItems: "center", gap: spacing(2), marginTop: spacing(6) },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.primary + "22",
    borderWidth: 1,
    borderColor: colors.primary + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: colors.text, fontSize: font.h2, fontWeight: "900", marginTop: spacing(2) },
  heroSub: { color: colors.textMuted, fontSize: font.body, textAlign: "center", lineHeight: 22, paddingHorizontal: spacing(2) },
  advToggle: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginTop: spacing(8), paddingVertical: spacing(2) },
  advText: { flex: 1, color: colors.textMuted, fontSize: font.body, fontWeight: "700" },
  advBox: { gap: spacing(3), marginTop: spacing(1) },
  advHint: { color: colors.textFaint, fontSize: font.small, lineHeight: 19 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    color: colors.text,
    fontSize: font.h3,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
});
