import { useEffect, useState } from "react";
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
import { XGOLogo } from "../components/XGOLogo";
import { colors, font, radius, spacing } from "../theme";

/** Full-screen gate shown at launch when an app PIN is set (seeds are encrypted). */
function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  return m < 60 ? `${m} min` : `${Math.ceil(m / 60)} hr`;
}

export function PinUnlockScreen() {
  const insets = useSafeAreaInsets();
  const { unlockWithPin, pinLockoutMs } = useWallet();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockMs, setLockMs] = useState(pinLockoutMs());

  // While locked out, tick down the remaining time so the button re-enables on its own.
  useEffect(() => {
    if (lockMs <= 0) return;
    const id = setInterval(() => setLockMs(pinLockoutMs()), 500);
    return () => clearInterval(id);
  }, [lockMs, pinLockoutMs]);

  const lockedOut = lockMs > 0;

  const submit = async () => {
    if (pin.length < 6 || busy || lockedOut) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await unlockWithPin(pin);
      if (!ok) {
        const wait = pinLockoutMs();
        setLockMs(wait);
        setError(
          wait > 0
            ? `Too many attempts. Try again in ${formatWait(wait)}.`
            : "Wrong PIN. Try again."
        );
        setPin("");
      }
    } catch {
      setError("Couldn't unlock. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: insets.top + spacing(12), paddingBottom: insets.bottom + spacing(6) }]}
    >
      <View style={styles.hero}>
        <XGOLogo size={72} />
        <Text style={styles.title}>Enter your PIN</Text>
        <Text style={styles.sub}>Your wallets are encrypted on this device. Enter your PIN to unlock them.</Text>
      </View>

      <TextInput
        value={pin}
        onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ""))}
        placeholder="••••••"
        placeholderTextColor={colors.textFaint}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={32}
        autoFocus
        editable={!lockedOut}
        style={styles.input}
        onSubmitEditing={submit}
      />
      {error && (
        <Text style={styles.error}>
          {lockedOut ? `Too many attempts. Try again in ${formatWait(lockMs)}.` : error}
        </Text>
      )}

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={submit}
        disabled={pin.length < 6 || busy || lockedOut}
        style={[styles.btn, (pin.length < 6 || busy || lockedOut) && styles.btnDisabled]}
      >
        {busy ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <>
            <Ionicons name="lock-open" size={18} color={colors.bg} />
            <Text style={styles.btnText}>Unlock</Text>
          </>
        )}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(6) },
  hero: { alignItems: "center", gap: spacing(2) },
  title: { color: colors.text, fontSize: font.h1, fontWeight: "900", marginTop: spacing(4) },
  sub: { color: colors.textMuted, fontSize: font.body, textAlign: "center", lineHeight: 22, marginTop: spacing(1) },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingVertical: spacing(4),
    color: colors.text,
    fontSize: font.h1,
    letterSpacing: 8,
    textAlign: "center",
    marginTop: spacing(8),
  },
  error: { color: colors.negative, fontSize: font.small, textAlign: "center", marginTop: spacing(3) },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radius.pill,
    minHeight: 52,
  },
  btnDisabled: { backgroundColor: colors.card },
  btnText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
});
