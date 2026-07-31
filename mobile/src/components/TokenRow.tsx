import { Pressable, StyleSheet, Text, View } from "react-native";
import { amount, colors, font, spacing, usd } from "../theme";
import { tokenUsdValue, type Token } from "../data/mockWallet";
import { TokenAvatar } from "./TokenAvatar";

export function TokenRow({ token, onPress }: { token: Token; onPress?: () => void }) {
  const positive = token.change24h >= 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <TokenAvatar symbol={token.symbol} color={token.color} />
      <View style={styles.mid}>
        <Text style={styles.symbol}>{token.name}</Text>
        <Text style={styles.sub}>
          {amount(token.amount)} {token.symbol}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.value}>{usd(tokenUsdValue(token))}</Text>
        <Text style={[styles.change, { color: positive ? colors.positive : colors.negative }]}>
          {positive ? "+" : "−"}
          {(Math.abs(token.change24h) * 100).toFixed(1)}%
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    paddingVertical: spacing(3),
  },
  mid: { flex: 1, gap: 2 },
  symbol: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  right: { alignItems: "flex-end", gap: 2 },
  value: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  change: { fontSize: font.small, fontWeight: "700" },
});
