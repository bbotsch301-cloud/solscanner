import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useWallet } from "../wallet/WalletContext";
import { enrichActivity, fetchActivity, type HistoryItem } from "../activity";
import { evmHistoryEnabled } from "../evm/history";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState } from "../components/EmptyState";
import { ActivityRow } from "../components/ActivityRow";
import { colors, spacing } from "../theme";
import type { RootNav } from "../navigation";

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
      // Second stage: work out what each transaction actually did. Cheap after the first visit —
      // parsed results are cached permanently, since a confirmed transaction never changes.
      const enriched = await enrichActivity(activeChain, activeAddress, result);
      setTxs(enriched);
      actCache.set(key, enriched);
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
        renderItem={({ item }) => (
          <ActivityRow item={item} onPress={() => nav.navigate("TransactionDetail", { item })} />
        )}
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
  emptyWrap: { flexGrow: 1, justifyContent: "center", paddingBottom: spacing(16) },
});
