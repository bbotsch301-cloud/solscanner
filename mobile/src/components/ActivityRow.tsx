/**
 * One row of transaction history, shared by the Wallet tab's "Recent activity" and the full
 * Activity screen.
 *
 * Those two screens each carried their own copy of the icon, colour and title logic, at different
 * sizes, and had already drifted apart ("Failed" in one, "Failed transaction" in the other). More
 * importantly both led with a truncated signature — the least meaningful thing about a
 * transaction. This leads with what moved and how much.
 *
 * A row whose transaction hasn't been parsed yet (or couldn't be) falls back to exactly what the
 * feed showed before, so enrichment can only ever improve a row, never blank one.
 */
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { TokenAvatar } from "./TokenAvatar";
import { Skeleton } from "./Skeleton";
import type { AssetMove, HistoryItem } from "../activity";
import { amount as fmtAmount, colors, compact, font, leading, spacing, timeAgo, usd as fmtUsd, weight } from "../theme";

/** Big numbers shouldn't push the symbol off the row. */
const fmt = (n: number) => (n >= 1_000_000 ? compact(n) : fmtAmount(n));

function headline(item: HistoryItem): string {
  const a = item.moveOut[0];
  const b = item.moveIn[0];
  switch (item.kind) {
    case "swap":
      return a && b ? `${fmt(a.amount)} ${a.symbol} → ${fmt(b.amount)} ${b.symbol}` : "Swap";
    case "received":
      return b ? `+${fmt(b.amount)} ${b.symbol}` : "Received";
    case "sent":
      return a ? `−${fmt(a.amount)} ${a.symbol}` : "Sent";
    case "interaction":
      return "Interaction";
    case "failed":
      return "Failed";
    default:
      // Unparsed — what the feed said before this existed.
      return item.failed ? "Failed" : "Transaction";
  }
}

function label(item: HistoryItem): string {
  switch (item.kind) {
    case "swap":
      return "Swapped";
    case "received":
      return "Received";
    case "sent":
      return "Sent";
    case "interaction":
      return "Interaction";
    case "failed":
      return "Failed";
    default:
      return item.failed ? "Failed" : "Transaction";
  }
}

function glyph(item: HistoryItem): keyof typeof Ionicons.glyphMap {
  if (item.kind === "failed" || item.failed) return "close";
  if (item.kind === "received") return "arrow-down";
  if (item.kind === "sent") return "arrow-up";
  if (item.kind === "interaction") return "ellipsis-horizontal";
  return "swap-horizontal";
}

function tint(item: HistoryItem): string {
  if (item.kind === "failed" || item.failed) return colors.negative;
  if (item.kind === "received") return colors.positive;
  if (item.kind === "sent") return colors.text;
  return colors.primary;
}

/** The asset whose artwork best represents the row — what you received, else what you paid. */
function faceAsset(item: HistoryItem): AssetMove | undefined {
  return item.moveIn[0] ?? item.moveOut[0];
}

export const ActivityRow = memo(function ActivityRow({
  item,
  onPress,
  compactSize = false,
}: {
  item: HistoryItem;
  onPress: () => void;
  /** Home's list is tighter than the full Activity screen. */
  compactSize?: boolean;
}) {
  const face = faceAsset(item);
  const color = tint(item);
  const size = compactSize ? 32 : 36;
  const usdValue = item.moveIn[0]?.usd ?? item.moveOut[0]?.usd;

  return (
    <PressableScale onPress={onPress} style={styles.row}>
      <View style={styles.lead}>
        {face ? (
          <TokenAvatar symbol={face.symbol} color={colors.primary} size={size} logoURI={face.logoURI} />
        ) : (
          <View style={[styles.chip, { width: size, height: size, borderRadius: size / 2, backgroundColor: color + "22" }]}>
            <Ionicons name={glyph(item)} size={compactSize ? 15 : 17} color={color} />
          </View>
        )}
        {face && (
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Ionicons name={glyph(item)} size={9} color={colors.bg} />
          </View>
        )}
      </View>

      <View style={styles.mid}>
        <Text style={styles.title} numberOfLines={1}>
          {headline(item)}
        </Text>
        {item.kind === null ? (
          // Parsing hasn't landed yet — hint that more is coming rather than showing a bare hash.
          <Skeleton width={90} height={10} style={{ marginTop: 4 }} />
        ) : (
          <Text style={styles.sub} numberOfLines={1}>
            {label(item)}
            {usdValue != null ? ` · ${fmtUsd(usdValue)}` : ""}
            {item.time ? ` · ${timeAgo(item.time)}` : ""}
          </Text>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  lead: { justifyContent: "center" },
  chip: { alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.card,
  },
  mid: { flex: 1 },
  title: { color: colors.text, fontSize: font.body, fontWeight: weight.semibold, lineHeight: font.body * leading.tight },
  sub: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
});
