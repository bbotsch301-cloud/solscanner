/**
 * Full-screen, TradingView-style candlestick view (portrait, no gesture-handler dep). Renders a
 * *window* of the candles (unlike the inline CandleChart, which squeezes them all to fit) so you
 * can:
 *   • pinch to zoom in/out (two fingers) — changes how many candles are visible,
 *   • drag to pan through history (one finger),
 *   • long-press for a price/time crosshair,
 *   • double-tap to reset to fit-all.
 * All gestures ride one PanResponder reading `nativeEvent.touches`; the visible slice is re-scaled
 * vertically (autoscale) as you zoom. The `1D/1W/1M/1Y` range pills refetch via `onRangeChange`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { PressableScale } from "./PressableScale";
import { TokenAvatar } from "./TokenAvatar";
import { haptics } from "../ui/haptics";
import { colors, font, radius, spacing, usd as fmtUsd, weight } from "../theme";
import { CHART_RANGES, type Candle, type ChartRange } from "../prices/candles";

const PAD_R = 56;
const PAD_Y = 12;
const GRID = 5;
const MIN_VISIBLE = 8; // never zoom in past this many candles
const LONG_PRESS_MS = 240;
const DOUBLE_TAP_MS = 300;

function fmtPrice(n: number): string {
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

const touchDist = (t: GestureResponderEvent["nativeEvent"]["touches"]): number =>
  t.length < 2 ? 0 : Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
const touchMidX = (t: GestureResponderEvent["nativeEvent"]["touches"]): number =>
  t.length < 2 ? t[0]?.locationX ?? 0 : (t[0].locationX + t[1].locationX) / 2;

type Mode = "idle" | "pan" | "pinch" | "cross";

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
  const [size, setSize] = useState({ width: 0, height: 0 });
  // count === 0 means "fit all"; a positive value is the user's zoom (visible candle count).
  const [count, setCount] = useState(0);
  const [start, setStart] = useState(0); // float index of the leftmost visible candle
  const [cross, setCross] = useState<number | null>(null);

  const total = candles.length;
  const plotW = Math.max(0, size.width - PAD_R);
  const plotH = Math.max(0, size.height - PAD_Y * 2);
  const viewCount = count > 0 ? Math.max(MIN_VISIBLE, Math.min(count, total)) : total;
  const maxStart = Math.max(0, total - viewCount);
  const clampedStart = Math.min(Math.max(0, start), maxStart);
  const step = viewCount > 0 ? plotW / viewCount : 0;

  const resetZoom = () => {
    setCount(0);
    setStart(0);
    setCross(null);
  };

  // Mirror the live geometry into a ref (in an effect, never during render) so the gesture handlers
  // — created once — can read the current start/zoom/step at gesture time.
  const live = useRef({ start: 0, viewCount: 0, total: 0, step: 0, plotW: 0 });
  useEffect(() => {
    live.current = { start: clampedStart, viewCount, total, step, plotW };
  });

  // A subtle tick as the crosshair moves between candles.
  useEffect(() => {
    if (cross != null) haptics.select();
  }, [cross]);

  const onLayout = (e: LayoutChangeEvent) =>
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  // Created once; the gesture snapshot `g` persists across renders and the handlers read the latest
  // geometry from `live.current` (so recreating the responder — which would drop `g` mid-gesture —
  // is unnecessary). Reads happen at gesture time, not during render.
  const pan = useMemo(
    () => {
      // Snapshot taken at gesture start; move handlers compute deltas from it.
      const g = {
        mode: "idle" as Mode,
        startAtGrant: 0,
        countAtGrant: 0,
        stepAtGrant: 0,
        dist0: 0,
        anchorFrac: 0,
        grantX: 0,
        longPress: null as ReturnType<typeof setTimeout> | null,
        lastTap: 0,
        movedFar: false,
      };
      const clearLP = () => {
        if (g.longPress) {
          clearTimeout(g.longPress);
          g.longPress = null;
        }
      };
      const pickCross = (x: number) => {
        const { start: s, viewCount: vc, total: tot, step: st } = live.current;
        if (st <= 0 || tot === 0) return;
        const i = Math.max(0, Math.min(tot - 1, Math.floor(s + x / st)));
        void vc;
        setCross(i);
      };
      const beginPinch = (touches: GestureResponderEvent["nativeEvent"]["touches"]) => {
        clearLP();
        g.mode = "pinch";
        g.dist0 = touchDist(touches) || 1;
        g.startAtGrant = live.current.start;
        g.countAtGrant = live.current.viewCount;
        g.anchorFrac = live.current.plotW > 0 ? touchMidX(touches) / live.current.plotW : 0.5;
        setCross(null);
      };

      // The handlers read `live.current` only when a gesture fires (never during render), so the
      // ref-in-render heuristic is a false positive here.
      // eslint-disable-next-line react-hooks/refs
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const touches = e.nativeEvent.touches;
          g.movedFar = false;
          if (touches.length >= 2) {
            beginPinch(touches);
            return;
          }
          g.mode = "idle";
          g.startAtGrant = live.current.start;
          g.stepAtGrant = live.current.step;
          g.grantX = e.nativeEvent.locationX;
          // Hold without moving → crosshair.
          g.longPress = setTimeout(() => {
            g.mode = "cross";
            pickCross(g.grantX);
          }, LONG_PRESS_MS);
        },
        onPanResponderMove: (e, gs) => {
          const touches = e.nativeEvent.touches;
          // A second finger anytime → switch to pinch.
          if (touches.length >= 2 && g.mode !== "pinch") {
            beginPinch(touches);
            return;
          }
          if (g.mode === "pinch") {
            const d = touchDist(touches);
            if (d <= 0) return;
            const raw = g.countAtGrant * (g.dist0 / d);
            const nextCount = Math.max(MIN_VISIBLE, Math.min(live.current.total, Math.round(raw)));
            // Keep the candle under the pinch midpoint pinned as the view rescales.
            const anchorIndex = g.startAtGrant + g.anchorFrac * g.countAtGrant;
            const nextStart = anchorIndex - g.anchorFrac * nextCount;
            setCount(nextCount);
            setStart(nextStart);
            return;
          }
          if (g.mode === "cross") {
            pickCross(e.nativeEvent.locationX);
            return;
          }
          // Undecided single finger: a clear horizontal move commits to panning.
          if (g.mode === "idle" && (Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6)) {
            clearLP();
            g.mode = "pan";
            g.movedFar = true;
          }
          if (g.mode === "pan" && g.stepAtGrant > 0) {
            setStart(g.startAtGrant - gs.dx / g.stepAtGrant);
          }
        },
        onPanResponderRelease: (e, gs) => {
          clearLP();
          const wasCross = g.mode === "cross";
          const tapped = !g.movedFar && Math.abs(gs.dx) < 6 && Math.abs(gs.dy) < 6;
          // Double-tap (two quick taps that didn't pan/scrub) resets to fit-all.
          if (tapped && g.mode !== "pinch") {
            const now = e.nativeEvent.timestamp;
            if (now - g.lastTap < DOUBLE_TAP_MS) {
              setCount(0);
              setStart(0);
              haptics.tap();
            }
            g.lastTap = now;
          }
          g.mode = "idle";
          if (wasCross) setCross(null);
        },
        onPanResponderTerminate: () => {
          clearLP();
          g.mode = "idle";
          setCross(null);
        },
      });
    },
    []
  );

  // Visible slice + autoscale over just what's on screen.
  const i0 = Math.max(0, Math.floor(clampedStart));
  const i1 = Math.min(total - 1, Math.ceil(clampedStart + viewCount));
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = i0; i <= i1 && i < total; i++) {
    if (candles[i].low < lo) lo = candles[i].low;
    if (candles[i].high > hi) hi = candles[i].high;
  }
  if (!isFinite(lo) || !isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  const padY = (hi - lo || hi || 1) * 0.06;
  lo -= padY;
  hi += padY;
  const y = (price: number) => PAD_Y + (1 - (price - lo) / (hi - lo || 1)) * plotH;
  const xAt = (i: number) => (i - clampedStart) * step + step / 2;
  const bodyW = Math.max(1, Math.min(14, step * 0.66));

  const crossCandle = cross != null && cross < total ? candles[cross] : null;
  const headerPrice = crossCandle ? crossCandle.close : livePrice;
  const crossTime = crossCandle
    ? new Date(crossCandle.time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;
  const change =
    total >= 2 && candles[0].open > 0 ? ((candles[total - 1].close - candles[0].open) / candles[0].open) * 100 : null;
  const gridLines = Array.from({ length: GRID + 1 }, (_, i) => lo + ((hi - lo) * i) / GRID);
  const canRender = total >= 2 && size.width > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing(2), paddingBottom: insets.bottom + spacing(2) }]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <TokenAvatar symbol={symbol} color={colors.primary} size={26} logoURI={logoURI} />
            <View>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <Text style={styles.price}>{headerPrice != null ? fmtUsd(headerPrice) : "—"}</Text>
            </View>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.textMuted} />
          </Pressable>
        </View>

        {crossTime ? (
          <Text style={styles.crossTime}>{crossTime}</Text>
        ) : (
          change != null && (
            <Text style={[styles.change, { color: change >= 0 ? colors.positive : colors.negative }]}>
              {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% · {range}
            </Text>
          )
        )}

        <View style={styles.chartArea} onLayout={onLayout} {...pan.panHandlers}>
          {canRender ? (
            <Svg width="100%" height="100%">
              <G>
                {gridLines.map((p, i) => (
                  <G key={i}>
                    <Line x1={0} y1={y(p)} x2={plotW} y2={y(p)} stroke={colors.cardBorder} strokeWidth={1} opacity={0.5} />
                    <SvgText x={size.width - 4} y={y(p) + 3} fill={colors.textFaint} fontSize={10} textAnchor="end">
                      {fmtPrice(p)}
                    </SvgText>
                  </G>
                ))}
              </G>
              <G>
                {(() => {
                  const nodes = [];
                  for (let i = i0; i <= i1 && i < total; i++) {
                    const c = candles[i];
                    const cx = xAt(i);
                    if (cx < -step || cx > plotW + step) continue;
                    const up = c.close >= c.open;
                    const col = up ? colors.positive : colors.negative;
                    const bodyTop = y(Math.max(c.open, c.close));
                    const bodyBot = y(Math.min(c.open, c.close));
                    nodes.push(
                      <G key={i}>
                        <Line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} stroke={col} strokeWidth={1} />
                        <Rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={Math.max(1, bodyBot - bodyTop)} fill={col} />
                      </G>
                    );
                  }
                  return nodes;
                })()}
              </G>
              {total > 0 && (
                <Line
                  x1={0}
                  y1={y(candles[total - 1].close)}
                  x2={plotW}
                  y2={y(candles[total - 1].close)}
                  stroke={colors.primary}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
              )}
              {crossCandle && (
                <G>
                  <Line x1={xAt(cross!)} y1={0} x2={xAt(cross!)} y2={size.height} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="2 3" />
                  <Line x1={0} y1={y(crossCandle.close)} x2={plotW} y2={y(crossCandle.close)} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="2 3" />
                </G>
              )}
            </Svg>
          ) : (
            <View style={styles.center}>
              <Text style={styles.empty}>{loading ? "Loading chart…" : "No trading history yet for this token."}</Text>
            </View>
          )}
        </View>

        <Text style={styles.hint}>Pinch to zoom · drag to pan · hold for details · double-tap to reset</Text>

        <View style={styles.rangeRow}>
          {CHART_RANGES.map((r) => {
            const on = r === range;
            return (
              <PressableScale
                key={r}
                haptic={null}
                onPress={() => {
                  if (on) return;
                  haptics.select();
                  resetZoom();
                  onRangeChange(r);
                }}
                style={[styles.rangePill, on && styles.rangePillOn]}
              >
                <Text style={[styles.rangeText, on && styles.rangeTextOn]}>{r}</Text>
              </PressableScale>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), flex: 1 },
  name: { color: colors.textMuted, fontSize: font.small, fontWeight: weight.semibold },
  price: { color: colors.text, fontSize: font.h2, fontWeight: weight.black, letterSpacing: -0.5 },
  change: { fontSize: font.body, fontWeight: weight.bold, marginTop: spacing(1) },
  crossTime: { color: colors.textMuted, fontSize: font.small, fontWeight: weight.bold, marginTop: spacing(1) },
  chartArea: { flex: 1, marginTop: spacing(3) },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.textMuted, fontSize: font.body, textAlign: "center" },
  hint: { color: colors.textFaint, fontSize: font.tiny, textAlign: "center", marginTop: spacing(2) },
  rangeRow: { flexDirection: "row", gap: spacing(2), marginTop: spacing(3) },
  rangePill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing(2.5),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  rangePillOn: { backgroundColor: colors.primary + "22", borderColor: colors.primary },
  rangeText: { color: colors.textMuted, fontSize: font.small, fontWeight: weight.bold },
  rangeTextOn: { color: colors.text },
});
