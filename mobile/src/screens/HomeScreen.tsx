import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { fetchHistory, type TxSummary } from "../solana/history";
import { BalanceCard } from "../components/BalanceCard";
import { ActionButton } from "../components/ActionButton";
import { TokenAvatar } from "../components/TokenAvatar";
import { useWallet } from "../wallet/WalletContext";
import { CLUSTER, IS_MAINNET, solscanTx } from "../solana/connection";
import { amount as fmtAmount, compact, colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

const SOL_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function HomeScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const {
    address,
    solBalance,
    tokens,
    solPrice,
    solChange24h,
    totalUsd,
    priceOf,
    refreshing,
    busy,
    error,
    refresh,
    airdrop,
  } = useWallet();

  const empty = (solBalance ?? 0) === 0 && tokens.length === 0;
  const usd = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const [recent, setRecent] = useState<TxSummary[]>([]);
  const loadRecent = useCallback(async () => {
    if (!address) return;
    try {
      setRecent(await fetchHistory(address, 4));
    } catch {
      /* best-effort */
    }
  }, [address]);
  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Wallet</Text>
        <Pressable onPress={() => nav.navigate("Activity")} hitSlop={10}>
          <Ionicons name="time-outline" size={22} color={colors.textMuted} />
        </Pressable>
      </View>

      {IS_MAINNET && (
        <View style={styles.mainnetBanner}>
          <Ionicons name="warning" size={15} color={colors.negative} />
          <Text style={styles.mainnetText}>Mainnet — real funds. Double-check every transaction.</Text>
        </View>
      )}

      <BalanceCard
        solBalance={solBalance}
        address={address ?? ""}
        network={CLUSTER === "devnet" ? "Devnet" : CLUSTER}
        refreshing={refreshing}
        usdValue={totalUsd}
        change24h={solChange24h}
      />

      <View style={styles.actions}>
        <ActionButton icon="arrow-up" label="Send" onPress={() => nav.navigate("Send")} />
        <ActionButton icon="arrow-down" label="Receive" onPress={() => nav.navigate("Receive")} />
        <ActionButton icon="card-outline" label="Buy" onPress={() => nav.navigate("Buy")} />
        <ActionButton icon="swap-horizontal" label="Swap" onPress={() => nav.navigate("Swap")} />
      </View>

      {busy && <Text style={styles.status}>Requesting test SOL from the faucet…</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {empty && !busy && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Fund your wallet</Text>
          <Text style={styles.emptySub}>
            {IS_MAINNET
              ? "Send SOL or tokens to your address (tap Receive) to get started."
              : "This is a fresh devnet wallet — airdrop 1 test SOL to get started. It’s free and not real money."}
          </Text>
          {!IS_MAINNET && (
            <Pressable onPress={airdrop} style={styles.emptyBtn}>
              <Ionicons name="water" size={16} color={colors.bg} />
              <Text style={styles.emptyBtnText}>Get test SOL</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>Tokens</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() => nav.navigate("Send", { asset: "SOL" })}
          style={({ pressed }) => [styles.tokenRow, pressed && { opacity: 0.6 }]}
        >
          <TokenAvatar symbol="SOL" color={colors.accent} logoURI={SOL_LOGO} />
          <View style={styles.mid}>
            <Text style={styles.symbol}>Solana</Text>
            <Text style={styles.sub}>
              {solPrice != null ? `${usd(solPrice)} · SOL` : "Native"}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.value}>
              {solBalance == null ? "—" : fmtAmount(solBalance)} SOL
            </Text>
            {solBalance != null && solPrice != null && (
              <Text style={styles.subUsd}>{usd(solBalance * solPrice)}</Text>
            )}
          </View>
        </Pressable>

        {tokens.map((t) => {
          const p = priceOf(t.mint);
          return (
            <View key={t.mint}>
              <View style={styles.divider} />
              <Pressable
                onPress={() => nav.navigate("Send", { asset: t.mint })}
                style={({ pressed }) => [styles.tokenRow, pressed && { opacity: 0.6 }]}
              >
                <TokenAvatar
                  symbol={t.symbol ?? t.mint.slice(0, 3)}
                  color={colors.primary}
                  logoURI={t.logoURI}
                />
                <View style={styles.mid}>
                  <Text style={styles.symbol}>{t.name ?? t.symbol ?? shortAddress(t.mint, 4, 4)}</Text>
                  <Text style={styles.sub}>
                    {compact(t.amount)} {t.symbol ?? "SPL"}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.value}>{compact(t.amount)}</Text>
                  {p != null && <Text style={styles.subUsd}>{usd(t.amount * p)}</Text>}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>

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
              <View key={tx.signature}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable
                  onPress={() => Linking.openURL(solscanTx(tx.signature))}
                  style={({ pressed }) => [styles.tokenRow, pressed && { opacity: 0.6 }]}
                >
                  <View style={[styles.actIcon, { backgroundColor: (tx.failed ? colors.negative : colors.primary) + "22" }]}>
                    <Ionicons
                      name={tx.failed ? "close" : "swap-horizontal"}
                      size={16}
                      color={tx.failed ? colors.negative : colors.primary}
                    />
                  </View>
                  <View style={styles.mid}>
                    <Text style={styles.symbol}>{tx.failed ? "Failed" : "Transaction"}</Text>
                    <Text style={styles.sub}>{shortAddress(tx.signature, 6, 6)} · {timeAgo(tx.blockTime)}</Text>
                  </View>
                  <Ionicons name="open-outline" size={15} color={colors.textFaint} />
                </Pressable>
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  headerTitle: { color: colors.text, fontSize: font.h1, fontWeight: "900" },
  mainnetBanner: { flexDirection: "row", alignItems: "center", gap: spacing(2), backgroundColor: colors.negative + "1A", borderWidth: 1, borderColor: colors.negative + "44", borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(4) },
  mainnetText: { flex: 1, color: colors.negative, fontSize: font.small, fontWeight: "700" },
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
  actIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
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
