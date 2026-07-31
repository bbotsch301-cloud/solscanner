/**
 * A small "(?)" affordance that opens a themed, plain-English explainer. Drop it
 * next to any risky field (recovery phrase, passphrase, self-custody) so users can
 * learn what they're doing without leaving the screen.
 *
 *   <HelpTip topic="passphrase" />
 *   <HelpTip title="…" body={["…"]} />   // or pass inline content
 */
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EDU, type HelpTopic } from "../content/education";
import { colors, font, onPrimary, radius, spacing } from "../theme";

type Props =
  | ({ topic: keyof typeof EDU } & Partial<HelpTopic> & { size?: number })
  | (HelpTopic & { topic?: undefined; size?: number });

function Checklist({ items, positive }: { items: string[]; positive: boolean }) {
  return (
    <View style={styles.list}>
      {items.map((t, i) => (
        <View key={i} style={styles.listRow}>
          <Ionicons
            name={positive ? "checkmark-circle" : "close-circle"}
            size={16}
            color={positive ? colors.positive : colors.negative}
            style={{ marginTop: 1 }}
          />
          <Text style={styles.listText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

export function HelpTip(props: Props) {
  const [open, setOpen] = useState(false);
  const size = props.size ?? 18;
  const content: HelpTopic = props.topic ? { ...EDU[props.topic], ...props } : (props as HelpTopic);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Learn more: ${content.title}`}
      >
        <Ionicons name="help-circle-outline" size={size} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.title}>{content.title}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {content.body.map((p, i) => (
                <Text key={i} style={styles.para}>
                  {p}
                </Text>
              ))}

              {content.dos && content.dos.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Do</Text>
                  <Checklist items={content.dos} positive />
                </>
              )}

              {content.donts && content.donts.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Never</Text>
                  <Checklist items={content.donts} positive={false} />
                </>
              )}

              {content.danger && (
                <View style={styles.danger}>
                  <Ionicons name="warning" size={16} color={colors.negative} />
                  <Text style={styles.dangerText}>{content.danger}</Text>
                </View>
              )}
            </ScrollView>

            <Pressable onPress={() => setOpen(false)} style={styles.gotIt}>
              <Text style={styles.gotItText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#000000CC",
    justifyContent: "center",
    paddingHorizontal: spacing(5),
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing(5),
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(3) },
  title: { flex: 1, color: colors.primary, fontSize: font.h2, fontWeight: "800", paddingRight: spacing(3) },
  para: { color: colors.text, fontSize: font.body, lineHeight: 22, marginBottom: spacing(3) },
  sectionLabel: {
    color: colors.textFaint,
    fontSize: font.small,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: spacing(1),
    marginBottom: spacing(2),
  },
  list: { gap: spacing(2), marginBottom: spacing(3) },
  listRow: { flexDirection: "row", gap: spacing(2), alignItems: "flex-start" },
  listText: { flex: 1, color: colors.textMuted, fontSize: font.small, lineHeight: 19 },
  danger: {
    flexDirection: "row",
    gap: spacing(2),
    backgroundColor: colors.negative + "18",
    borderRadius: radius.md,
    padding: spacing(4),
    marginTop: spacing(2),
  },
  dangerText: { flex: 1, color: colors.negative, fontSize: font.small, lineHeight: 19 },
  gotIt: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(3),
    borderRadius: radius.pill,
    alignItems: "center",
    marginTop: spacing(4),
  },
  gotItText: { color: onPrimary, fontSize: font.h3, fontWeight: "800" },
});
