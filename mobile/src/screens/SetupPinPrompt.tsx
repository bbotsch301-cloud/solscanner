import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
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
import { colors, font, radius, spacing } from "../theme";

const MIN = 6;

/**
 * PIN setup, shown after wallet setup (and to any older wallet that has no PIN yet). The PIN
 * is the primary lock AND the extra layer that encrypts every seed at rest on this device.
 * It's strongly recommended, but skippable — "Skip for now" leaves the seed protected by the
 * OS keychain alone, and a PIN can still be added later in Settings.
 */
export function SetupPinPrompt() {
  const insets = useSafeAreaInsets();
  const { enablePin, skipPinPrompt } = useWallet();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const digits = (t: string) => t.replace(/[^0-9]/g, "");

  const setIt = async () => {
    Keyboard.dismiss();
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

  const skip = async () => {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true);
    await skipPinPrompt();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing(8), paddingBottom: insets.bottom + spacing(6) },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Ionicons name="keypad" size={30} color={colors.primary} />
          </View>
          <Text style={styles.title}>Set your PIN</Text>
          <Text style={styles.sub}>
            Your PIN is your wallet lock and adds a layer of encryption over your recovery phrase
            on this device. Strongly recommended. You can also add it later in Settings.
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

        <View style={styles.spacer} />

        <Pressable onPress={setIt} disabled={busy} style={[styles.primaryBtn, busy && { opacity: 0.7 }]}>
          {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Set PIN</Text>}
        </Pressable>
        <Pressable onPress={skip} disabled={busy} style={styles.skipBtn}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: spacing(6) },
  spacer: { flex: 1, minHeight: spacing(6) },
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
  skipBtn: { alignItems: "center", paddingVertical: spacing(3), marginTop: spacing(1) },
  skipText: { color: colors.textMuted, fontSize: font.body, fontWeight: "700" },
});
