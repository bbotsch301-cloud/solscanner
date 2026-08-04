/**
 * What a member's keys say they ARE — the gateway membership, and how many standing keys back it.
 *
 * Shown in two places (the Keys tab and the Association screen), which is exactly why it is one
 * component rather than two renders of the same idea. Standing is the one thing in this app that
 * must never say two different things in two places: it is derived, not stored, and a member who
 * sees "Member since March" on one screen and nothing on another has no way to know which is true.
 * Both callers pass the same `deriveStanding` result, so they cannot disagree.
 */
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { HeroCard } from "./HeroCard";
import { Card } from "./Card";
import { standingCount, type Standing } from "../identity/membership";
import { colors, font, radius, semantic, spacing, weight } from "../theme";

const monthYear = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-US", { month: "long", year: "numeric" });

export function StandingHero({ standing }: { standing: Standing }) {
  if (!standing.gateway) {
    // Not an error state. Plenty of members will hold property before they hold membership, and an
    // empty card would read as something being broken.
    return (
      <Card style={styles.noMember}>
        <Text style={styles.noMemberTitle}>No Gateway Membership held</Text>
        <Text style={styles.noMemberBody}>
          Membership, offices, communities and credentials all appear here once the keys granting
          them are in this wallet. Nothing is stored in an account — your standing is whatever your
          keys say it is.
        </Text>
      </Card>
    );
  }

  const count = standingCount(standing);
  return (
    <HeroCard>
      <View style={styles.heroTop}>
        <Text style={styles.heroTitle}>{standing.gateway.item.name}</Text>
        {standing.gateway.item.collectionVerified && (
          <View style={styles.verified}>
            <Ionicons name="checkmark-circle" size={13} color={semantic.heroText} />
            <Text style={styles.verifiedText}>Verified</Text>
          </View>
        )}
      </View>
      <Text style={styles.heroSub}>
        {standing.gateway.issuedAt != null
          ? `Member since ${monthYear(standing.gateway.issuedAt)}`
          : "Membership held"}
      </Text>
      <Text style={styles.heroCount}>
        {count} standing key{count === 1 ? "" : "s"}
      </Text>
    </HeroCard>
  );
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(2) },
  heroTitle: { color: semantic.heroText, fontSize: font.h2, fontWeight: weight.black, flexShrink: 1 },
  verified: { flexDirection: "row", alignItems: "center", gap: 4 },
  verifiedText: { color: semantic.heroText, fontSize: font.tiny, fontWeight: weight.bold },
  heroSub: { color: semantic.heroTextDim, fontSize: font.small, fontWeight: weight.medium },
  heroCount: { color: semantic.heroTextDim, fontSize: font.tiny },
  noMember: { borderRadius: radius.md, gap: spacing(2) },
  noMemberTitle: { color: colors.text, fontSize: font.h3, fontWeight: weight.semibold },
  noMemberBody: { color: colors.textMuted, fontSize: font.small, lineHeight: 20 },
});
