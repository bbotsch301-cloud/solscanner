import { useNavigation } from "@react-navigation/native";
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { enrichActivity, fetchActivity, type HistoryItem } from "../activity";
import { BalanceCard } from "../components/BalanceCard";
import { ActionButton } from "../components/ActionButton";
import { ChainSwitcher } from "../components/ChainSwitcher";
import { WalletSwitcher } from "../components/WalletSwitcher";
import { TokenAvatar } from "../components/TokenAvatar";
import { PressableScale } from "../components/PressableScale";
import { SkeletonRow } from "../components/Skeleton";
import { Updating } from "../components/Updating";
import { ActivityRow } from "../components/ActivityRow";
import { activitySnapshots } from "../cache/screens";
import { useWallet, useWalletStatus, type UnifiedAsset } from "../wallet/WalletContext";
import { CLUSTER, IS_MAINNET } from "../solana/connection";
import { compact, colors, font, radius, spacing, tracking, usd as fmtUsd, weight } from "../theme";
import type { RootNav } from "../navigation";

/** How many transactions the Wallet tab previews before "View all". */
const RECENT_COUNT = 4;

/** One token row in the Wallet list. Memoized + a stable `onOpen` so it skips re-render when
 *  the screen re-renders (e.g. on pull-to-refresh) with unchanged token data. */
const WalletTokenRow = memo(function WalletTokenRow({
  asset,
  onOpen,
}: {
  asset: UnifiedAsset;
  onOpen: (key: string) => void;
}) {
  // Lead the value column with what the holding is worth (USD); the token amount rides underneath.
  // Unpriced tokens fall back to showing the amount as the headline so the row never reads blank.
  const priced = asset.usd != null && asset.usd > 0;
  const held = `${compact(asset.balance)} ${asset.symbol}`;
  return (
    <PressableScale onPress={() => onOpen(asset.key)} style={styles.tokenRow}>
      <TokenAvatar symbol={asset.symbol} color={colors.primary} logoURI={asset.logoURI} />
      <View style={styles.mid}>
        <Text style={styles.symbol} numberOfLines={1}>{asset.name ?? asset.symbol}</Text>
        <Text style={styles.sub}>{asset.symbol}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.value}>{priced ? fmtUsd(asset.usd!) : held}</Text>
        <Text style={styles.subUsd}>{priced ? held : "—"}</Text>
      </View>
    </PressableScale>
  );
});

