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

export function ImportWallet({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const { importWallet } = useWallet();
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const words = phrase.trim().split(/\s+/).filter(Boolean);
  const validCount = words.length === 12 || words.length === 24;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await importWallet(phrase);
      onDone();
    } catch (e) {
      setError((e as Error).message);
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

      <Text style={styles.sub}>
        Enter your 12- or 24-word recovery phrase, with a space between each word.
      </Text>

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
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ flex: 1 }} />

      <Pressable
        disabled={!validCount || busy}
        onPress={submit}
        style={[styles.primaryBtn, (!validCount || busy) && styles.primaryDisabled]}
      >
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Import</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(5) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.body, lineHeight: 22, marginTop: spacing(6) },
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
    marginTop: spacing(4),
  },
  count: { color: colors.textFaint, fontSize: font.small, marginTop: spacing(2), textAlign: "right" },
  error: { color: colors.negative, fontSize: font.small, marginTop: spacing(2) },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", minHeight: 52, justifyContent: "center" },
  primaryDisabled: { backgroundColor: colors.card },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
});
