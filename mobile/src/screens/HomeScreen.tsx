import { useNavigation } from "@react-navigation/native";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BalanceCard } from "../components/BalanceCard";
import { ActionButton } from "../components/ActionButton";
import { TokenAvatar } from "../components/TokenAvatar";
import { useWallet } from "../wallet/WalletContext";
import { CLUSTER } from "../solana/connection";
import { amount as fmtAmount, colors, font, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function HomeScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const { address, solBalance, tokens, refreshing, busy, error, refresh, airdrop } =
    useWallet();

  const empty = (solBalance ?? 0) === 0 && tokens.length === 0;

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
      />

      <View style={styles.actions}>
        <ActionButton icon="arrow-up" label="Send" onPress={() => nav.navigate("Send")} />
        <ActionButton icon="arrow-down" label="Receive" onPress={() => nav.navigate("Receive")} />
        <ActionButton icon="water" label={busy ? "…" : "Get SOL"} onPress={airdrop} />
        <ActionButton icon="refresh" label="Refresh" onPress={refresh} />
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
        <View style={styles.tokenRow}>
          <TokenAvatar symbol="SOL" color={colors.accent} />
          <View style={styles.mid}>
            <Text style={styles.symbol}>Solana</Text>
            <Text style={styles.sub}>Native</Text>
          </View>
          <Text style={styles.value}>
            {solBalance == null ? "—" : fmtAmount(solBalance)} SOL
          </Text>
        </View>

        {tokens.map((t) => (
          <View key={t.mint}>
            <View style={styles.divider} />
            <View style={styles.tokenRow}>
              <TokenAvatar symbol={t.mint.slice(0, 3)} color={colors.primary} />
              <View style={styles.mid}>
                <Text style={styles.symbol}>{shortAddress(t.mint, 4, 4)}</Text>
                <Text style={styles.sub}>SPL token</Text>
              </View>
              <Text style={styles.value}>{fmtAmount(t.amount)}</Text>
            </View>
          </View>
        ))}
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
  symbol: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  value: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.cardBorder },
});
