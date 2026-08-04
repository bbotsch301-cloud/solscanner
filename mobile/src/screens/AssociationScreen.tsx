/**
 * Association — the member's standing, and everything that governs it.
 *
 * Standing is derived entirely from the keys the wallet holds (see identity/membership.ts). There is
 * no account, no role stored anywhere, and nothing to ask a server for: hold the Office key, hold the
 * office. That's what "authority is determined by Keys, not usernames" means in practice.
 *
 * Two honest limits are surfaced here rather than hidden:
 *   • Someone holding no Gateway Membership sees that plainly, not an empty screen implying failure.
 *   • What this screen shows is a DISPLAY derivation. Any service acting on a member's authority has
 *     to re-check ownership on-chain at request time — see the note in identity/membership.ts.
 */
import { useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../components/Card";
import { IconChip } from "../components/IconChip";
import { ScreenHeader } from "../components/ScreenHeader";
import { StandingHero } from "../components/StandingHero";
import { deriveStanding, type StandingKey } from "../identity/membership";
import { cachedCollectibles } from "../solana/collectibles";
import { useWallet } from "../wallet/WalletContext";
import { colors, font, radius, shortAddress, spacing, tracking, weight } from "../theme";
import type { RootNav } from "../navigation";

const monthYear = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

function Row({
  icon,
  label,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress != null && { opacity: 0.6 }]}
    >
      <IconChip icon={icon} size={36} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />}
    </Pressable>
  );
}

function KeyList({ title, keys, onOpen }: { title: string; keys: StandingKey[]; onOpen: (m: string) => void }) {
  if (keys.length === 0) return null;
  return (
    <>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card style={styles.group}>
        {keys.map((k, i) => (
          <View key={k.item.mint}>
            {i > 0 && <View style={styles.divider} />}
            <Row
              icon="key-outline"
              label={k.item.name}
              detail={
                k.status === "expiring" && k.expiresAt != null
                  ? `Expires ${monthYear(k.expiresAt)}`
                  : k.issuedAt != null
                    ? `Held since ${monthYear(k.issuedAt)}`
                    : "Held"
              }
              onPress={() => onOpen(k.item.mint)}
            />
          </View>
        ))}
      </Card>
    </>
  );
}

export function AssociationScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { solanaAddress, activeAddress } = useWallet();
  const owner = solanaAddress ?? activeAddress;
  // Sampled once at mount — terms are measured in days, and reading the clock during render isn't
  // allowed by the compiler lint.
  const [now] = useState(() => Date.now());

  // Straight off the persisted snapshot, so this paints on the first frame and works offline.
  const standing = useMemo(
    () => deriveStanding(owner ? (cachedCollectibles(owner) ?? []) : [], now),
    [owner, now]
  );
  const open = (mint: string) => nav.navigate("Collectible", { mint });

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Association" onBack={() => nav.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}
        showsVerticalScrollIndicator={false}
      >
        <StandingHero standing={standing} />

        {/* Only the lapsed ones. Offices, credentials and communities are all on the Keys tab now,
            with their artwork and one tap to the deed — listing them here as names and dates was the
            same keys told twice, worse. Lapsed keys are not on that tab's live sections, and a term
            that has run out is exactly the thing a member needs to be able to find. */}
        <KeyList title="Lapsed" keys={standing.lapsed} onOpen={open} />

        <Text style={styles.sectionTitle}>Governing</Text>
        <Card style={styles.group}>
          <Row
            icon="document-text-outline"
            label="Agreements"
            detail="Versions, dates, and your signatures"
            onPress={() => nav.navigate("Agreements")}
          />
          <View style={styles.divider} />
          <Row
            icon="people-outline"
            label="Governance"
            detail="Voting weight and holding tier"
            onPress={() => nav.navigate("Govern")}
          />
          <View style={styles.divider} />
          <Row
            icon="business-outline"
            label="Treasury"
            detail="Holdings and inflows, verifiable on-chain"
            onPress={() => nav.navigate("Multisig")}
          />
          <View style={styles.divider} />
          <Row
            icon="settings-outline"
            label="Account settings"
            detail={owner ? `Wallet ${shortAddress(owner, 4, 4)}` : "Manage your identity and wallet"}
            onPress={() => nav.navigate("Settings")}
          />
        </Card>

        <Text style={styles.footer}>
          Your standing is read from the keys this wallet holds. Services that act on it check
          ownership on-chain at the time of the request, not this screen.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: weight.bold,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
    marginTop: spacing(6),
    marginBottom: spacing(3),
  },
  group: { borderRadius: radius.md, padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), padding: spacing(4) },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { color: colors.text, fontSize: font.body, fontWeight: weight.medium },
  rowDetail: { color: colors.textMuted, fontSize: font.small },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginLeft: spacing(4) + 36 + spacing(3) },
  footer: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(6), lineHeight: 17 },
});
