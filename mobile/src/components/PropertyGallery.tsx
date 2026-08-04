/**
 * A 2-column gallery of the wallet's digital Property, artwork-first.
 *
 * Two of the sections are about what a thing IS, not what the user did with it. Property is what you
 * own — books, courses, software, music, art. Credentials are what you ARE — memberships, offices,
 * certifications. They're the same kind of token underneath, but a member's ordination and their
 * audiobook don't belong in one undifferentiated grid, so they don't share one here. (Credentials
 * move to Association once that surface exists; this is the simple start.)
 *
 * The other two sections are about intent: a collapsed "Archived" for things the user has put away,
 * and a collapsed "Hidden" for spam-looking junk. Paints instantly from the persisted snapshot.
 */
import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { LayoutAnimation, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { Artwork } from "./Artwork";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { Updating } from "./Updating";
import {
  cachedCollectibles,
  fetchCollectibles,
  isHiddenItem,
  onCollectiblesChange,
  isArchived,
  onPrefsChange,
  STANDING_VALUES,
  type Collectible,
  type CollectibleKind,
} from "../solana/collectibles";
import { parseDeed, propertyStatus } from "../property/deed";
import { isPublicRpc } from "../solana/connection";
import { haptics } from "../ui/haptics";
import { colors, font, radius, spacing, tracking, weight } from "../theme";
import type { RootNav } from "../navigation";

/** Access passes get a labelled badge so they read as what they unlock; plain art stays unbadged. */
const KIND_BADGE: Partial<Record<CollectibleKind, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }>> = {
  ticket: { label: "Ticket", icon: "ticket-outline", color: colors.primary },
  membership: { label: "Member", icon: "card-outline", color: colors.accent },
  credential: { label: "Credential", icon: "ribbon-outline", color: colors.primary },
  office: { label: "Office", icon: "shield-outline", color: colors.primary },
  community: { label: "Community", icon: "people-circle-outline", color: colors.accent },
  subscription: { label: "Subscription", icon: "refresh-outline", color: colors.warning },
  book: { label: "Book", icon: "book-outline", color: colors.positive },
  course: { label: "Course", icon: "school-outline", color: colors.positive },
  software: { label: "Software", icon: "code-slash-outline", color: colors.textMuted },
  music: { label: "Music", icon: "musical-notes-outline", color: colors.accent },
  ai: { label: "AI", icon: "sparkles-outline", color: colors.primary },
  portal: { label: "Portal", icon: "planet-outline", color: colors.accent },
  file: { label: "File", icon: "document-outline", color: colors.textMuted },
};

/** Show the search field only once the collection is big enough to need it. */
const SEARCH_THRESHOLD = 12;

/**
 * Filters for the property grid, in display order. Only ones the member actually holds are shown,
 * so a chip can never filter the grid to nothing — a filter that leads to an empty screen reads as
 * a bug, and the member learns nothing from tapping it.
 */
const FILTERS: { label: string; kinds: CollectibleKind[] }[] = [
  { label: "Books", kinds: ["book"] },
  { label: "Courses", kinds: ["course"] },
  { label: "Software", kinds: ["software"] },
  { label: "Music", kinds: ["music"] },
  { label: "AI", kinds: ["ai"] },
  { label: "Passes", kinds: ["ticket", "subscription", "portal"] },
  { label: "Art", kinds: ["art"] },
  { label: "Files", kinds: ["file"] },
];

/** What the member IS, rather than something they own — shown apart from their property.
 *  Derived from STANDING_VALUES rather than restated; this used to be a hand-synced copy. */
const CREDENTIAL_KINDS = new Set<CollectibleKind>(STANDING_VALUES);

