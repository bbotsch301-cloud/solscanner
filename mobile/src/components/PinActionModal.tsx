import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput } from "react-native";
import { useWallet } from "../wallet/WalletContext";
import { colors, font, radius, spacing } from "../theme";

export type PinAction = "set" | "change" | "disable" | null;

const MIN = 6;

/** Modal that runs a PIN action (set / change / turn off). scrypt is slow, so it
 *  shows a spinner while working. Clears fields on close. */
export function PinActionModal({ action, onClose }: { action: PinAction; onClose: () => void }) {
  const { enablePin, changePin, disablePin } = useWallet();
  const [oldPin, setOldPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOldPin("");
    setPin("");
    setConfirm("");
    setError(null);
    setBusy(false);
    onClose();
  };

  const digits = (t: string) => t.replace(/[^0-9]/g, "");

  const run = async () => {
    setError(null);
    if (action !== "disable") {
      if (pin.length < MIN) return setError(`Use at least ${MIN} digits.`);
      if (pin !== confirm) return setError("The two PINs don't match.");
    }
    setBusy(true);
    try {
      if (action === "set") {
        await enablePin(pin);
        close();
      } else if (action === "change") {
        const ok = await changePin(oldPin, pin);
        if (!ok) setError("Your current PIN is wrong.");
        else close();
      } else if (action === "disable") {
        const ok = await disablePin(oldPin);
        if (!ok) setError("That PIN is wrong.");
        else close();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const title =
    action === "set" ? "Set an app PIN" : action === "change" ? "Change PIN" : "Turn off PIN";
  const cta = action === "disable" ? "Turn off" : "Save";

  return (
    <Modal visible={action !== null} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>

          {action === "set" && (
            <Text style={styles.note}>
              Your PIN adds a second layer of encryption over every wallet on this device.
              We can’t reset it — if you forget it, you’ll need to reset the app and restore
              from your recovery phrases.
            </Text>
          )}

          {(action === "change" || action === "disable") && (
            <TextInput
              value={oldPin}
              onChangeText={(t) => setOldPin(digits(t))}
              placeholder="Current PIN"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={32}
              style={styles.input}
            />
          )}
          {action !== "disable" && (
            <>
              <TextInput
                value={pin}
                onChangeText={(t) => setPin(digits(t))}
                placeholder={action === "change" ? "New PIN" : "PIN (min 6 digits)"}
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
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable onPress={run} disabled={busy} style={[styles.btn, busy && styles.btnDisabled]}>
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.btnText}>{cta}</Text>}
          </Pressable>
          <Pressable onPress={close} style={styles.cancel} disabled={busy}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000CC", justifyContent: "center", paddingHorizontal: spacing(5) },
  card: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing(5),
  },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800", marginBottom: spacing(3) },
  note: { color: colors.textMuted, fontSize: font.small, lineHeight: 19, marginBottom: spacing(3) },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    color: colors.text,
    fontSize: font.h3,
    letterSpacing: 4,
    marginBottom: spacing(3),
  },
  error: { color: colors.negative, fontSize: font.small, marginBottom: spacing(2) },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radius.pill,
    alignItems: "center",
    minHeight: 52,
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.7 },
  btnText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  cancel: { alignItems: "center", paddingVertical: spacing(3) },
  cancelText: { color: colors.textMuted, fontSize: font.body, fontWeight: "700" },
});
