import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../wallet/WalletContext";
import { fetchHistory, type TxSummary } from "../solana/history";
import { solscanTx } from "../solana/connection";
import { colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

function Row({ item }: { item: TxSummary }) {
  const color = item.failed ? colors.negative : colors.primary;
  return (
    <Pressable
      onPress={() => Linking.openURL(solscanTx(item.signature))}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.icon, { backgroundColor: color + "22" }]}>
        <Ionicons name={item.failed ? "close" : "swap-horizontal"} size={18} color={color} />
      </View>
      <View style={styles.mid}>
        <Text style={styles.title}>{item.failed ? "Failed transaction" : "Transaction"}</Text>
        <Text style={styles.sub}>
          {shortAddress(item.signature, 6, 6)} · {timeAgo(item.blockTime)}
        </Text>
      </View>
      <Ionicons name="open-outline" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

export function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { address } = useWallet();
  const [txs, setTxs] = useState<TxSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      setTxs(await fetchHistory(address, 25));
    } catch {
      /* keep previous list on transient errors */
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing(2) }]}>
        <Text style={styles.header}>Activity</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>
      <FlatList
        data={txs}
        keyExtractor={(t) => t.signature}
        renderItem={({ item }) => <Row item={item} />}
        contentContainerStyle={{ paddingHorizontal: spacing(4), paddingBottom: spacing(10), flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No transactions yet.</Text>
              <Text style={styles.emptySub}>
                Airdrop some test SOL or send a transaction to see it here.
              </Text>
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
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing(4), paddingBottom: spacing(2) },
  header: { color: colors.text, fontSize: font.h1, fontWeight: "900" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  icon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  mid: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: spacing(20), gap: spacing(2) },
  emptyText: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  emptySub: { color: colors.textMuted, fontSize: font.small, textAlign: "center", paddingHorizontal: spacing(10) },
});
