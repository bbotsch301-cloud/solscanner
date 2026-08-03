/**
 * The Property Deed, rendered as the agreement it is rather than a row of anonymous trait chips.
 *
 * Three blocks, in the order a holder actually asks the questions: what may I do with this, what
 * does it cost to resell, and who issued it when.
 *
 * The one rule that shapes the whole component: a right the deed never mentions is NOT shown as
 * denied. Unstated rights are omitted entirely, because rendering a cross next to "Commercial
 * rights" would have the app inventing a restriction the creator never wrote.
 */
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { RIGHT_LABEL, RIGHT_ORDER, type Deed } from "../property/deed";
import { colors, font, radius, spacing, tracking, weight } from "../theme";

/** Two decimals, trailing zeros dropped — so 0.11% stays 0.11% and 10% doesn't read as "10.00%". */
const pct = (bps: number): string => `${Number((bps / 100).toFixed(2))}%`;

const date = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function DeedPanel({ deed, owner }: { deed: Deed; owner?: string }) {
  // Only rights the deed actually states — see the note at the top of this file.
  const stated = RIGHT_ORDER.filter((r) => deed.rights[r] !== undefined);

  const economics: { label: string; value: string }[] = [];
  if (deed.creatorRoyaltyBps != null)
    economics.push({ label: "Creator royalty", value: pct(deed.creatorRoyaltyBps) });
  if (deed.treasuryAssessmentBps != null)
    economics.push({ label: "Treasury assessment", value: pct(deed.treasuryAssessmentBps) });
  if (deed.royaltyModel && deed.creatorRoyaltyBps == null)
    economics.push({ label: "Royalty model", value: deed.royaltyModel });

  const footer: { label: string; value: string }[] = [];
  if (owner) footer.push({ label: "Owner", value: owner });
  if (deed.creator) footer.push({ label: "Creator", value: deed.creator });
  if (deed.license) footer.push({ label: "License", value: deed.license });
  if (deed.issuedAt != null) footer.push({ label: "Issued", value: date(deed.issuedAt) });
  if (deed.expiresAt === null) footer.push({ label: "Expires", value: "Never" });
  else if (deed.expiresAt != null) footer.push({ label: "Expires", value: date(deed.expiresAt) });
  if (deed.agreementVersion) footer.push({ label: "Agreement version", value: deed.agreementVersion });

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="ribbon-outline" size={16} color={colors.primary} />
        <Text style={styles.title}>Property Deed</Text>
      </View>

      {stated.length > 0 && (
        <View style={styles.rights}>
          {stated.map((r) => {
            const granted = deed.rights[r] === true;
            return (
              <View key={r} style={styles.rightRow}>
                <Ionicons
                  name={granted ? "checkmark-circle" : "close-circle"}
                  size={16}
                  color={granted ? colors.positive : colors.negative}
                />
                <Text style={[styles.rightLabel, !granted && styles.rightDenied]}>{RIGHT_LABEL[r]}</Text>
              </View>
            );
          })}
        </View>
      )}

      {economics.length > 0 && (
        <View style={styles.block}>
          {economics.map((e) => (
            <Row key={e.label} label={e.label} value={e.value} />
          ))}
          {deed.royaltyOutOfRange && (
            // Stated, but outside the platform's 0-25% limit. Show the number and say so rather
            // than clamping it silently — a deed that breaks the rules is worth knowing about.
            <Text style={styles.flag}>
              This royalty is above the 25% platform limit. Shown as the deed states it.
            </Text>
          )}
        </View>
      )}

      {footer.length > 0 && (
        <View style={styles.block}>
          {footer.map((f) => (
            <Row key={f.label} label={f.label} value={f.value} />
          ))}
        </View>
      )}

      <Text style={styles.provenance}>Read from this asset&apos;s on-chain metadata.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing(4), borderRadius: radius.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  title: {
    color: colors.primary,
    fontSize: font.tiny,
    fontWeight: weight.bold,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
  },
  rights: { marginTop: spacing(3), gap: spacing(2) },
  rightRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  rightLabel: { color: colors.text, fontSize: font.body },
  rightDenied: { color: colors.textMuted },
  block: {
    marginTop: spacing(3),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing(2),
  },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing(4) },
  rowLabel: { color: colors.textMuted, fontSize: font.small },
  rowValue: { color: colors.text, fontSize: font.small, fontWeight: weight.medium, flexShrink: 1, textAlign: "right" },
  flag: { color: colors.warning, fontSize: font.tiny, marginTop: spacing(1) },
  provenance: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(3) },
});
