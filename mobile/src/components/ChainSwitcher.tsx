import { StyleSheet, Text, View } from "react-native";
import { useWallet } from "../wallet/WalletContext";
import { TokenAvatar } from "./TokenAvatar";
import { PressableScale } from "./PressableScale";
import { haptics } from "../ui/haptics";
import { colors, font, radius, spacing } from "../theme";

/** Segmented pills to switch the active chain (Solana / Ethereum / BNB). */
export function ChainSwitcher() {
  const { chains, activeChain, setActiveChain } = useWallet();
  return (
    <View style={styles.row}>
      {chains.map((c) => {
        const active = c.id === activeChain.id;
        return (
          <PressableScale
            key={c.id}
            haptic={null}
            onPress={() => {
              if (active) return;
              haptics.select();
              setActiveChain(c.id);
            }}
            style={[
              styles.pill,
              active && { backgroundColor: c.color + "22", borderColor: c.color },
            ]}
          >
            <TokenAvatar symbol={c.symbol} color={c.color} logoURI={c.logoURI} size={18} />
            <Text style={[styles.label, active && { color: colors.text }]}>{c.symbol}</Text>
          </PressableScale>
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
  label: { color: colors.textMuted, fontSize: font.small, fontWeight: "800" },
});
