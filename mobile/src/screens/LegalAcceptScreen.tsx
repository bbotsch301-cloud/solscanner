import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Crown } from "../components/Crown";
import { LegalText } from "../components/LegalText";
import { LEGAL_DOCS, type LegalDocKey } from "../legal/content";
import { haptics } from "../ui/haptics";
import { colors, font, radius, spacing } from "../theme";

/**
 * First-run acceptance gate. Renders OUTSIDE the NavigationContainer (from App's Root), so the full
 * Privacy / Terms documents are shown in a local Modal rather than via navigation.
 */
export function LegalAcceptScreen({ onAccept }: { onAccept: () => void }) {
  const insets = useSafeAreaInsets();
  const [agreed, setAgreed] = useState(false);
  const [openDoc, setOpenDoc] = useState<LegalDocKey | null>(null);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(6), paddingBottom: insets.bottom + spacing(4) }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.crownWrap}>
          <Crown size={72} />
        </View>
        <Text style={styles.title}>Welcome to XGO</Text>
        <Text style={styles.sub}>Building the Kingdom Economy</Text>

        <View style={styles.card}>
          <Point icon="key" text="XGO is non-custodial — you alone hold your keys and funds. We can't access or recover them." />
          <Point icon="cloud-offline" text="No account and no tracking. Your recovery phrase never leaves your device." />
          <Point icon="warning" text="Crypto is risky and transactions are irreversible. You're responsible for your own decisions." />
        </View>

        <Text style={styles.readLine}>Please review:</Text>
        <View style={styles.linkRow}>
          <Pressable onPress={() => setOpenDoc("privacy")} style={styles.link}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
            <Text style={styles.linkText}>Privacy Policy</Text>
          </Pressable>
          <Pressable onPress={() => setOpenDoc("terms")} style={styles.link}>
            <Ionicons name="document-text-outline" size={16} color={colors.primary} />
            <Text style={styles.linkText}>Terms of Service</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={() => {
            haptics.select();
            setAgreed((v) => !v);
          }}
          style={styles.checkRow}
          hitSlop={8}
        >
          <Ionicons
            name={agreed ? "checkbox" : "square-outline"}
            size={24}
            color={agreed ? colors.primary : colors.textMuted}
          />
          <Text style={styles.checkText}>
            I understand XGO is non-custodial and I agree to the Terms of Service and Privacy Policy.
          </Text>
        </Pressable>

        <Pressable
          disabled={!agreed}
          onPress={() => {
            haptics.success();
            onAccept();
          }}
          style={[styles.btn, !agreed && styles.btnDisabled]}
        >
          <Text style={[styles.btnText, !agreed && styles.btnTextDisabled]}>Agree & Continue</Text>
        </Pressable>
      </View>

      <Modal visible={openDoc !== null} animationType="slide" onRequestClose={() => setOpenDoc(null)}>
        <View style={styles.screen}>
          <View style={[styles.modalBar, { paddingTop: insets.top + spacing(2) }]}>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {openDoc ? LEGAL_DOCS[openDoc].title : ""}
            </Text>
            <Pressable onPress={() => setOpenDoc(null)} hitSlop={12}>
              <Ionicons name="close" size={26} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: spacing(5), paddingBottom: insets.bottom + spacing(10) }}
            showsVerticalScrollIndicator={false}
          >
            {openDoc && <LegalText body={LEGAL_DOCS[openDoc].body} />}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Point({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.point}>
      <Ionicons name={icon} size={18} color={colors.primary} style={{ marginTop: 1 }} />
      <Text style={styles.pointText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: spacing(5), alignItems: "center", paddingBottom: spacing(4) },
  crownWrap: { marginBottom: spacing(3) },
  title: { color: colors.text, fontSize: font.h1, fontWeight: "900" },
  sub: { color: colors.accent, fontSize: font.small, fontWeight: "700", marginTop: 2, marginBottom: spacing(5) },
  card: {
    width: "100%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(3),
  },
  point: { flexDirection: "row", gap: spacing(3), alignItems: "flex-start" },
  pointText: { flex: 1, color: colors.textMuted, fontSize: font.body, lineHeight: 21 },
  readLine: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", marginTop: spacing(5), marginBottom: spacing(2) },
  linkRow: { flexDirection: "row", gap: spacing(3), flexWrap: "wrap", justifyContent: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(2), paddingHorizontal: spacing(3) },
  linkText: { color: colors.primary, fontSize: font.body, fontWeight: "700" },
  footer: { paddingHorizontal: spacing(5), gap: spacing(3), borderTopWidth: 1, borderTopColor: colors.cardBorder, paddingTop: spacing(4) },
  checkRow: { flexDirection: "row", gap: spacing(3), alignItems: "flex-start" },
  checkText: { flex: 1, color: colors.textMuted, fontSize: font.small, lineHeight: 19 },
  btn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center" },
  btnDisabled: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  btnText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  btnTextDisabled: { color: colors.textMuted },
  modalBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  modalTitle: { flex: 1, color: colors.text, fontSize: font.h3, fontWeight: "800", marginRight: spacing(3) },
});
