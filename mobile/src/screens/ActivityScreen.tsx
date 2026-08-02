import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { useWallet } from "../wallet/WalletContext";
import { enrichActivity, fetchActivity, type HistoryItem } from "../activity";
import { evmHistoryEnabled } from "../evm/history";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState } from "../components/EmptyState";
import { ActivityRow } from "../components/ActivityRow";
import { SkeletonRow } from "../components/Skeleton";
import { Updating } from "../components/Updating";
import { activitySnapshots } from "../cache/screens";
import { colors, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function ActivityScreen() {
  const nav = useNavigation<RootNav>();
  const { activeChain, activeAddress } = useWallet();
  // Seeded from DISK: re-opening Activity — even after a restart — shows the last-known list
  // immediately and refreshes behind it, rather than a blank screen or a "no transactions" claim.
  const seedKey = `${activeChain.id}:${activeAddress ?? ""}`;
  const seeded = activitySnapshots.get(seedKey);
  const [txs, setTxs] = useState<HistoryItem[]>(() => seeded ?? []);
  const [loading, setLoading] = useState(false);
  // "Haven't looked yet" vs "looked, found nothing" — only the second may show the empty state.
  const [loaded, setLoaded] = useState(seeded != null);

  const load = useCallback(async () => {
    if (!activeAddress) return;
    const key = `${activeChain.id}:${activeAddress}`;
    const cached = activitySnapshots.get(key);
    if (cached) {
      setTxs(cached); // show last-good immediately (also covers a chain/account switch)
      setLoaded(true);
    }
    setLoading(true);
    try {
      const result = await fetchActivity(activeChain, activeAddress, 25);
      setTxs(result);
      setLoaded(true);
      activitySnapshots.set(key, result);
      // Second stage: work out what each transaction actually did. Cheap after the first visit —
      // parsed results are cached permanently, since a confirmed transaction never changes.
      const enriched = await enrichActivity(activeChain, activeAddress, result);
      setTxs(enriched);
      activitySnapshots.set(key, enriched);
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
        // Cached rows on screen while a refresh runs: say so, quietly, rather than let the list
        // look final when it may be about to grow.
        ListHeaderComponent={
          txs.length > 0 && loading ? <Updating style={styles.updating} /> : null
        }
        ListEmptyComponent={
          // Nothing fetched yet: skeleton rows. Claiming "No transactions yet" before we've asked
          // is the same mistake as printing $0.00 for an unloaded balance.
          !loaded ? (
            <View style={{ paddingTop: spacing(2) }}>
              {[0, 1, 2, 3, 4].map((k) => (
                <SkeletonRow key={`sk${k}`} />
              ))}
            </View>
          ) : !loading ? (
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
  updating: { paddingBottom: spacing(2) },
});
