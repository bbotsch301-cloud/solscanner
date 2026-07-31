import { useNavigation } from "@react-navigation/native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BalanceCard } from "../components/BalanceCard";
import { ActionButton } from "../components/ActionButton";
import { TokenRow } from "../components/TokenRow";
import { ActivityRow } from "../components/ActivityRow";
import {
  NETWORK,
  WALLET_ADDRESS,
  activity,
  tokens,
  totalUsd,
} from "../data/mockWallet";
import { colors, font, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function HomeScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();

  // Weighted 24h change across the portfolio.
  const total = totalUsd();
  const weightedChange =
    tokens.reduce((s, t) => s + t.amount * t.pricePerToken * t.change24h, 0) /
    (total || 1);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
      showsVerticalScrollIndicator={false}
    >
      <BalanceCard
        total={total}
        change24h={weightedChange}
        address={WALLET_ADDRESS}
        network={NETWORK}
      />

      <View style={styles.actions}>
        <ActionButton icon="arrow-up" label="Send" onPress={() => nav.navigate("Send")} />
        <ActionButton icon="arrow-down" label="Receive" onPress={() => nav.navigate("Receive")} />
        <ActionButton icon="swap-horizontal" label="Swap" onPress={() => nav.navigate("Send")} />
        <ActionButton icon="card-outline" label="Buy" onPress={() => nav.navigate("Receive")} />
      </View>

      <Text style={styles.sectionTitle}>Tokens</Text>
      <View style={styles.card}>
        {tokens.map((t, i) => (
          <View key={t.symbol}>
            {i > 0 && <View style={styles.divider} />}
            <TokenRow token={t} onPress={() => nav.navigate("Send", { symbol: t.symbol })} />
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Recent activity</Text>
      <View style={styles.card}>
        {activity.slice(0, 3).map((a, i) => (
          <View key={a.id}>
            {i > 0 && <View style={styles.divider} />}
            <ActivityRow item={a} />
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
  divider: {
    height: 1,
    backgroundColor: colors.cardBorder,
  },
});
