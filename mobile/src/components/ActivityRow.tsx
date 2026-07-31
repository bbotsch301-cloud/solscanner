import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { amount, colors, font, radius, spacing, usd } from "../theme";
import type { Activity } from "../data/mockWallet";

const ICON: Record<Activity["type"], keyof typeof Ionicons.glyphMap> = {
  send: "arrow-up",
  receive: "arrow-down",
  swap: "swap-horizontal",
};

const VERB: Record<Activity["type"], string> = {
  send: "Sent",
  receive: "Received",
  swap: "Swapped",
};

function timeAgo(ts: number): string {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function ActivityRow({ item }: { item: Activity }) {
  const outgoing = item.type === "send";
  const iconColor =
    item.type === "receive" ? colors.positive : item.type === "send" ? colors.negative : colors.accent;
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: iconColor + "22" }]}>
        <Ionicons name={ICON[item.type]} size={18} color={iconColor} />
      </View>
      <View style={styles.mid}>
        <Text style={styles.title}>
          {VERB[item.type]} {item.symbol}
        </Text>
        <Text style={styles.sub}>
          {item.counterparty} · {timeAgo(item.timestamp)}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={[styles.amount, { color: outgoing ? colors.text : colors.positive }]}>
          {outgoing ? "−" : "+"}
          {amount(item.amount)} {item.symbol}
        </Text>
        <Text style={styles.usd}>{usd(item.usd)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    paddingVertical: spacing(3),
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  mid: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  right: { alignItems: "flex-end", gap: 2 },
  amount: { fontSize: font.body, fontWeight: "700" },
  usd: { color: colors.textMuted, fontSize: font.small },
});
