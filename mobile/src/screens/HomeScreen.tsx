import { useNavigation } from "@react-navigation/native";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BalanceCard } from "../components/BalanceCard";
import { ActionButton } from "../components/ActionButton";
import { TokenAvatar } from "../components/TokenAvatar";
import { useWallet } from "../wallet/WalletContext";
import { CLUSTER } from "../solana/connection";
import { amount as fmtAmount, colors, font, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

const SOL_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
      }
    >
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
        <ActionButton icon="swap-horizontal" label="Swap" onPress={() => nav.navigate("Swap")} />
        <ActionButton icon="water" label={busy ? "…" : "Get SOL"} onPress={airdrop} />
      </View>

      {busy && <Text style={styles.status}>Requesting test SOL from the faucet…</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {empty && !busy && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Fund your wallet</Text>
          <Text style={styles.emptySub}>
            This is a fresh devnet wallet. Tap “Get SOL” to airdrop 1 test SOL — it’s
            free and not real money.
          </Text>
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
                    {fmtAmount(t.amount)} {t.symbol ?? "SPL"}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.value}>{fmtAmount(t.amount)}</Text>
                  {p != null && <Text style={styles.subUsd}>{usd(t.amount * p)}</Text>}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
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
