import * as LocalAuthentication from "expo-local-authentication";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { GhostLogo } from "../components/GhostLogo";
import { useAuth } from "../auth";
import { useWallet } from "../wallet/WalletContext";
import { colors, font, radius, spacing } from "../theme";

function Feature({ icon, title, sub }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSub}>{sub}</Text>
      </View>
    </View>
  );
}

export function OnboardingScreen() {
  const { unlock } = useAuth();
  const { create } = useWallet();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const createWithPasskey = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && enrolled) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: "Create your wallet passkey",
        });
        if (!res.success) {
          setBusy(false);
          return;
        }
      }
      await create(); // generates a keypair, stored in the device keychain
      unlock();
    } catch (e) {
      Alert.alert("Couldn't create wallet", (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(8), paddingBottom: insets.bottom + spacing(6) }]}>
      <View style={styles.hero}>
        <GhostLogo size={104} />
        <Text style={styles.title}>SolWallet</Text>
        <Text style={styles.tagline}>
          A friendlier Solana wallet. Secured by your face, not a password.
        </Text>
      </View>

      <View style={styles.features}>
        <Feature icon="finger-print" title="Passkey security" sub="Unlock with Face ID — no seed phrase to lose." />
        <Feature icon="flash" title="Live on devnet" sub="Real balances and transactions on Solana's test network." />
        <Feature icon="shield-checkmark" title="Self-custody" sub="Your key is generated and stored on this device." />
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={createWithPasskey}
          disabled={busy}
          style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && { opacity: 0.85 }]}
        >
          <Ionicons name="finger-print" size={20} color={colors.bg} />
          <Text style={styles.primaryText}>{busy ? "Creating…" : "Create with passkey"}</Text>
        </Pressable>
        <Pressable
          onPress={() => Alert.alert("Import", "Importing an existing wallet is coming soon.")}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryText}>I already have a wallet</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(6), justifyContent: "space-between" },
  hero: { alignItems: "center", gap: spacing(3) },
  title: { color: colors.text, fontSize: 40, fontWeight: "900", marginTop: spacing(3) },
  tagline: { color: colors.textMuted, fontSize: font.body, textAlign: "center", lineHeight: 22, paddingHorizontal: spacing(4) },
  features: { gap: spacing(4) },
  feature: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary + "22",
    borderWidth: 1,
    borderColor: colors.primary + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  featureSub: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  actions: { gap: spacing(3) },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radius.pill,
  },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  secondaryBtn: { alignItems: "center", paddingVertical: spacing(3) },
  secondaryText: { color: colors.textMuted, fontSize: font.body, fontWeight: "700" },
});
