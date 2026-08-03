/**
 * Vault — everything the member owns that opens, grouped by what it is for.
 *
 * The Vault proper is server-delivered encrypted content that the wallet never holds. This is the
 * shelf rather than the safe: it lists what can be reached, and `attemptGatedUrl` proves ownership
 * at the moment the member reaches for it (see access/vault.ts). Until a vault endpoint is
 * configured, items open their public link — which is why nothing here promises more than "opens".
 *
 * Sections collapse rather than navigating away, so finding something is one screen and one tap
 * rather than a drill-down and a back.
 */
import { useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { LayoutAnimation, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Artwork } from "../components/Artwork";
import { Card } from "../components/Card";
import { EmptyState } from "../components/EmptyState";
import { IconChip } from "../components/IconChip";
import { PressableScale } from "../components/PressableScale";
import { ScreenHeader } from "../components/ScreenHeader";
import { vaultCount, vaultExperiences, type ExperienceId } from "../vault/experiences";
import { cachedCollectibles, type Collectible } from "../solana/collectibles";
import { accessVerb } from "../access/resolve";
import { useWallet } from "../wallet/WalletContext";
import { haptics } from "../ui/haptics";
import { colors, font, radius, spacing, tracking, weight } from "../theme";
import type { RootNav } from "../navigation";

/** Below this there's nothing to search through, and the field is just clutter. */
const SEARCH_THRESHOLD = 8;

/** How each experience presents. Lives here, not in the data module, so the grouping stays pure. */
const LOOK: Record<ExperienceId, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  library: { label: "Library", icon: "book-outline" },
  learning: { label: "Learning", icon: "school-outline" },
  media: { label: "Media", icon: "play-circle-outline" },
  documents: { label: "Documents", icon: "document-text-outline" },
  software: { label: "Software", icon: "code-slash-outline" },
  ai: { label: "AI", icon: "sparkles-outline" },
  passes: { label: "Passes", icon: "ticket-outline" },
};

function ItemRow({ item, onPress }: { item: Collectible; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={styles.itemRow}>
      <Artwork uri={item.image} name={item.name} radius={radius.sm} style={styles.thumb} />
      <View style={styles.itemText}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemVerb}>{accessVerb(item.kind)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </PressableScale>
  );
}

export function VaultScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { solanaAddress, activeAddress } = useWallet();
  const owner = solanaAddress ?? activeAddress;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ExperienceId | null>(null);

  // Straight off the persisted snapshot — paints on the first frame, works offline.
  const all = useMemo(() => (owner ? (cachedCollectibles(owner) ?? []) : []), [owner]);
  const experiences = useMemo(() => vaultExperiences(all), [all]);
  const total = vaultCount(experiences);

  // Searching spans every experience, because a member looking for a title doesn't know or care
  // which shelf it's on. Matching sections auto-expand so results aren't hidden behind a chevron.
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      q
        ? experiences
            .map((e) => ({ ...e, items: e.items.filter((c) => c.name.toLowerCase().includes(q)) }))
            .filter((e) => e.items.length > 0)
        : experiences,
    [experiences, q]
  );

  const toggle = (id: ExperienceId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    haptics.tap();
    setOpen((cur) => (cur === id ? null : id));
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Vault" onBack={() => nav.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {total === 0 ? (
          <EmptyState
            icon="lock-closed-outline"
            title="Nothing in your vault yet"
            subtitle="Books, courses, music, software and passes you own appear here once they carry content to open."
          />
        ) : (
          <>
            {total > SEARCH_THRESHOLD && (
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color={colors.textFaint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search your vault"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.searchInput}
                />
                {query.length > 0 && (
                  <PressableScale haptic={null} onPress={() => setQuery("")} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textFaint} />
                  </PressableScale>
                )}
              </View>
            )}

            {filtered.length === 0 ? (
              <Text style={styles.note}>Nothing matches “{query.trim()}”.</Text>
            ) : (
              filtered.map((e) => {
                // A search result is already a filter, so keep those open rather than making the
                // member expand each match to see what they just searched for.
                const expanded = q.length > 0 || open === e.id;
                return (
                  <Card key={e.id} style={styles.group}>
                    <PressableScale haptic={null} onPress={() => toggle(e.id)} style={styles.groupHead}>
                      <IconChip icon={LOOK[e.id].icon} size={36} />
                      <View style={styles.groupText}>
                        <Text style={styles.groupLabel}>{LOOK[e.id].label}</Text>
                        <Text style={styles.groupCount}>
                          {e.items.length} item{e.items.length === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={16}
                        color={colors.textFaint}
                      />
                    </PressableScale>
                    {expanded &&
                      e.items.map((c) => (
                        <View key={c.mint}>
                          <View style={styles.divider} />
                          <ItemRow item={c} onPress={() => nav.navigate("Collectible", { mint: c.mint })} />
                        </View>
                      ))}
                  </Card>
                );
              })
            )}

            <Text style={styles.footer}>
              {total} item{total === 1 ? "" : "s"} you can open. Ownership is proved when you open
              something — the wallet never stores the content itself.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3),
    height: 40,
    marginBottom: spacing(4),
  },
  searchInput: { flex: 1, color: colors.text, fontSize: font.body, padding: 0 },
  group: { marginBottom: spacing(3), borderRadius: radius.md, padding: 0 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: spacing(3), padding: spacing(4) },
  groupText: { flex: 1, gap: 2 },
  groupLabel: {
    color: colors.text,
    fontSize: font.body,
    fontWeight: weight.semibold,
    letterSpacing: tracking.normal,
  },
  groupCount: { color: colors.textMuted, fontSize: font.small },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginLeft: spacing(4) },
  itemRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), padding: spacing(4) },
  thumb: { width: 40, height: 40 },
  itemText: { flex: 1, gap: 2 },
  itemName: { color: colors.text, fontSize: font.body },
  itemVerb: { color: colors.textMuted, fontSize: font.small },
  note: { color: colors.textMuted, fontSize: font.small, marginTop: spacing(2) },
  footer: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(4), lineHeight: 17 },
});
