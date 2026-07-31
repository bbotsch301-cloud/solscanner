import * as LocalAuthentication from "expo-local-authentication";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { XGOLogo } from "../components/XGOLogo";
import { HelpTip } from "../components/HelpTip";
import { ImportWallet } from "./ImportWallet";
import { useAuth } from "../auth";
import { useWallet } from "../wallet/WalletContext";
import { humanizeError } from "../solana/errors";
import { colors, font, radius, spacing } from "../theme";

function Feature({
  icon,
  title,
  sub,
  help,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  help?: "seedPhrase" | "passphrase" | "selfCustody";
}) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureSub}>{sub}</Text>
      </View>
      {help && <HelpTip topic={help} size={20} />}
    </View>
  );
}

export function OnboardingScreen() {
  const { unlock } = useAuth();
  const { create } = useWallet();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  if (showImport) {
    return <ImportWallet onDone={unlock} onCancel={() => setShowImport(false)} />;
  }

  const doCreate = async () => {
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
      await create(passphrase); // generates a keypair, stored in the device keychain
      unlock();
    } catch (e) {
      Alert.alert("Couldn't create wallet", humanizeError(e, { action: "load" }));
      setBusy(false);
    }
  };

  const createWithPasskey = async () => {
    if (busy) return;
    // A passphrase is unrecoverable and required for every future restore — make
    // sure they understand before it's baked into the wallet.
    if (passphrase) {
      Alert.alert(
        "Use a passphrase (25th word)?",
        "You'll need BOTH your recovery phrase AND this exact passphrase to ever restore this wallet. If you lose the passphrase, the funds are gone forever — no one can recover it. Save it with your recovery phrase.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "I've saved it — create", style: "destructive", onPress: doCreate },
        ]
      );
      return;
    }
    await doCreate();
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(8), paddingBottom: insets.bottom + spacing(6) }]}>
      <View style={styles.hero}>
        <XGOLogo size={108} />
        <Text style={styles.title}>XGO</Text>
        <Text style={styles.kicker}>The Treasury · The Mission · The Future</Text>
        <Text style={styles.tagline}>
          A self-custody wallet powering a stronger tomorrow through the XGO ecosystem.
        </Text>
      </View>

      <View style={styles.features}>
        <Feature icon="shield-checkmark" title="Self-custody" sub="Your keys are generated and stay on this device." help="selfCustody" />
        <Feature icon="business" title="Transparent treasury" sub="Every figure is verifiable on-chain." />
        <Feature icon="people" title="Community governed" sub="Hold XGO to help govern the mission." />
      </View>

      <View style={styles.actions}>
        <View style={styles.advancedRow}>
          <Pressable
            onPress={() => setShowAdvanced((v) => !v)}
            style={styles.advancedToggle}
            hitSlop={8}
          >
            <Ionicons
              name={showAdvanced ? "chevron-down" : "chevron-forward"}
              size={16}
              color={colors.textMuted}
            />
            <Text style={styles.advancedToggleText}>Advanced · add a passphrase (25th word)</Text>
          </Pressable>
          <HelpTip topic="passphrase" />
        </View>

        {showAdvanced && (
          <View style={styles.advancedBox}>
            <Text style={styles.advancedHint}>
              Optional extra secret mixed into your seed for a hidden wallet. You must
              save it with your recovery phrase — if you lose it, the wallet is gone
              forever and no one can recover it.
            </Text>
            <TextInput
              value={passphrase}
              onChangeText={setPassphrase}
              placeholder="Passphrase (optional)"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.passInput}
            />
          </View>
        )}

        <Pressable
          onPress={createWithPasskey}
          disabled={busy}
          style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && { opacity: 0.85 }]}
        >
          <Ionicons name="finger-print" size={20} color={colors.bg} />
          <Text style={styles.primaryText}>{busy ? "Creating…" : "Create with passkey"}</Text>
        </Pressable>
        <Pressable onPress={() => setShowImport(true)} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>I already have a wallet</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(6), justifyContent: "space-between" },
  hero: { alignItems: "center", gap: spacing(3) },
  title: { color: colors.primary, fontSize: 48, fontWeight: "900", marginTop: spacing(3), letterSpacing: 2 },
  kicker: { color: colors.accent, fontSize: font.small, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  tagline: { color: colors.textMuted, fontSize: font.body, textAlign: "center", lineHeight: 22, paddingHorizontal: spacing(4), marginTop: spacing(1) },
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
  advancedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  advancedToggle: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(1) },
  advancedToggleText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  advancedBox: { gap: spacing(3) },
  advancedHint: { color: colors.textFaint, fontSize: font.small, lineHeight: 18 },
  passInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    color: colors.text,
    fontSize: font.body,
  },
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
