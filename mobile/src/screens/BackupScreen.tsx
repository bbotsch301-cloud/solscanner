import * as LocalAuthentication from "expo-local-authentication";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getMnemonic, getPassphrase } from "../wallet/keystore";
import { HelpTip } from "../components/HelpTip";
import { useSecretScreenGuard } from "../security/secretScreen";
import { colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function BackupScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  useSecretScreenGuard();
  const [words, setWords] = useState<string[] | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [hasPassphrase, setHasPassphrase] = useState(false);

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
      setHasPassphrase(!!(await getPassphrase()));
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
        <View style={styles.titleRow}>
          <Text style={styles.title}>Recovery phrase</Text>
          <HelpTip topic="seedPhrase" size={22} />
        </View>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6) }} showsVerticalScrollIndicator={false}>
        <View style={styles.warning}>
          <Ionicons name="warning" size={18} color={colors.negative} />
          <Text style={styles.warningText}>
            Write these words on paper, in order, and store them somewhere safe and private.
            Never take a photo or screenshot, and never type them into a website or message.
            {"\n\n"}This phrase is the ONLY way to recover your wallet. If you lose it, your
            funds are gone forever — no one, not even us, can restore them. We never have a
            copy and cannot help you recover it.
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

            {hasPassphrase && (
              <View style={styles.passNote}>
                <Ionicons name="key" size={16} color={colors.negative} />
                <Text style={styles.passNoteText}>
                  This wallet also has a passphrase (25th word). These words are NOT
                  enough on their own — restoring needs your passphrase too. It is not
                  shown here and we don’t keep a copy; store it with this phrase.
                </Text>
                <HelpTip topic="passphrase" size={20} />
              </View>
            )}

            <View style={styles.paperNote}>
              <Ionicons name="create-outline" size={16} color={colors.textMuted} />
              <Text style={styles.paperText}>
                Copying to the clipboard is disabled on purpose — write the words down by hand.
              </Text>
            </View>

            <Pressable onPress={() => nav.goBack()} style={styles.doneBtn}>
              <Text style={styles.doneText}>I’ve written it down</Text>
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
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
  passNote: {
    flexDirection: "row",
    gap: spacing(2),
    backgroundColor: colors.negative + "18",
    borderRadius: radius.md,
    padding: spacing(4),
    marginTop: spacing(4),
  },
  passNoteText: { flex: 1, color: colors.negative, fontSize: font.small, lineHeight: 19 },
  paperNote: { flexDirection: "row", gap: spacing(2), alignItems: "center", justifyContent: "center", paddingVertical: spacing(4), marginTop: spacing(3) },
  paperText: { color: colors.textMuted, fontSize: font.small, textAlign: "center" },
  doneBtn: { backgroundColor: colors.card, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", marginTop: spacing(2) },
  doneText: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
});
