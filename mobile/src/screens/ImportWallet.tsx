import { useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { Crown } from "../components/Crown";
import { keypairFromMnemonic, validateMnemonic } from "../wallet/mnemonic";
import { discoverAccounts } from "../wallet/discovery";
import { humanizeError } from "../solana/errors";
import { colors, font, radius, spacing } from "../theme";

export function ImportWallet({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const { importWallet } = useWallet();
  const [phrase, setPhrase] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const words = phrase.trim().split(/\s+/).filter(Boolean);
  const validCount = words.length === 12 || words.length === 24;

  // Live, client-only preview of the Solana address this phrase + passphrase
  // derives to. There is no "wrong passphrase" error, so seeing the address is
  // the only way to confirm the 25th word was typed correctly before saving.
  const previewAddress = useMemo(() => {
    if (!validCount || !validateMnemonic(phrase)) return null;
    try {
      return keypairFromMnemonic(phrase, passphrase).publicKey.toBase58();
    } catch {
      return null;
    }
  }, [phrase, passphrase, validCount]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // Scan derivation indices for on-chain activity so existing accounts (e.g. your
      // Phantom accounts) come in automatically. Best-effort — falls back to account 0.
      setScanMsg("Looking for your accounts…");
      let indices: number[] = [0];
      try {
        indices = await discoverAccounts(phrase, passphrase, {
          onProgress: (p) => setScanMsg(`Scanning… checked ${p.scanned}, found ${p.found + 1}`),
        });
      } catch {
        indices = [0];
      }
      setScanMsg(indices.length > 1 ? `Found ${indices.length} accounts — importing…` : "Importing…");
      await importWallet(phrase, passphrase, indices);
      onDone();
    } catch (e) {
      setError(humanizeError(e, { action: "load" }));
      setScanMsg(null);
      setBusy(false);
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
        <Text style={styles.title}>Import wallet</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing(4) }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.iconWrap}>
            <Ionicons name="download" size={28} color={colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Import a wallet</Text>
          <Text style={styles.heroSub}>
            Restore an existing wallet from its recovery phrase. We&apos;ll scan for your accounts
            automatically.
          </Text>
        </View>

        <View style={styles.labelRow}>
          <Text style={styles.label}>Recovery phrase</Text>
          <HelpTip topic="seedPhrase" size={18} />
        </View>
        <Text style={styles.labelHint}>12 or 24 words, a space between each.</Text>

        <TextInput
          value={phrase}
          onChangeText={setPhrase}
          placeholder="orbit ivory patch …"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={styles.input}
        />
        <Text style={styles.count}>{words.length} words</Text>

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
            <Text style={styles.advancedToggleText}>Advanced · passphrase (25th word)</Text>
          </Pressable>
          <HelpTip topic="passphrase" />
        </View>

        {showAdvanced && (
          <View style={styles.advancedBox}>
            <Text style={styles.advancedHint}>
              Only if you set a passphrase when you created this wallet. It is
              case-sensitive and must match exactly. Leave blank if you never used one.
            </Text>
            <TextInput
              value={passphrase}
              onChangeText={setPassphrase}
              placeholder="Passphrase"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={styles.passInput}
            />
          </View>
        )}

        {previewAddress && (
          <View style={styles.previewBox}>
            <Text style={styles.previewLabel}>This phrase unlocks the wallet</Text>
            <Text style={styles.previewAddr} numberOfLines={1} ellipsizeMode="middle">
              {previewAddress}
            </Text>
            <Text style={styles.previewHint}>
              Confirm this is your address before importing. A wrong or mistyped
              passphrase silently loads a different, empty wallet.
            </Text>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <Pressable
        disabled={!validCount || busy}
        onPress={submit}
        style={[styles.primaryBtn, (!validCount || busy) && styles.primaryDisabled]}
      >
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Import</Text>}
      </Pressable>

      {/* Full-screen loading cover while we scan the chain + save the wallet — the import can take
          several seconds, so make it unmistakably "working" instead of a form that looks idle. */}
      {busy && (
        <View style={styles.overlay}>
          <Crown size={92} />
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing(6) }} />
          <Text style={styles.overlayTitle}>Importing your wallet</Text>
          <Text style={styles.overlayMsg}>{scanMsg ?? "Working…"}</Text>
          <Text style={styles.overlayHint}>
            Scanning the blockchain for your accounts. This can take a few seconds — keep the app open.
          </Text>
        </View>
      )}
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
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginTop: spacing(8) },
  label: { color: colors.text, fontSize: font.body, fontWeight: "800" },
  labelHint: { color: colors.textFaint, fontSize: font.small, marginTop: spacing(1) },
  advancedRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    color: colors.text,
    fontSize: font.h3,
    minHeight: 120,
    textAlignVertical: "top",
    marginTop: spacing(3),
  },
  count: { color: colors.textFaint, fontSize: font.small, marginTop: spacing(2), textAlign: "right" },
  advancedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    marginTop: spacing(4),
    paddingVertical: spacing(2),
  },
  advancedToggleText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  advancedBox: { marginTop: spacing(1) },
  advancedHint: { color: colors.textFaint, fontSize: font.small, lineHeight: 18 },
  passInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    color: colors.text,
    fontSize: font.h3,
    marginTop: spacing(3),
  },
  previewBox: {
    marginTop: spacing(4),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
  },
  previewLabel: { color: colors.textFaint, fontSize: font.small, fontWeight: "700" },
  previewAddr: { color: colors.primary, fontSize: font.body, fontWeight: "700", marginTop: spacing(1) },
  previewHint: { color: colors.textMuted, fontSize: font.small, lineHeight: 18, marginTop: spacing(2) },
  error: { color: colors.negative, fontSize: font.small, marginTop: spacing(3) },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(8),
  },
  overlayTitle: { color: colors.text, fontSize: font.h2, fontWeight: "900", marginTop: spacing(5) },
  overlayMsg: { color: colors.primary, fontSize: font.body, fontWeight: "700", marginTop: spacing(2), textAlign: "center" },
  overlayHint: { color: colors.textMuted, fontSize: font.small, lineHeight: 20, marginTop: spacing(3), textAlign: "center" },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", minHeight: 52, justifyContent: "center" },
  primaryDisabled: { backgroundColor: colors.card },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
});
