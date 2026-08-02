/**
 * The Collection view of the Wallet tab — a 2-column gallery of the wallet's non-fungible items
 * (access passes, tickets, books, art), artwork-first. Spam-looking items sit in a collapsed
 * "Hidden" section. Paints instantly from the persisted snapshot, refreshes behind.
 */
import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { LayoutAnimation, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { Artwork } from "./Artwork";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import {
  cachedCollectibles,
  fetchCollectibles,
  isHiddenItem,
  type Collectible,
  type CollectibleKind,
} from "../solana/collectibles";
import { isPublicRpc } from "../solana/connection";
import { haptics } from "../ui/haptics";
import { colors, font, radius, spacing, weight } from "../theme";
import type { RootNav } from "../navigation";

const KIND_LABEL: Record<CollectibleKind, string> = {
  ticket: "Ticket",
  membership: "Membership",
  book: "Book",
  portal: "Portal",
  file: "File",
  art: "Collectible",
};

function ItemCard({ item, dimmed, onPress }: { item: Collectible; dimmed?: boolean; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={[styles.card, dimmed && { opacity: 0.55 }]}>
      <Artwork uri={item.image} name={item.name} radius={radius.md - 2} />
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        <View style={styles.subRow}>
          {item.collectionVerified && <Ionicons name="checkmark-circle" size={12} color={colors.primary} />}
          <Text style={styles.kind} numberOfLines={1}>{KIND_LABEL[item.kind]}</Text>
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
  const [rev, setRev] = useState(0); // bump after hide/unhide so the sections re-split

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

  // Returning from the detail screen (where items can be hidden/unhidden) re-splits the sections.
  useEffect(() => {
    const unsub = nav.addListener("focus", () => setRev((r) => r + 1));
    return unsub;
  }, [nav]);

  void rev;
  const visible = items.filter((c) => !isHiddenItem(c));
  const hidden = items.filter((c) => isHiddenItem(c));
  const open = (mint: string) => nav.navigate("Collectible", { mint });

  if (loading && items.length === 0) {
    return (
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((k) => (
          <View key={k} style={styles.card}>
            <Skeleton width="100%" height={150} round={radius.md - 2} />
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
      <View style={styles.grid}>
        {visible.map((c) => (
          <ItemCard key={c.mint} item={c} onPress={() => open(c.mint)} />
        ))}
      </View>
      {visible.length === 0 && (
        <Text style={styles.allHidden}>Everything here is hidden — check the Hidden section below.</Text>
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3) },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(2),
  },
  meta: { paddingHorizontal: spacing(1), paddingTop: spacing(2), paddingBottom: spacing(1), gap: 2 },
  name: { color: colors.text, fontSize: font.small, fontWeight: weight.semibold },
  subRow: { flexDirection: "row", alignItems: "center", gap: spacing(1) },
  kind: { color: colors.textMuted, fontSize: font.tiny, fontWeight: weight.medium },
  allHidden: { color: colors.textFaint, fontSize: font.small, textAlign: "center", paddingVertical: spacing(4) },
  hiddenToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), paddingVertical: spacing(3), marginTop: spacing(2) },
  hiddenText: { color: colors.textFaint, fontSize: font.small, fontWeight: weight.semibold },
});