export function HomeScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const {
    activeChain,
    activeAddress,
    native,
    assets,
    solChange24h,
    totalUsd,
    refresh,
    airdrop,
  } = useWallet();
  const { busy, error, refreshing: walletRefreshing } = useWalletStatus();

  const isSolana = activeChain.kind === "solana";
  // `native.balance == null` means "not loaded yet", and `?? 0` turned that into "empty wallet" —
  // so a funded wallet flashed the "Fund your wallet" card on every cold open, and the token
  // skeletons below could never render because this guard was already true.
  const empty = native.balance != null && native.balance === 0 && assets.length === 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const network = isSolana ? (CLUSTER === "devnet" ? "Devnet" : "Mainnet") : activeChain.name;
  const openToken = useCallback((key: string) => nav.navigate("TokenDetail", { asset: key }), [nav]);

  // Seeded from the same persisted history the Activity screen writes, so "Recent activity"
  // is already on screen at first paint instead of popping in a second later.
  const [recent, setRecent] = useState<HistoryItem[]>(
    () => activitySnapshots.get(`${activeChain.id}:${activeAddress ?? ""}`)?.slice(0, RECENT_COUNT) ?? []
  );
  const [refreshing, setRefreshing] = useState(false);
  const loadRecent = useCallback(async () => {
    if (!activeAddress) {
      setRecent([]);
      return;
    }
    // Cover a chain/account switch too — show that scope's last-known rows immediately.
    const cached = activitySnapshots.get(`${activeChain.id}:${activeAddress}`);
    if (cached) setRecent(cached.slice(0, RECENT_COUNT));
    try {
      const rows = await fetchActivity(activeChain, activeAddress, RECENT_COUNT);
      setRecent(rows);
      // Then work out what each one actually did (cached permanently after the first time).
      setRecent(await enrichActivity(activeChain, activeAddress, rows));
    } catch {
      /* best-effort */
    }
  }, [activeChain, activeAddress]);
  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  // Local refreshing state so the spinner reliably shows for the whole fetch (set true
  // synchronously on pull), and refresh BOTH balances/prices and the recent-activity list.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refresh(), loadRecent()]);
    } finally {
      setRefreshing(false);
    }
  }, [refresh, loadRecent]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <Text style={styles.greeting}>{greeting}</Text>
      <View style={styles.headerRow}>
        <WalletSwitcher />
        <Pressable onPress={() => nav.navigate("Activity")} hitSlop={10}>
          <Ionicons name="time-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      <ChainSwitcher />

      <BalanceCard
        solBalance={native.balance}
        symbol={native.symbol}
        address={activeAddress ?? ""}
        network={network}
        refreshing={refreshing}
        usdValue={totalUsd}
        change24h={native.symbol === "SOL" ? solChange24h : null}
      />

      <View style={styles.actions}>
        <ActionButton icon="arrow-up" label="Send" onPress={() => nav.navigate("Send")} />
        <ActionButton icon="arrow-down" label="Receive" onPress={() => nav.navigate("Receive")} />
        <ActionButton icon="swap-horizontal" label="Swap" onPress={() => nav.navigate("Swap")} />
      </View>

      {busy && <Text style={styles.status}>Requesting test SOL from the faucet…</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {empty && !busy && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Fund your wallet</Text>
          <Text style={styles.emptySub}>
            {isSolana && !IS_MAINNET
              ? "This is a fresh devnet wallet — airdrop 1 test SOL to get started. It’s free and not real money."
              : `Send ${native.symbol} or tokens to your ${activeChain.name} address (tap Receive) to get started.`}
          </Text>
          {isSolana && !IS_MAINNET && (
            <Pressable onPress={airdrop} style={styles.emptyBtn}>
              <Ionicons name="water" size={16} color={colors.bg} />
              <Text style={styles.emptyBtnText}>Get test SOL</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* The native asset is the hero above; this lists the SPL/ERC-20 tokens the wallet holds.
          Hidden entirely for a native-only wallet so it never renders an empty bordered box. */}
      {!empty && (assets.length > 0 || native.balance == null) && (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Tokens</Text>
            {/* Rows painted from the persisted snapshot while a refresh runs. The pull-to-refresh
                spinner only appears when the USER pulled; this covers the automatic refresh. */}
            {assets.length > 0 && walletRefreshing && !refreshing && <Updating />}
          </View>
          <View style={styles.card}>
            {native.balance == null && assets.length === 0
              ? [0, 1, 2].map((k) => (
                  <View key={`sk${k}`}>
                    {k > 0 && <View style={styles.divider} />}
                    <SkeletonRow />
                  </View>
                ))
              : assets.map((a, i) => (
                  <View key={a.key}>
                    {i > 0 && <View style={styles.divider} />}
                    <WalletTokenRow asset={a} onOpen={openToken} />
                  </View>
                ))}
          </View>
        </>
      )}

      {recent.length > 0 && (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recent activity</Text>
            <Pressable onPress={() => nav.navigate("Activity")}>
              <Text style={styles.viewAll}>View all →</Text>
            </Pressable>
          </View>
          <View style={styles.card}>
            {recent.map((tx, i) => (
              <View key={tx.id}>
                {i > 0 && <View style={styles.divider} />}
                <ActivityRow
                  item={tx}
                  compactSize
                  onPress={() => nav.navigate("TransactionDetail", { item: tx })}
                />
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  greeting: { color: colors.accent, fontSize: font.small, fontWeight: weight.bold, textTransform: "uppercase", letterSpacing: tracking.wide, marginBottom: spacing(1) },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing(6),
    marginBottom: spacing(2),
  },
  status: { color: colors.primary, fontSize: font.small, marginTop: spacing(2) },
  error: { color: colors.negative, fontSize: font.small, marginTop: spacing(2) },
  emptyCard: {
    backgroundColor: colors.primary + "14",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.primary + "33",
    padding: spacing(4),
    marginTop: spacing(4),
    gap: spacing(1),
  },
  emptyTitle: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  emptySub: { color: colors.textMuted, fontSize: font.small, lineHeight: 19 },
  emptyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), backgroundColor: colors.primary, paddingVertical: spacing(3), borderRadius: radius.pill, marginTop: spacing(3) },
  emptyBtnText: { color: colors.bg, fontSize: font.body, fontWeight: "800" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing(6), marginBottom: spacing(3) },
  viewAll: { color: colors.primary, fontSize: font.small, fontWeight: "700" },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(6),
    marginBottom: spacing(3),
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing(4),
  },
  tokenRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  mid: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", gap: 2 },
  symbol: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  value: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  subUsd: { color: colors.textMuted, fontSize: font.small },
  divider: { height: 1, backgroundColor: colors.cardBorder },
});