function ItemCard({
  item,
  now,
  dimmed,
  onPress,
}: {
  item: Collectible;
  /** Captured once by the gallery — reading the clock during render isn't allowed, and a grid of
   *  cards each sampling its own `Date.now()` would be pointless anyway. */
  now: number;
  dimmed?: boolean;
  onPress: () => void;
}) {
  const badge = KIND_BADGE[item.kind];
  // A lapsed term is worth saying in the grid, because it changes what the item is good for. An
  // active one isn't — badging everything would just make the wall of artwork noisier.
  const status = propertyStatus(parseDeed(item), now);
  const term =
    status === "expired"
      ? { label: "Expired", color: colors.negative }
      : status === "expiring"
        ? { label: "Expires soon", color: colors.warning }
        : null;
  return (
    <PressableScale onPress={onPress} style={[styles.card, dimmed && { opacity: 0.55 }]}>
      <View>
        <Artwork uri={item.image} name={item.name} radius={0} style={styles.art} />
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.color + "E6" }]}>
            <Ionicons name={badge.icon} size={11} color={colors.bg} />
            <Text style={styles.badgeText}>{badge.label}</Text>
          </View>
        )}
        {term && (
          <View style={[styles.termBadge, { backgroundColor: term.color + "E6" }]}>
            <Text style={styles.badgeText}>{term.label}</Text>
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <View style={styles.subRow}>
          {item.collectionVerified && <Ionicons name="checkmark-circle" size={12} color={colors.primary} />}
          {/* "Collection" here is the Metaplex grouping this item belongs to — NOT the feature,
              which is called Property. Same word, different thing; leave it out of a rename. */}
          <Text style={styles.sub} numberOfLines={1}>
            {item.collection ? (item.collectionVerified ? "Verified" : "Collection") : " "}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

export function PropertyGallery({
  owner,
  refreshKey,
  title = "Property",
}: {
  owner: string;
  refreshKey: number;
  /** Section label above the grid. Pass null when the screen already has its own title. */
  title?: string | null;
}) {
  const nav = useNavigation<RootNav>();
  // Seeded synchronously from the persisted snapshot (parent remounts us per owner via `key`), so
  // the gallery paints instantly; the effect below only revalidates in the background.
  const [items, setItems] = useState<Collectible[]>(() => cachedCollectibles(owner) ?? []);
  const [loading, setLoading] = useState(() => !cachedCollectibles(owner));
  // Which (owner, refreshKey) we've finished fetching. Derived rather than a flag we flip on the
  // way in, so nothing is set synchronously inside the effect: anything not yet settled is, by
  // definition, still in flight. `loading` covers "nothing to show at all"; this covers the more
  // common case of a cached grid being refreshed underneath the user.
  const [settled, setSettled] = useState<string | null>(null);
  const revalidating = settled !== `${owner}:${refreshKey}`;
  const [showHidden, setShowHidden] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState("");
  /** null = All. Reset whenever the filter it points at stops existing (see `filters` below). */
  const [filter, setFilter] = useState<string | null>(null);
  // One clock reading for the whole grid, taken at mount. Terms are measured in days, so a value
  // that doesn't tick is exactly right here.
  const [now] = useState(() => Date.now());
  // Bumped when the hide/archive prefs change or an item is sent away, so sections re-split.
  const [localRev, setLocalRev] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fresh = await fetchCollectibles(owner);
      if (!cancelled) {
        setItems(fresh);
        setLoading(false);
        setSettled(`${owner}:${refreshKey}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, refreshKey]);

  // Hide/archive changes (from the detail screen) and local removals re-render us.
  useEffect(() => {
    const bump = () => setLocalRev((r) => r + 1);
    const offPrefs = onPrefsChange(bump);
    const offItems = onCollectiblesChange(() => {
      setItems(cachedCollectibles(owner) ?? []);
      bump();
    });
    return () => {
      offPrefs();
      offItems();
    };
  }, [owner]);

  // Every item lands in exactly one bucket. Junk wins over archived: something the spam heuristic
  // caught shouldn't dress itself up as a pass the user deliberately put away. Archived and hidden
  // are checked BEFORE the property/credential split, so putting a membership away still works.
  const { property, credentials, archived, hidden } = useMemo(() => {
    void localRev; // recompute after a hide/archive
    const q = query.trim().toLowerCase();
    const match = (c: Collectible) =>
      !q || c.name.toLowerCase().includes(q) || (c.collection ?? "").toLowerCase().includes(q);
    const shown = items.filter(match);
    const live = shown.filter((c) => !isHiddenItem(c) && !isArchived(c.mint));
    return {
      property: live.filter((c) => !CREDENTIAL_KINDS.has(c.kind)),
      credentials: live.filter((c) => CREDENTIAL_KINDS.has(c.kind)),
      archived: shown.filter((c) => !isHiddenItem(c) && isArchived(c.mint)),
      hidden: shown.filter((c) => isHiddenItem(c)),
    };
  }, [items, query, localRev]);

  // Only offer filters that would actually return something. Computed from the unfiltered set, so
  // choosing one doesn't make the others disappear underneath the member's finger.
  const filters = useMemo(
    () => FILTERS.filter((f) => property.some((c) => f.kinds.includes(c.kind))),
    [property]
  );
  const active = filters.some((f) => f.label === filter) ? filter : null;
  const shownProperty = useMemo(() => {
    const f = FILTERS.find((x) => x.label === active);
    return f ? property.filter((c) => f.kinds.includes(c.kind)) : property;
  }, [property, active]);

  const open = (mint: string) => nav.navigate("Collectible", { mint });

  if (loading && items.length === 0) {
    return (
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((k) => (
          <View key={k} style={styles.card}>
            <Skeleton width="100%" height={160} round={0} />
            <View style={styles.meta}>
              <Skeleton width="80%" height={12} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="library-outline"
        title="No property yet"
        subtitle={
          isPublicRpc()
            ? "Books, courses, music, passes and credentials you own will appear here. Set a dedicated RPC in Settings to load full artwork."
            : "Books, courses, music, passes and credentials you own will appear here."
        }
      />
    );
  }

  return (
    <View>
      <View style={[styles.headerRow, !title && { justifyContent: "flex-end" }]}>
        {title && <Text style={styles.header}>{title}</Text>}
        {/* Cached grid on screen with a refresh in flight — say so instead of letting the count
            look final while more items may still be on their way. */}
        {revalidating ? (
          <Updating />
        ) : (
          <Text style={styles.count}>
            {active ? shownProperty.length : property.length + credentials.length} item
            {(active ? shownProperty.length : property.length + credentials.length) === 1 ? "" : "s"}
          </Text>
        )}
      </View>

      {items.length > SEARCH_THRESHOLD && (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your property"
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

      {/* One category is no choice at all, so the row only appears once there's something to pick
          between. */}
      {filters.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          keyboardShouldPersistTaps="handled"
        >
          {[{ label: "All", kinds: [] as CollectibleKind[] }, ...filters].map((f) => {
            const on = f.label === "All" ? active === null : active === f.label;
            return (
              <PressableScale
                key={f.label}
                haptic={null}
                onPress={() => {
                  haptics.select();
                  setFilter(f.label === "All" ? null : f.label);
                }}
                style={[styles.filterChip, on && styles.filterChipOn]}
              >
                <Text style={[styles.filterText, on && styles.filterTextOn]}>{f.label}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.grid}>
        {shownProperty.map((c) => (
          <ItemCard key={c.mint} item={c} now={now} onPress={() => open(c.mint)} />
        ))}
      </View>
      {shownProperty.length === 0 && (
        <Text style={styles.note}>
          {active
            ? `No ${active.toLowerCase()} yet.`
            : query.trim()
            ? `Nothing matches “${query.trim()}”.`
            : credentials.length > 0
              ? "No property yet — your credentials are below."
              : archived.length > 0
                ? "Everything here is archived — open Archived below."
                : "Everything here is hidden — check the Hidden section below."}
        </Text>
      )}

      {/* Not collapsed like Archived and Hidden: a member's standing is something they should see,
          not something to go looking for. */}
      {credentials.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Credentials</Text>
          <View style={styles.grid}>
            {credentials.map((c) => (
              <ItemCard key={c.mint} item={c} now={now} onPress={() => open(c.mint)} />
            ))}
          </View>
        </>
      )}

      {archived.length > 0 && (
        <>
          <PressableScale
            haptic={null}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              haptics.tap();
              setShowArchived((v) => !v);
            }}
            style={styles.hiddenToggle}
          >
            <Ionicons name={showArchived ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
            <Text style={styles.archivedText}>Archived ({archived.length})</Text>
          </PressableScale>
          {showArchived && (
            <View style={styles.grid}>
              {archived.map((c) => (
                <ItemCard key={c.mint} item={c} now={now} dimmed onPress={() => open(c.mint)} />
              ))}
            </View>
          )}
        </>
      )}

      {hidden.length > 0 && (
        <>
          <PressableScale
            haptic={null}
            onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              haptics.tap();
              setShowHidden((v) => !v);
            }}
            style={styles.hiddenToggle}
          >
            <Ionicons name={showHidden ? "chevron-up" : "chevron-down"} size={16} color={colors.textFaint} />
            <Text style={styles.hiddenText}>Hidden ({hidden.length})</Text>
          </PressableScale>
          {showHidden && (
            <View style={styles.grid}>
              {hidden.map((c) => (
                <ItemCard key={c.mint} item={c} now={now} dimmed onPress={() => open(c.mint)} />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(3) },
  header: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: weight.bold,
    textTransform: "uppercase",
    letterSpacing: tracking.wide,
  },
  count: { color: colors.textFaint, fontSize: font.small, fontWeight: weight.semibold },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    marginBottom: spacing(3),
  },
  searchInput: { flex: 1, color: colors.text, fontSize: font.body, paddingVertical: spacing(3) },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3) },
  // Fixed two-column width (no flexGrow) so a lone item on the last row stays card-sized
  // instead of stretching across the screen.
  card: {
    width: "48%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  art: { width: "100%", aspectRatio: 1 },
  termBadge: {
    position: "absolute",
    top: spacing(2),
    right: spacing(2),
    paddingHorizontal: spacing(2),
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badge: {
    position: "absolute",
    top: spacing(2),
    left: spacing(2),
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: spacing(2),
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { color: colors.bg, fontSize: font.tiny, fontWeight: weight.bold },
  meta: { paddingHorizontal: spacing(3), paddingTop: spacing(2.5), paddingBottom: spacing(3), gap: 2 },
  name: { color: colors.text, fontSize: font.small, fontWeight: weight.semibold },
  subRow: { flexDirection: "row", alignItems: "center", gap: spacing(1) },
  sub: { color: colors.textMuted, fontSize: font.tiny, fontWeight: weight.medium, flex: 1 },
  note: { color: colors.textFaint, fontSize: font.small, textAlign: "center", paddingVertical: spacing(4) },
  filterRow: { gap: spacing(2), paddingVertical: spacing(1), paddingRight: spacing(4) },
  filterChip: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  filterChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textMuted, fontSize: font.small, fontWeight: weight.medium },
  filterTextOn: { color: colors.bg, fontWeight: weight.bold },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: weight.bold,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
    marginTop: spacing(5),
    marginBottom: spacing(3),
  },
  hiddenToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), paddingVertical: spacing(3), marginTop: spacing(2) },
  hiddenText: { color: colors.textFaint, fontSize: font.small, fontWeight: weight.semibold },
  archivedText: { color: colors.textMuted, fontSize: font.small, fontWeight: weight.semibold },
});
