import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { activeMnemonic as getMnemonic } from "../wallet/vault";
import { HelpTip } from "../components/HelpTip";
import { useSecretScreenGuard } from "../security/secretScreen";
import { colors, font, radius, spacing } from "../theme";

/**
 * Mandatory backup step shown to new wallets before they can enter the app.
 * `onDone` is called only after the user confirms they've saved the phrase.
 */
export function BackupPrompt({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  useSecretScreenGuard();
  const [words, setWords] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    getMnemonic().then((m) => setWords(m ? m.split(/\s+/) : []));
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(4) }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing(4) }} showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Back up your wallet</Text>
          <HelpTip topic="seedPhrase" size={24} />
        </View>
        <Text style={styles.sub}>
          Your recovery phrase is the only way to recover your wallet. Write down every word in
          order and keep them offline. Anyone who has them controls your funds.
        </Text>

        <View style={styles.warning}>
          <Ionicons name="warning" size={18} color={colors.negative} />
          <Text style={styles.warningText}>
            Never share them, never type them into a website, and never save them as a photo,
            screenshot, or in the cloud. If you lose this phrase, your funds are gone forever —
            no one, not even us, can recover them.
          </Text>
        </View>

        {words && words.length > 0 ? (
          <>
            <View style={styles.grid}>
              {words.map((w, i) => (
                <View key={i} style={styles.wordChip}>
                  <Text style={styles.wordNum}>{i + 1}</Text>
                  <Text style={styles.word}>{w}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.paperText}>
              Copy is disabled on purpose — write the words down on paper by hand.
            </Text>
          </>
        ) : (
          <Text style={styles.sub}>Loading…</Text>
        )}

        <Pressable onPress={() => setConfirmed((c) => !c)} style={styles.ackRow}>
          <Ionicons
            name={confirmed ? "checkbox" : "square-outline"}
            size={22}
            color={confirmed ? colors.primary : colors.textMuted}
          />
          <Text style={styles.ackText}>I’ve written down my recovery phrase and stored it safely.</Text>
        </Pressable>
      </ScrollView>

      <Pressable
        onPress={onDone}
        disabled={!confirmed}
        style={[styles.primaryBtn, !confirmed && styles.primaryDisabled, { marginBottom: insets.bottom + spacing(2) }]}
      >
        <Text style={[styles.primaryText, !confirmed && { color: colors.textFaint }]}>Continue</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(5) },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: colors.text, fontSize: font.h1, fontWeight: "900" },
  sub: { color: colors.textMuted, fontSize: font.body, lineHeight: 22, marginTop: spacing(3) },
  warning: {
    flexDirection: "row",
    gap: spacing(2),
    backgroundColor: colors.negative + "18",
    borderRadius: radius.md,
    padding: spacing(3.5),
    marginTop: spacing(4),
  },
  warningText: { flex: 1, color: colors.negative, fontSize: font.small, lineHeight: 19 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2), marginTop: spacing(5) },
  wordChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    width: "48%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.sm,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(3),
  },
  wordNum: { color: colors.textFaint, fontSize: font.small, fontWeight: "700", width: 20 },
  word: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  paperText: { color: colors.textMuted, fontSize: font.small, textAlign: "center", marginTop: spacing(3) },
  ackRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(3), marginTop: spacing(2) },
  ackText: { flex: 1, color: colors.text, fontSize: font.small, fontWeight: "600" },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center" },
  primaryDisabled: { backgroundColor: colors.card },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
});
