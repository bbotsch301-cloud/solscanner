/**
 * The Vault — the reading room. Not a second list of what you own.
 *
 * That distinction is the whole reason this screen still exists alongside the Keys tab. Keys is the
 * register: what you hold, what its deed says, what it makes you. This is where you come to *use*
 * those things — and **Continue** is what makes it a room rather than an index, because it is the
 * one shelf that knows what you were doing rather than what you have.
 *
 * The Vault proper is server-delivered content the wallet never holds. This lists what can be
 * reached; `attemptGatedGrant` proves ownership at the moment the member reaches for it, reusing a
 * live grant so coming back costs nothing (see access/vault.ts and access/entitlement.ts). Until a
 * vault endpoint is configured, items open their public link — which is why nothing here promises
 * more than "opens".
 *
 * Sections collapse rather than navigating away, so finding something is one screen and one tap
 * rather than a drill-down and a back.
 */
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
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
import { marketUrl, openWebapp } from "../browser/openWebapp";
import { accessVerb } from "../access/resolve";
import { inProgress, type Position } from "../vault/position";
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

/** "1h 04m in" — where a member actually is, rather than a percentage they have to interpret. */
function elapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m in` : `${m}m in`;
}

function ItemRow({
  item,
  position,
  onPress,
}: {
  item: Collectible;
  /** Set only on the Continue shelf, where how far in you are is the point of the row. */
  position?: Position;
  onPress: () => void;
}) {
  const pct =
    position?.duration && position.duration > 0
      ? Math.min(1, position.seconds / position.duration)
      : null;
  return (
    <PressableScale onPress={onPress} style={styles.itemRow}>
      <Artwork uri={item.image} name={item.name} radius={radius.sm} style={styles.thumb} />
      <View style={styles.itemText}>
        <Text style={styles.itemName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.itemVerb}>
          {position ? elapsed(position.seconds) : accessVerb(item.kind)}
        </Text>
        {/* Only drawn when the duration is known. A bar of unknown length is a guess dressed as a
            fact, and a member reading it as "nearly finished" would be reading our invention. */}
        {pct !== null && (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </PressableScale>
  );
}

export function VaultScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  // An empty shelf with no way forward is a dead end; null here simply removes the button.
  const market = marketUrl();
  const { solanaAddress, activeAddress } = useWallet();
  const owner = solanaAddress ?? activeAddress;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ExperienceId | null>(null);
  const [resume, setResume] = useState<{ item: Collectible; position: Position }[]>([]);

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

  // What's in progress, refreshed every time the tab comes back into focus — a member arrives here
  // straight from having watched something, and a stale "Continue" would be the one row they came
  // to check. Items no longer in the wallet are dropped rather than shown as unopenable.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const rows = await inProgress();
        if (cancelled) return;
        const byMint = new Map(all.map((c) => [c.mint, c]));
        setResume(
          rows
            .map((r) => ({ item: byMint.get(r.mint), position: r.position }))
            .filter((r): r is { item: Collectible; position: Position } => !!r.item)
        );
      })();
      return () => {
        cancelled = true;
      };
    }, [all])
  );

  const toggle = (id: ExperienceId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    haptics.tap();
    setOpen((cur) => (cur === id ? null : id));
  };

  return (
    <View style={styles.screen}>
      {/* A tab root now — no back affordance, because there is nothing to pop to. */}
      <ScreenHeader title="Vault" subtitle="What your keys open" />
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
            cta={
              market
                ? { label: "Browse the Marketplace", icon: "storefront-outline", onPress: () => openWebapp(nav, market) }
                : undefined
            }
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

            {/* Continue leads, and only when there is something to continue. It is the reason to
                come here at all: everything below is an index of what you own, this is the one row
                that knows what you were doing. Hidden while searching, because a search is a member
                looking for a specific thing and this would be answering a question they didn't ask. */}
            {!q && resume.length > 0 && (
              <Card style={styles.group}>
                <View style={styles.groupHead}>
                  <IconChip icon="play-circle-outline" size={36} />
                  <View style={styles.groupText}>
                    <Text style={styles.groupLabel}>Continue</Text>
                    <Text style={styles.groupCount}>Where you left off</Text>
                  </View>
                </View>
                {resume.slice(0, 4).map(({ item, position }) => (
                  <View key={item.mint}>
                    <View style={styles.divider} />
                    <ItemRow
                      item={item}
                      position={position}
                      onPress={() => nav.navigate("Collectible", { mint: item.mint })}
                    />
                  </View>
                ))}
              </Card>
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
  track: { height: 3, borderRadius: 2, backgroundColor: colors.cardBorder, marginTop: spacing(1) },
  fill: { height: 3, borderRadius: 2, backgroundColor: colors.primary },
  note: { color: colors.textMuted, fontSize: font.small, marginTop: spacing(2) },
  footer: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(4), lineHeight: 17 },
});
