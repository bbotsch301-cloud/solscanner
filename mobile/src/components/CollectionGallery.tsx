/**
 * The Collection view of the Wallet tab — a 2-column gallery of the wallet's non-fungible items
 * (access passes, tickets, books, art), artwork-first. Spam-looking items sit in a collapsed
 * "Hidden" section. Paints instantly from the persisted snapshot, refreshes behind.
 */
import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { LayoutAnimation, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { Artwork } from "./Artwork";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import {
  cachedCollectibles,
  fetchCollectibles,
  isHiddenItem,
  onCollectiblesChange,
  onHiddenChange,
  type Collectible,
  type CollectibleKind,
} from "../solana/collectibles";
import { isPublicRpc } from "../solana/connection";
import { haptics } from "../ui/haptics";
import { colors, font, radius, spacing, tracking, weight } from "../theme";
import type { RootNav } from "../navigation";

/** Access passes get a labelled badge so they read as what they unlock; plain art stays unbadged. */
const KIND_BADGE: Partial<Record<CollectibleKind, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }>> = {
  ticket: { label: "Ticket", icon: "ticket-outline", color: colors.primary },
  membership: { label: "Member", icon: "card-outline", color: colors.accent },
  book: { label: "Book", icon: "book-outline", color: colors.positive },
  portal: { label: "Portal", icon: "planet-outline", color: colors.accent },
  file: { label: "File", icon: "document-outline", color: colors.textMuted },
};

/** Show the search field only once a collection is big enough to need it. */
const SEARCH_THRESHOLD = 12;

function ItemCard({ item, dimmed, onPress }: { item: Collectible; dimmed?: boolean; onPress: () => void }) {
  const badge = KIND_BADGE[item.kind];
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
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <View style={styles.subRow}>
          {item.collectionVerified && <Ionicons name="checkmark-circle" size={12} color={colors.primary} />}
          <Text style={styles.sub} numberOfLines={1}>
            {item.collection ? (item.collectionVerified ? "Verified" : "Collection") : " "}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

export function CollectionGallery({ owner, refreshKey }: { owner: string; refreshKey: number }) {
  const nav = useNavigation<RootNav>();
  // Seeded synchronously from the persisted snapshot (parent remounts us per owner via `key`), so
  // the gallery paints instantly; the effect below only revalidates in the background.
  const [items, setItems] = useState<Collectible[]>(() => cachedCollectibles(owner) ?? []);
  const [loading, setLoading] = useState(() => !cachedCollectibles(owner));
  const [showHidden, setShowHidden] = useState(false);
  const [query, setQuery] = useState("");
  // Bumped when the hidden set changes or an item is sent away, so the sections re-split.
  const [localRev, setLocalRev] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fresh = await fetchCollectibles(owner);
      if (!cancelled) {
        setItems(fresh);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, refreshKey]);

  // Hide/unhide (from the detail screen) and local removals (an item sent away) re-render us.
  useEffect(() => {
    const bump = () => setLocalRev((r) => r + 1);
    const offHidden = onHiddenChange(bump);
    const offItems = onCollectiblesChange(() => {
      setItems(cachedCollectibles(owner) ?? []);
      bump();
    });
    return () => {
      offHidden();
      offItems();
    };
  }, [owner]);

  const { visible, hidden } = useMemo(() => {
    void localRev; // recompute after a hide/unhide
    const q = query.trim().toLowerCase();
    const match = (c: Collectible) =>
      !q || c.name.toLowerCase().includes(q) || (c.collection ?? "").toLowerCase().includes(q);
    const shown = items.filter(match);
    return {
      visible: shown.filter((c) => !isHiddenItem(c)),
      hidden: shown.filter((c) => isHiddenItem(c)),
    };
  }, [items, query, localRev]);

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
        icon="images-outline"
        title="Nothing in your collection yet"
        subtitle={
          isPublicRpc()
            ? "Access passes, tickets, and collectibles you own will appear here. Set a dedicated RPC in Settings to load full artwork."
            : "Access passes, tickets, and collectibles you own will appear here."
        }
      />
    );
  }

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Collection</Text>
        <Text style={styles.count}>
          {items.length} item{items.length === 1 ? "" : "s"}
        </Text>
      </View>

      {items.length > SEARCH_THRESHOLD && (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your collection"
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

      <View style={styles.grid}>
        {visible.map((c) => (
          <ItemCard key={c.mint} item={c} onPress={() => open(c.mint)} />
        ))}
      </View>
      {visible.length === 0 && (
        <Text style={styles.note}>
          {query.trim()
            ? `Nothing matches “${query.trim()}”.`
            : "Everything here is hidden — check the Hidden section below."}
        </Text>
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
                <ItemCard key={c.mint} item={c} dimmed onPress={() => open(c.mint)} />
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
  hiddenToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), paddingVertical: spacing(3), marginTop: spacing(2) },
  hiddenText: { color: colors.textFaint, fontSize: font.small, fontWeight: weight.semibold },
});
