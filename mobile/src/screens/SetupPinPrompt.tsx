import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../wallet/WalletContext";
import { colors, font, radius, spacing } from "../theme";

const MIN = 6;

/**
 * Mandatory PIN setup, shown after wallet setup (and to any older wallet that has no
 * PIN yet). The PIN is the primary lock AND the only thing that encrypts every seed at
 * rest on this device, so it can't be skipped — a wallet is never left with its recovery
 * phrase unencrypted. It can still be changed later in Settings.
 */
export function SetupPinPrompt() {
  const insets = useSafeAreaInsets();
  const { enablePin } = useWallet();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = (t: string) => t.replace(/[^0-9]/g, "");

  const setIt = async () => {
    setError(null);
    if (pin.length < MIN) return setError(`Use at least ${MIN} digits.`);
    if (pin !== confirm) return setError("The two PINs don't match.");
    setBusy(true);
    try {
      await enablePin(pin);
    } catch {
      setError("We couldn't set the PIN. Please try again.");
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: insets.top + spacing(8), paddingBottom: insets.bottom + spacing(6) }]}
    >
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons name="keypad" size={30} color={colors.primary} />
        </View>
        <Text style={styles.title}>Set your PIN</Text>
        <Text style={styles.sub}>
          Your PIN is your wallet lock and encrypts your recovery phrase on this device. It’s
          required — without it your seed would sit unencrypted. You can change it later in Settings.
        </Text>
      </View>

      <View style={styles.form}>
        <TextInput
          value={pin}
          onChangeText={(t) => setPin(digits(t))}
          placeholder="PIN (min 6 digits)"
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={32}
          style={styles.input}
        />
        <TextInput
          value={confirm}
          onChangeText={(t) => setConfirm(digits(t))}
          placeholder="Confirm PIN"
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={32}
          style={styles.input}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.warn}>
          <Ionicons name="warning" size={14} color={colors.warning} />
          <Text style={styles.warnText}>
            We can’t reset your PIN. If you forget it, you’d reset the app and restore from
            your recovery phrase.
          </Text>
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <Pressable onPress={setIt} disabled={busy} style={[styles.primaryBtn, busy && { opacity: 0.7 }]}>
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Set PIN</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(6) },
  hero: { alignItems: "center", gap: spacing(2) },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primary + "22",
    borderWidth: 1,
    borderColor: colors.primary + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text, fontSize: font.h1, fontWeight: "900", marginTop: spacing(3) },
  sub: { color: colors.textMuted, fontSize: font.body, textAlign: "center", lineHeight: 22, marginTop: spacing(1) },
  form: { marginTop: spacing(8), gap: spacing(3) },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(4),
    color: colors.text,
    fontSize: font.h3,
    letterSpacing: 4,
  },
  error: { color: colors.negative, fontSize: font.small },
  warn: {
    flexDirection: "row",
    gap: spacing(2),
    backgroundColor: colors.warning + "18",
    borderRadius: radius.md,
    padding: spacing(3),
  },
  warnText: { flex: 1, color: colors.warning, fontSize: font.small, lineHeight: 18 },
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
