import * as Clipboard from "expo-clipboard";
import * as LocalAuthentication from "expo-local-authentication";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getMnemonic } from "../wallet/keystore";
import { colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function BackupScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const [words, setWords] = useState<string[] | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [copied, setCopied] = useState(false);

  const reveal = useCallback(async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && enrolled) {
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: "Reveal recovery phrase",
        });
        if (!res.success) return;
      }
      const mnemonic = await getMnemonic();
      if (!mnemonic) {
        setLegacy(true);
        return;
      }
      setWords(mnemonic.split(/\s+/));
    } catch {
      /* leave hidden on failure */
    }
  }, []);

  useEffect(() => {
    reveal();
  }, [reveal]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Recovery phrase</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6) }} showsVerticalScrollIndicator={false}>
        <View style={styles.warning}>
          <Ionicons name="warning" size={18} color={colors.negative} />
          <Text style={styles.warningText}>
            Anyone with these 12 words controls this wallet. Never share them, and
            never type them into a website. Write them down and keep them offline.
          </Text>
        </View>

        {legacy ? (
          <View style={styles.legacy}>
            <Text style={styles.legacyText}>
              This wallet was created before recovery phrases were added, so it has
              no phrase. To get a backup-enabled wallet, reset in Settings (devnet
              only — no real funds) and create a new one.
            </Text>
          </View>
        ) : !words ? (
          <Pressable onPress={reveal} style={styles.revealBtn}>
            <Ionicons name="finger-print" size={20} color={colors.bg} />
            <Text style={styles.revealText}>Reveal phrase</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.grid}>
              {words.map((w, i) => (
                <View key={i} style={styles.wordChip}>
                  <Text style={styles.wordNum}>{i + 1}</Text>
                  <Text style={styles.word}>{w}</Text>
                </View>
              ))}
            </View>

            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(words.join(" "));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={styles.copyBtn}
            >
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={colors.primary} />
              <Text style={styles.copyText}>{copied ? "Copied" : "Copy to clipboard"}</Text>
            </Pressable>

            <Pressable onPress={() => nav.goBack()} style={styles.doneBtn}>
              <Text style={styles.doneText}>I've saved it</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  warning: {
    flexDirection: "row",
    gap: spacing(2),
    backgroundColor: colors.negative + "18",
    borderRadius: radius.md,
    padding: spacing(4),
    marginBottom: spacing(5),
  },
  warningText: { flex: 1, color: colors.negative, fontSize: font.small, lineHeight: 19 },
  legacy: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4) },
  legacyText: { color: colors.textMuted, fontSize: font.body, lineHeight: 21 },
  revealBtn: {
    flexDirection: "row",
    gap: spacing(2),
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  revealText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2) },
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
  copyBtn: { flexDirection: "row", gap: spacing(2), alignItems: "center", justifyContent: "center", paddingVertical: spacing(4), marginTop: spacing(4) },
  copyText: { color: colors.primary, fontSize: font.body, fontWeight: "700" },
  doneBtn: { backgroundColor: colors.card, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", marginTop: spacing(2) },
  doneText: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
});
