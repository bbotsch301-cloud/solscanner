import { useNavigation } from "@react-navigation/native";
import { memo, useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { enrichActivity, fetchActivity, type HistoryItem } from "../activity";
import { BalanceCard } from "../components/BalanceCard";
import { ActionButton } from "../components/ActionButton";
import { WalletSwitcher } from "../components/WalletSwitcher";
import { TokenAvatar } from "../components/TokenAvatar";
import { PressableScale } from "../components/PressableScale";
import { SkeletonRow } from "../components/Skeleton";
import { Updating } from "../components/Updating";
import { RefreshScroll } from "../components/RefreshScroll";
import { ActivityRow } from "../components/ActivityRow";
import { activitySnapshots } from "../cache/screens";
import { getChain } from "../chains/registry";
import { priceUnavailableReason } from "../solana/prices";
import { useWallet, useWalletStatus, type UnifiedAsset } from "../wallet/WalletContext";
import { IS_MAINNET } from "../solana/connection";
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
  onOpen: (asset: UnifiedAsset) => void;
}) {
  // Lead the value column with what the holding is worth (USD); the token amount rides underneath.
  // Unpriced tokens fall back to showing the amount as the headline so the row never reads blank.
  const priced = asset.usd != null && asset.usd > 0;
  const held = `${compact(asset.balance)} ${asset.symbol}`;
  const chain = getChain(asset.chainId);
  // A dash says "we don't know". When we DO know — we found the pool and it's nearly empty —
  // saying so is far more useful, because it means the holding can't be sold either.
  const noValue =
    asset.mint && priceUnavailableReason(asset.mint) === "illiquid" ? "No market" : "—";
  return (
    <PressableScale onPress={() => onOpen(asset)} style={styles.tokenRow}>
      {/* The list is cross-chain now, so the avatar carries a small chain mark — without it a
          USDC on Ethereum and a USDC on BNB are the same row twice. */}
      <View>
        <TokenAvatar symbol={asset.symbol} color={colors.primary} logoURI={asset.logoURI} />
        <View style={[styles.chainDot, { borderColor: colors.bg }]}>
          <TokenAvatar symbol={chain.symbol} color={chain.color} size={16} logoURI={chain.logoURI} />
        </View>
      </View>
      <View style={styles.mid}>
        <Text style={styles.symbol} numberOfLines={1}>{asset.name ?? asset.symbol}</Text>
        <Text style={styles.sub}>{chain.name}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.value}>{priced ? fmtUsd(asset.usd!) : held}</Text>
        <Text style={styles.subUsd}>{priced ? held : noValue}</Text>
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
    solBalance,
    allAssets,
    unpricedCount,
    totalUsd,
    setActiveChain,
    refresh,
    airdrop,
  } = useWallet();
  const { busy, error, refreshing: walletRefreshing } = useWalletStatus();

  const isSolana = activeChain.kind === "solana";
  // Loaded, and genuinely holding nothing anywhere. `solBalance` is the "did any chain answer"
  // signal — treating a not-yet-loaded wallet as empty is what used to flash "Fund your wallet"
  // over a funded account on every cold open.
  const loaded = solBalance != null;
  const empty = loaded && allAssets.length === 0;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  // The pill names the chain the assets are on. It used to read "Mainnet", which told the user
  // nothing they needed — a wallet app is on the live network unless something is very wrong.
  // BalanceCard swaps in a warning when it isn't.
  const network = activeChain.name;

  // Opening an asset makes ITS chain the active one before navigating. That's what keeps the
  // list chain-free while Send / Swap / TokenDetail — which all work from `activeChain` — land
  // on the right network without the user ever picking it.
  const openToken = useCallback(
    (asset: UnifiedAsset) => {
      if (asset.chainId !== activeChain.id) void setActiveChain(asset.chainId);
      nav.navigate("TokenDetail", { asset: asset.key });
    },
    [nav, setActiveChain, activeChain.id]
  );

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
    <RefreshScroll
      refreshing={refreshing}
      onRefresh={onRefresh}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
    >
      <Text style={styles.greeting}>{greeting}</Text>
      <View style={styles.headerRow}>
        <WalletSwitcher />
        <Pressable onPress={() => nav.navigate("Activity")} hitSlop={10}>
          <Ionicons name="time-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* No chain switcher here any more. This tab is the whole wallet — every chain at once —
          and the switcher lives on Swap, where picking a network is the actual job. */}
      <BalanceCard
        totalUsd={totalUsd}
        loaded={loaded}
        unpricedCount={unpricedCount}
        network={network}
        onTestNetwork={isSolana && !IS_MAINNET}
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
              ? "This is a fresh test-network wallet — airdrop 1 test SOL to get started. It’s free and not real money."
              : "Send crypto to one of your addresses (tap Receive) to get started."}
          </Text>
          {isSolana && !IS_MAINNET && (
            <Pressable onPress={airdrop} style={styles.emptyBtn}>
              <Ionicons name="water" size={16} color={colors.bg} />
              <Text style={styles.emptyBtnText}>Get test SOL</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Everything the wallet holds, on every chain, richest first. The hero above is the total
          of exactly this list, so the natives (SOL/ETH/BNB) are rows here too. */}
      {!empty && (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Assets</Text>
            {/* Rows painted from the persisted snapshot while a refresh runs. The pull-to-refresh
                spinner only appears when the USER pulled; this covers the automatic refresh. */}
            {allAssets.length > 0 && walletRefreshing && !refreshing && <Updating />}
          </View>
          <View style={styles.card}>
            {allAssets.length === 0
              ? [0, 1, 2].map((k) => (
                  <View key={`sk${k}`}>
                    {k > 0 && <View style={styles.divider} />}
                    <SkeletonRow />
                  </View>
                ))
              : allAssets.map((a, i) => (
                  // Chain-local keys repeat across chains ("native" three times), so the React
                  // key has to carry the chain as well.
                  <View key={`${a.chainId}:${a.key}`}>
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
    </RefreshScroll>
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
  // The chain mark, tucked into the token avatar's bottom-right with a cutout ring so it reads
  // as a badge rather than as part of the artwork.
  chainDot: {
    position: "absolute",
    right: -3,
    bottom: -3,
    borderRadius: 10,
    borderWidth: 2,
    overflow: "hidden",
  },
  mid: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", gap: 2 },
  symbol: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  value: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  subUsd: { color: colors.textMuted, fontSize: font.small },
  divider: { height: 1, backgroundColor: colors.cardBorder },
});
