/**
 * The price chart, backed by TradingView's own lightweight-charts running in a WebView.
 *
 * The previous chart was hand-rolled SVG + PanResponder. It could pinch-zoom and long-press for a
 * crosshair, but the gestures people actually expect from a trading chart — drag the price axis to
 * rescale, drag the time axis to stretch time, momentum panning, adaptive time ticks — would each
 * have had to be built and tuned by hand. This is the library TradingView publishes for exactly
 * this, so those come for free and behave the way traders' muscle memory expects.
 *
 * It needs no native module (react-native-webview was already here) and the library is vendored as
 * a string, so there's no rebuild and no network fetch.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { chartHtml } from "./chartHtml";
import { haptics } from "../../ui/haptics";
import { colors } from "../../theme";
import type { Candle } from "../../prices/candles";

/** The candle under the crosshair, or null when the user isn't scrubbing. */
export interface ScrubPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

function toSeries(candles: Candle[]): string {
  // lightweight-charts wants Unix SECONDS (which is already Candle.time's unit), strictly
  // ascending and de-duplicated — it throws on out-of-order or repeated timestamps.
  const seen = new Set<number>();
  const rows = candles
    .map((c) => ({ time: Math.floor(c.time), open: c.open, high: c.high, low: c.low, close: c.close }))
    .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
    .sort((a, b) => a.time - b.time)
    .filter((c) => !seen.has(c.time) && (seen.add(c.time), true));
  return JSON.stringify(rows);
}

export const TradingViewChart = memo(function TradingViewChart({
  candles,
  height = 260,
  onScrub,
}: {
  candles: Candle[];
  height?: number;
  onScrub?: (p: ScrubPoint | null) => void;
}) {
  const ref = useRef<WebView | null>(null);
  const [ready, setReady] = useState(false);
  const scrubbing = useRef(false);

  // The page is static; only the data changes, so the HTML is built once and kept out of the
  // WebView's `source` dependency (changing source remounts and loses the user's zoom).
  const html = useMemo(() => chartHtml(), []);
  const series = useMemo(() => toSeries(candles), [candles]);

  // Push data whenever it changes (range switch, refresh) — but only once the page has booted,
  // otherwise `window.__chart` doesn't exist yet and the call is silently lost.
  useEffect(() => {
    if (!ready) return;
    ref.current?.injectJavaScript(`window.__chart && window.__chart.setData(${series}); true;`);
  }, [ready, series]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { type?: string; active?: boolean } & Partial<ScrubPoint>;
    try {
      m = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (m.type === "boot") {
      setReady(true);
      return;
    }
    if (m.type !== "cross" || !onScrub) return;
    if (m.active && m.time != null) {
      // A tick as the crosshair enters a candle, matching the old chart's feel.
      if (!scrubbing.current) {
        scrubbing.current = true;
        haptics.tap();
      }
      onScrub({ time: m.time, open: m.open!, high: m.high!, low: m.low!, close: m.close! });
    } else {
      scrubbing.current = false;
      onScrub(null);
    }
  };

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        ref={ref}
        source={{ html }}
        onMessage={onMessage}
        originWhitelist={["*"]}
        // Local content only — no navigation should ever happen from this page.
        onShouldStartLoadWithRequest={() => false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        androidLayerType="hardware"
        style={styles.web}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { width: "100%", overflow: "hidden", backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: "transparent" },
});
