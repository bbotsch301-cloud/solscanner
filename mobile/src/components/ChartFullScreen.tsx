/**
 * Full-screen chart. Same public API as before; the hand-rolled SVG + PanResponder body has been
 * replaced by the shared TradingView engine, so this screen now gets real trading-chart gestures:
 * crosshair scrub, drag the price axis to rescale, drag the time axis to stretch time, pinch to
 * zoom, momentum panning, and adaptive time ticks — none of which had to be written here.
 *
 * What remains is the shell: the token header, the live/scrubbed price readout, and the range
 * pills (4H / 1D / 1W / 1M / 1Y) which refetch through `onRangeChange`.
 */
import { useState } from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "./TokenAvatar";
import { PressableScale } from "./PressableScale";
import { Skeleton } from "./Skeleton";
import { TradingViewChart, type ScrubPoint } from "./chart/TradingViewChart";
import { haptics } from "../ui/haptics";
import { CHART_RANGES, type Candle, type ChartRange } from "../prices/candles";
import { colors, font, radius, spacing, usd as fmtUsd, weight } from "../theme";

export function ChartFullScreen({
  visible,
  onClose,
  candles,
  loading,
  range,
  onRangeChange,
  symbol,
  name,
  logoURI,
  livePrice,
}: {
  visible: boolean;
  onClose: () => void;
  candles: Candle[];
  loading: boolean;
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
  symbol: string;
  name: string;
  logoURI?: string;
  livePrice: number | null;
}) {
  const insets = useSafeAreaInsets();
  const [scrub, setScrub] = useState<ScrubPoint | null>(null);

  const price = scrub ? scrub.close : livePrice ?? (candles.length ? candles[candles.length - 1].close : null);
  const first = candles.length ? candles[0].open : null;
  const change = first && price ? ((price - first) / first) * 100 : null;

  const stamp = scrub
    ? new Date(scrub.time * 1000).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
        <View style={styles.header}>
          <TokenAvatar symbol={symbol} color={colors.primary} size={32} logoURI={logoURI} />
          <View style={styles.headText}>
            <Text style={styles.symbol} numberOfLines={1}>{symbol}</Text>
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
          </View>
          <PressableScale haptic={null} onPress={onClose} hitSlop={10} style={styles.close}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </PressableScale>
        </View>

        <View style={styles.readout}>
          <Text style={styles.price}>{price != null ? fmtUsd(price) : "—"}</Text>
          {stamp ? (
            <Text style={styles.stamp}>{stamp}</Text>
          ) : change != null ? (
            <Text style={[styles.change, { color: change >= 0 ? colors.positive : colors.negative }]}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% · {range}
            </Text>
          ) : null}
        </View>

        {/* OHLC for the scrubbed candle — the detail a full-screen chart exists to show. */}
        {scrub && (
          <View style={styles.ohlc}>
            {(
              [
                ["O", scrub.open],
                ["H", scrub.high],
                ["L", scrub.low],
                ["C", scrub.close],
              ] as const
            ).map(([k, v]) => (
              <Text key={k} style={styles.ohlcItem}>
                <Text style={styles.ohlcKey}>{k} </Text>
                {fmtUsd(v)}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.chartWrap}>
          {loading && candles.length < 2 ? (
            <Skeleton width="100%" height={360} round={radius.md} />
          ) : candles.length >= 2 ? (
            <TradingViewChart candles={candles} height={420} onScrub={setScrub} />
          ) : (
            <Text style={styles.empty}>No price chart for this token.</Text>
          )}
        </View>

        <View style={[styles.rangeRow, { paddingBottom: insets.bottom + spacing(3) }]}>
          {CHART_RANGES.map((r) => {
            const on = r === range;
            return (
              <PressableScale
                key={r}
                haptic={null}
                onPress={() => {
                  if (on) return;
                  haptics.select();
                  setScrub(null);
                  onRangeChange(r);
                }}
                style={[styles.pill, on && styles.pillOn]}
              >
                <Text style={[styles.pillText, on && styles.pillTextOn]}>{r}</Text>
              </PressableScale>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingHorizontal: spacing(4) },
  headText: { flex: 1 },
  symbol: { color: colors.text, fontSize: font.body, fontWeight: weight.bold },
  name: { color: colors.textMuted, fontSize: font.small },
  close: { padding: spacing(1) },
  readout: { paddingHorizontal: spacing(4), paddingTop: spacing(3) },
  price: { color: colors.text, fontSize: 30, fontWeight: weight.bold },
  change: { fontSize: font.small, fontWeight: weight.semibold, marginTop: 2 },
  stamp: { color: colors.textMuted, fontSize: font.small, fontWeight: weight.semibold, marginTop: 2 },
  ohlc: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3), paddingHorizontal: spacing(4), paddingTop: spacing(2) },
  ohlcItem: { color: colors.text, fontSize: font.tiny, fontWeight: weight.semibold },
  ohlcKey: { color: colors.textFaint },
  chartWrap: { flex: 1, marginTop: spacing(3) },
  empty: { color: colors.textFaint, fontSize: font.small, textAlign: "center", marginTop: spacing(8) },
  rangeRow: { flexDirection: "row", justifyContent: "center", gap: spacing(2), paddingTop: spacing(3) },
  pill: {
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  pillOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { color: colors.textMuted, fontSize: font.small, fontWeight: weight.bold },
  pillTextOn: { color: colors.bg },
});
