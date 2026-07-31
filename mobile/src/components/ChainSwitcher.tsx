import { Pressable, StyleSheet, Text, View } from "react-native";
import { useWallet } from "../wallet/WalletContext";
import { colors, font, radius, spacing } from "../theme";

/** Segmented pills to switch the active chain (Solana / Ethereum / BNB). */
export function ChainSwitcher() {
  const { chains, activeChain, setActiveChain } = useWallet();
  return (
    <View style={styles.row}>
      {chains.map((c) => {
        const active = c.id === activeChain.id;
        return (
          <Pressable
            key={c.id}
            onPress={() => !active && setActiveChain(c.id)}
            style={[
              styles.pill,
              active && { backgroundColor: c.color + "22", borderColor: c.color },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: c.color }]} />
            <Text style={[styles.label, active && { color: colors.text }]}>{c.symbol}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing(2), marginBottom: spacing(4) },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  label: { color: colors.textMuted, fontSize: font.small, fontWeight: "800" },
});
