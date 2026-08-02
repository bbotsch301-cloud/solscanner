import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useWallet } from "../wallet/WalletContext";
import { XGOLogo } from "../components/XGOLogo";
import { KeySplash } from "../components/KeySplash";
import { haptics } from "../ui/haptics";
import { colors, font, radius, spacing } from "../theme";

/** Full-screen gate shown at launch when an app PIN is set (seeds are encrypted). */
function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  return m < 60 ? `${m} min` : `${Math.ceil(m / 60)} hr`;
}

/** Full-screen "decrypting" splash shown while the PIN-derived key runs (scrypt takes a moment
 *  on-device). The same Kingdom Key entrance as the startup splash, so unlocking reads as the same
 *  ritual as launching. */
function DecryptingSplash() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.splash, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <KeySplash />
    </View>
  );
}

export function PinUnlockScreen() {
  const insets = useSafeAreaInsets();
  const { unlockWithPin, pinLockoutMs, reset } = useWallet();
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

  const submit = async (value: string) => {
    if (value.length < 6 || busy || lockedOut) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await unlockWithPin(value);
      if (ok) {
        haptics.success();
      } else {
        haptics.error();
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

  // Safety valve: if the PIN is forgotten (or a device is too slow to unlock), the only way
  // back in is to wipe the encrypted wallets and restore from the recovery phrase.
  const forgotPin = () => {
    Alert.alert(
      "Forgot your PIN?",
      "There's no way to recover a lost PIN. You can reset the app and restore your wallets from their recovery phrases. Only do this if you have those phrases saved — otherwise your funds are lost.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reset app", style: "destructive", onPress: () => reset() },
      ]
    );
  };

  if (busy) return <DecryptingSplash />;

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
        onChangeText={(t) => {
          const digits = t.replace(/[^0-9]/g, "").slice(0, 6);
          setPin(digits);
          if (digits.length === 6) submit(digits); // auto-unlock once all 6 are entered
        }}
        placeholder="••••••"
        placeholderTextColor={colors.textFaint}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        autoFocus
        editable={!lockedOut}
        style={styles.input}
      />
      {error && (
        <Text style={styles.error}>
          {lockedOut ? `Too many attempts. Try again in ${formatWait(lockMs)}.` : error}
        </Text>
      )}

      <View style={{ flex: 1 }} />

      <Pressable onPress={forgotPin} style={styles.forgot} hitSlop={8}>
        <Text style={styles.forgotText}>Forgot PIN?</Text>
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
  forgot: { alignItems: "center", paddingVertical: spacing(4) },
  forgotText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  splash: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
});
