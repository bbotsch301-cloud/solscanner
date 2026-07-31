import * as LocalAuthentication from "expo-local-authentication";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GhostLogo } from "../components/GhostLogo";
import { useAuth } from "../auth";
import { colors, font, radius, spacing } from "../theme";

export function LockScreen() {
  const { unlock } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [biometricLabel, setBiometricLabel] = useState("Face ID");

  const authenticate = async () => {
    setError(null);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        // Simulator / no biometrics enrolled: allow through for the prototype.
        unlock();
        return;
      }
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock SolWallet",
        fallbackLabel: "Use passcode",
      });
      if (res.success) unlock();
      else setError("Authentication failed. Try again.");
    } catch {
      setError("Biometrics unavailable on this device.");
    }
  };

  useEffect(() => {
    // Detect the available biometric to label the button appropriately.
    LocalAuthentication.supportedAuthenticationTypesAsync().then((types) => {
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION))
        setBiometricLabel("Face ID");
      else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT))
        setBiometricLabel("Touch ID");
      else setBiometricLabel("passcode");
    });
    // Prompt immediately, like a real wallet.
    authenticate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.center}>
        <GhostLogo size={88} />
        <Text style={styles.title}>SolWallet</Text>
        <Text style={styles.sub}>Locked</Text>
      </View>

      <View style={styles.bottom}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          onPress={authenticate}
          style={({ pressed }) => [styles.unlockBtn, pressed && { opacity: 0.8 }]}
        >
          <Ionicons
            name={biometricLabel === "Face ID" ? "scan-outline" : "finger-print"}
            size={22}
            color={colors.bg}
          />
          <Text style={styles.unlockText}>Unlock with {biometricLabel}</Text>
        </Pressable>
        <Text style={styles.hint}>Your keys never leave this device.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: spacing(6), justifyContent: "space-between" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing(3) },
  title: { color: colors.text, fontSize: font.h1, fontWeight: "900", marginTop: spacing(3) },
  sub: { color: colors.textMuted, fontSize: font.body },
  bottom: { gap: spacing(3), alignItems: "center" },
  error: { color: colors.negative, fontSize: font.small },
  unlockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radius.pill,
    width: "100%",
  },
  unlockText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  hint: { color: colors.textFaint, fontSize: font.small },
});
