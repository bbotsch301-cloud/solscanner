import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "./TokenAvatar";
import { SkeletonRow } from "./Skeleton";
import { SWAP_TOKENS, type SwapToken } from "../solana/swap";
import { looksLikeMint, resolveMint, searchTokens } from "../solana/tokenSearch";
import { evmSwapTokens, resolveEvmToken } from "../evm/tokenList";
import { useFeaturedTokens } from "../swap/featuredTokens";
import { POPULAR_ANCHORS } from "../config/featuredTokens";
import { isEvmAddress } from "../wallet/evm";
import { assertNever, type ChainDef } from "../chains/registry";
import { amount as fmtAmount, colors, font, radius, shortAddress, spacing, usd as fmtUsd } from "../theme";

/** A token the wallet holds, with its balance, for the "Your tokens" section. */
export interface OwnedToken {
  token: SwapToken;
  balance: number;
  usd: number | null;
}

export function TokenSelectSheet({
  visible,
  onClose,
  onSelect,
  exclude,
  owned,
  chain,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (token: SwapToken) => void;
  /** The other side's mint — hidden from the lists so both sides can't match. */
  exclude?: string;
  owned: OwnedToken[];
  chain: ChainDef;
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SwapToken[]>([]);
  const [loading, setLoading] = useState(false);

  const ownedByMint = useMemo(
    () => new Map(owned.map((o) => [o.token.mint, o])),
    [owned]
  );

  const { tokens: featuredAll, loading: featuredLoading } = useFeaturedTokens(chain);

  const reset = () => {
    setQuery("");
    setResults([]);
    setLoading(false);
  };

  // Debounced live search; falls back to an on-chain lookup for a pasted address. All
  // state changes happen inside the timeout, so nothing runs synchronously here.
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const id = setTimeout(async () => {
      if (cancelled) return;
      if (!q) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      let found: SwapToken[];
      // Exhaustive so a new chain family can't silently inherit the EVM search path.
      if (chain.kind !== "solana" && chain.kind !== "evm") {
        assertNever(chain.kind, "chain kind in token search");
      }
      if (chain.kind === "solana") {
        found = await searchTokens(q);
        if (!found.length && looksLikeMint(q)) {
          const resolved = await resolveMint(q);
          if (resolved) found = [resolved];
        }
      } else {
        // EVM: filter the built-in and featured lists, then resolve a pasted contract on-chain.
        // Featured is included here too — a curated token the user searches for by name should
        // be findable, not only visible in its section.
        const ql = q.toLowerCase();
        const byMint = new Map<string, SwapToken>();
        for (const t of [...evmSwapTokens(chain.id), ...featuredAll]) {
          if (
            t.symbol.toLowerCase().includes(ql) ||
            (t.name ?? "").toLowerCase().includes(ql) ||
            t.mint.toLowerCase() === ql
          ) {
            byMint.set(t.mint.toLowerCase(), t);
          }
        }
        found = [...byMint.values()];
        if (!found.length && isEvmAddress(q)) {
          const resolved = await resolveEvmToken(chain, q);
          if (resolved) found = [resolved];
        }
      }
      if (!cancelled) {
        setResults(found);
        setLoading(false);
      }
    }, q ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, chain, featuredAll]);

  const pick = (t: SwapToken) => {
    onSelect(t);
    onClose();
  };

  const searching = query.trim().length > 0;

  // "Popular" is now just the anchors — the handful of majors people actually swap into. The
  // curated list lives in its own section below. `SWAP_TOKENS` itself is untouched: SwapScreen
  // uses `SWAP_TOKENS[0]` as the default "from" token, so its order matters elsewhere.
  const anchors = POPULAR_ANCHORS[chain.id];
  const builtIn = chain.kind === "solana" ? SWAP_TOKENS : evmSwapTokens(chain.id);
  const popularSource = anchors ? builtIn.filter((t) => anchors.includes(t.mint)) : builtIn;

  // Hide the other side of the pair, and anything already listed under "Your tokens" — and, for
  // the featured list, anything an anchor already covers, so nothing appears twice.
  const shown = (t: SwapToken) => t.mint !== exclude && !ownedByMint.has(t.mint);
  const popular = popularSource.filter(shown);
  const popularMints = new Set(popular.map((t) => t.mint));
  const featured = featuredAll.filter((t) => shown(t) && !popularMints.has(t.mint));

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      onShow={reset}
      onDismiss={reset}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Select a token</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.textMuted} />
          </Pressable>
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, symbol, or paste address"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          )}
        </View>

        {searching ? (
          <FlatList
            data={results}
            keyExtractor={(t) => t.mint}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6) }}
            renderItem={({ item }) => (
              <TokenRow item={item} owned={ownedByMint.get(item.mint)} onPress={() => pick(item)} />
            )}
            ListEmptyComponent={
              loading ? (
                <View style={styles.center}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : (
                <View style={styles.center}>
                  <Text style={styles.emptyText}>
                    No tokens found. Check the spelling or paste the full mint address.
                  </Text>
                </View>
              )
            }
          />
        ) : (
          <FlatList
            data={owned.filter((o) => o.token.mint !== exclude)}
            keyExtractor={(o) => o.token.mint}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6) }}
            ListHeaderComponent={owned.length ? <Text style={styles.sectionTitle}>Your tokens</Text> : null}
            renderItem={({ item }) => (
              <TokenRow item={item.token} owned={item} onPress={() => pick(item.token)} />
            )}
            ListFooterComponent={
              <>
                {popular.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>Popular</Text>
                    {popular.map((t) => (
                      <TokenRow key={t.mint} item={t} onPress={() => pick(t)} />
                    ))}
                  </>
                )}
                {/* Featured resolves from the chain, so on a first run there's a beat before it
                    lands. Skeletons rather than an empty gap — and no "Featured" heading over
                    nothing once we know a chain has none. */}
                {featuredLoading ? (
                  <>
                    <Text style={styles.sectionTitle}>Featured</Text>
                    {[0, 1, 2, 3].map((k) => (
                      <SkeletonRow key={`fsk${k}`} />
                    ))}
                  </>
                ) : featured.length > 0 ? (
                  <>
                    <Text style={styles.sectionTitle}>Featured</Text>
                    {featured.map((t) => (
                      <TokenRow key={t.mint} item={t} onPress={() => pick(t)} />
                    ))}
                  </>
                ) : null}
              </>
            }
          />
        )}
      </View>
    </Modal>
  );
}

