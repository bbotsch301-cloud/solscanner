/**
 * "These terms changed" — the visible half of §18's safeguard.
 *
 * The issuer keeps the ability to rewrite a deed (the publish path authorises on that same
 * authority), so the system does not claim a deed is frozen. What it claims is that an amendment
 * cannot happen quietly. This is that claim, rendered.
 *
 * Two things this must not do. It must not imply the old terms still apply — the chain's current
 * terms are what is true, and the deed panel below shows them. And it must not read as an accusation:
 * most amendments are a creator shipping an update, which is the whole reason "Updates included" is
 * a right worth having. It states what moved and lets the member decide what that means.
 */
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { Button } from "./Button";
import type { DeedDelta } from "../property/deedDiff";
import { colors, font, leading, radius, spacing, tracking, weight } from "../theme";

export function DeedChangeBanner({ delta, onAcknowledge }: { delta: DeedDelta; onAcknowledge: () => void }) {
  const version =
    delta.fromVersion && delta.toVersion && delta.fromVersion !== delta.toVersion
      ? `Agreement version ${delta.fromVersion} → ${delta.toVersion}`
      : null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="alert-circle" size={16} color={colors.warning} />
        <Text style={styles.title}>These terms changed</Text>
      </View>

      <Text style={styles.intro}>
        The issuer amended this deed since you last read it. What follows is now what the chain says,
        and it is what applies — but here is what moved.
      </Text>

      <View style={styles.changes}>
        {delta.changes.map((c) => (
          <View key={c.label} style={styles.change}>
            <Text style={styles.changeLabel}>{c.label}</Text>
            <Text style={styles.changeValue}>
              <Text style={styles.from}>{c.from}</Text>
              {"  →  "}
              <Text style={styles.to}>{c.to}</Text>
            </Text>
          </View>
        ))}
      </View>

      {version && <Text style={styles.version}>{version}</Text>}
      {delta.versionUnchanged && (
        // The one part of this a member could never work out for themselves, and the reason the
        // wallet has to keep its own record rather than trusting the version string.
        <Text style={styles.flag}>
          The agreement version was not changed, so nothing in the deed itself marks this amendment.
        </Text>
      )}

      <Button label="Got it" variant="secondary" onPress={onAcknowledge} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing(4), borderRadius: radius.md, gap: spacing(3) },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  title: {
    color: colors.text,
    fontSize: font.tiny,
    fontWeight: weight.bold,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
  },
  intro: { color: colors.textMuted, fontSize: font.small, lineHeight: font.small * leading.relaxed },
  changes: { gap: spacing(2) },
  change: { gap: spacing(1) },
  changeLabel: { color: colors.textMuted, fontSize: font.tiny },
  changeValue: { fontSize: font.body },
  from: { color: colors.textFaint, textDecorationLine: "line-through" },
  to: { color: colors.text, fontWeight: weight.semibold },
  version: { color: colors.textMuted, fontSize: font.tiny },
  flag: { color: colors.textFaint, fontSize: font.tiny, lineHeight: font.tiny * leading.relaxed },
});
