/**
 * A lightweight candlestick chart (react-native-svg, no chart library). Renders OHLC candles
 * (green up / red down) with a faint price grid, a dashed last-price line, and a touch crosshair
 * driven by the built-in PanResponder (no gesture-handler dep). While the user drags, `onScrub`
 * reports the candle under their finger so the screen can show its price/time; releasing calls
 * `onScrub(null)`.
 */
import { useMemo, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import { colors } from "../theme";
import type { Candle } from "../prices/candles";

const PAD_R = 52; // right gutter for price labels
const PAD_Y = 8; // vertical breathing room
const GRID = 4; // horizontal grid lines / labels

function fmtPrice(n: number): string {
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(3)}`;
}

export function CandleChart({
  candles,
  height = 220,
  onScrub,
}: {
  candles: Candle[];
  height?: number;
  onScrub?: (c: Candle | null) => void;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const [active, setActive] = useState<number | null>(null);

  const plotW = Math.max(0, width - PAD_R);
  const plotH = height - PAD_Y * 2;

  const { lo, hi } = useMemo(() => {
    if (!candles.length) return { lo: 0, hi: 1 };
    let l = Infinity;
    let h = -Infinity;
    for (const c of candles) {
      if (c.low < l) l = c.low;
      if (c.high > h) h = c.high;
    }
    const pad = (h - l || h || 1) * 0.06;
    return { lo: l - pad, hi: h + pad };
  }, [candles]);

  const y = (price: number) => PAD_Y + (1 - (price - lo) / (hi - lo || 1)) * plotH;
  const step = candles.length ? plotW / candles.length : 0;
  const bodyW = Math.max(1, Math.min(10, step * 0.62));

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => pick(e.nativeEvent.locationX),
        onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
        onPanResponderRelease: () => {
          setActive(null);
          onScrub?.(null);
        },
        onPanResponderTerminate: () => {
          setActive(null);
          onScrub?.(null);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candles, step]
  );

  function pick(x: number) {
    if (!candles.length || step <= 0) return;
    const i = Math.max(0, Math.min(candles.length - 1, Math.floor(x / step)));
    setActive(i);
    onScrub?.(candles[i]);
  }

  if (candles.length < 2 || width === 0) {
    // Still measure width on first paint so the chart can render once laid out.
    return <View onLayout={onLayout} style={{ height, width: "100%" }} />;
  }

  const last = candles[candles.length - 1];
  const gridLines = Array.from({ length: GRID + 1 }, (_, i) => lo + ((hi - lo) * i) / GRID);
  const activeCandle = active != null ? candles[active] : null;
  const activeX = active != null ? active * step + step / 2 : 0;

  return (
    <View onLayout={onLayout} style={{ height, width: "100%" }} {...pan.panHandlers}>
      <Svg width="100%" height={height}>
        {/* price grid + right-edge labels */}
        <G>
          {gridLines.map((p, i) => (
            <G key={i}>
              <Line x1={0} y1={y(p)} x2={plotW} y2={y(p)} stroke={colors.cardBorder} strokeWidth={1} opacity={0.5} />
              <SvgText x={width - 4} y={y(p) + 3} fill={colors.textFaint} fontSize={9} textAnchor="end">
                {fmtPrice(p)}
              </SvgText>
            </G>
          ))}
        </G>

        {/* candles */}
        <G>
          {candles.map((c, i) => {
            const cx = i * step + step / 2;
            const up = c.close >= c.open;
            const col = up ? colors.positive : colors.negative;
            const bodyTop = y(Math.max(c.open, c.close));
            const bodyBot = y(Math.min(c.open, c.close));
            return (
              <G key={i}>
                <Line x1={cx} y1={y(c.high)} x2={cx} y2={y(c.low)} stroke={col} strokeWidth={1} />
                <Rect
                  x={cx - bodyW / 2}
                  y={bodyTop}
                  width={bodyW}
                  height={Math.max(1, bodyBot - bodyTop)}
                  fill={col}
                />
              </G>
            );
          })}
        </G>

        {/* last-price line */}
        <Line x1={0} y1={y(last.close)} x2={plotW} y2={y(last.close)} stroke={colors.primary} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />

        {/* crosshair */}
        {activeCandle && (
          <G>
            <Line x1={activeX} y1={0} x2={activeX} y2={height} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="2 3" />
            <Line x1={0} y1={y(activeCandle.close)} x2={plotW} y2={y(activeCandle.close)} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="2 3" />
          </G>
        )}
      </Svg>
    </View>
  );
}