function TokenRow({
  item,
  owned,
  onPress,
}: {
  item: SwapToken;
  owned?: OwnedToken;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <TokenAvatar symbol={item.symbol} color={colors.primary} size={40} logoURI={item.logoURI} />
      <View style={styles.mid}>
        <View style={styles.symbolRow}>
          <Text style={styles.symbol}>{item.symbol}</Text>
          {item.verified === true && (
            <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
          )}
          {item.verified === false && (
            <Ionicons name="alert-circle" size={14} color={colors.warning} />
          )}
        </View>
        <Text style={styles.sub} numberOfLines={1}>
          {item.name ?? shortAddress(item.mint, 4, 4)}
        </Text>
      </View>
      {owned && owned.balance > 0 && (
        <View style={styles.right}>
          <Text style={styles.balance}>{fmtAmount(owned.balance)}</Text>
          {owned.usd != null && owned.usd > 0 && (
            <Text style={styles.balanceUsd}>{fmtUsd(owned.usd)}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(3) },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
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
  searchInput: { flex: 1, color: colors.text, fontSize: font.body, paddingVertical: spacing(3.5) },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(3),
    marginBottom: spacing(2),
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  mid: { flex: 1, gap: 2 },
  symbolRow: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  symbol: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  right: { alignItems: "flex-end", gap: 2 },
  balance: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  balanceUsd: { color: colors.textMuted, fontSize: font.small },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: spacing(10), paddingHorizontal: spacing(6) },
  emptyText: { color: colors.textMuted, fontSize: font.small, textAlign: "center", lineHeight: 19 },
});
