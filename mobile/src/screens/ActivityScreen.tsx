import { useNavigation } from "@react-navigation/native";
import { memo, useCallback, useEffect, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../wallet/WalletContext";
import { fetchActivity, type HistoryItem } from "../activity";
import { evmHistoryEnabled } from "../evm/history";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState } from "../components/EmptyState";
import { colors, font, radius, shortAddress, spacing, timeAgo } from "../theme";
import type { RootNav } from "../navigation";

function titleFor(item: HistoryItem): string {
  if (item.failed) return "Failed transaction";
  const verb = item.direction === "in" ? "Received" : item.direction === "out" ? "Sent" : null;
  if (verb) return item.valueLabel ? `${verb} ${item.valueLabel}` : verb;
  return "Transaction";
}

const Row = memo(function Row({ item }: { item: HistoryItem }) {
  const color = item.failed
    ? colors.negative
    : item.direction === "in"
      ? colors.positive
      : colors.primary;
  const icon = item.failed
    ? "close"
    : item.direction === "in"
      ? "arrow-down"
      : item.direction === "out"
        ? "arrow-up"
        : "swap-horizontal";
  return (
    <Pressable
      onPress={() => Linking.openURL(item.explorerUrl)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.icon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.mid}>
        <Text style={styles.title}>{titleFor(item)}</Text>
        <Text style={styles.sub}>
          {shortAddress(item.id, 6, 6)} · {timeAgo(item.time)}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={colors.textFaint} />
    </Pressable>
  );
});

// Last-good history per (chain, address), kept in memory so re-opening Activity shows the
// list instantly and refreshes behind it, instead of a blank list on every visit.
const actCache = new Map<string, HistoryItem[]>();

export function ActivityScreen() {
  const nav = useNavigation<RootNav>();
  const { activeChain, activeAddress } = useWallet();
  const [txs, setTxs] = useState<HistoryItem[]>(() => actCache.get(`${activeChain.id}:${activeAddress ?? ""}`) ?? []);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeAddress) return;
    const key = `${activeChain.id}:${activeAddress}`;
    const cached = actCache.get(key);
    if (cached) setTxs(cached); // show last-good immediately (also covers a chain/account switch)
    setLoading(true);
    try {
      const result = await fetchActivity(activeChain, activeAddress, 25);
      setTxs(result);
      actCache.set(key, result);
    } catch {
      /* keep previous list on transient errors */
    } finally {
      setLoading(false);
    }
  }, [activeChain, activeAddress]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Activity" size="large" onClose={() => nav.goBack()} />
      <FlatList
        data={txs}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <Row item={item} />}
        contentContainerStyle={{ paddingHorizontal: spacing(4), paddingBottom: spacing(10), flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                icon="receipt-outline"
                title="No transactions yet"
                subtitle={
                  activeChain.kind === "evm" && !evmHistoryEnabled
                    ? "Transaction history on this chain needs an Etherscan API key (set EXPO_PUBLIC_ETHERSCAN_KEY)."
                    : "Send or receive a transaction to see it here."
                }
              />
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  icon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  mid: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  emptyWrap: { flexGrow: 1, justifyContent: "center", paddingBottom: spacing(16) },
});
