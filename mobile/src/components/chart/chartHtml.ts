/**
 * The page that runs inside the chart WebView.
 *
 * Everything is inlined — the vendored library, the CSS, the bootstrap — so the WebView has no
 * network dependency and paints as soon as it mounts. The RN side talks to it by evaluating
 * `window.__chart.*` (see TradingViewChart.tsx); the page talks back over `ReactNativeWebView
 * .postMessage` with the crosshair readout, so the price/date scrub can be rendered in native text
 * above the chart rather than in the page.
 */
import { LIGHTWEIGHT_CHARTS_JS } from "./vendorLightweightCharts";
import { colors } from "../../theme";

export interface ChartTheme {
  up: string;
  down: string;
  bg: string;
  text: string;
  grid: string;
  crosshair: string;
}

export const CHART_THEME: ChartTheme = {
  up: colors.positive,
  down: colors.negative,
  bg: colors.bg,
  text: colors.textMuted,
  grid: colors.cardBorder,
  crosshair: colors.primary,
};

export function chartHtml(theme: ChartTheme = CHART_THEME): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<style>
  html, body { margin:0; padding:0; height:100%; background:${theme.bg}; overflow:hidden; }
  #c { position:absolute; inset:0; }
  /* The chart owns all touch handling; stop the WebView from also scrolling or text-selecting. */
  * { -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent; }
</style>
</head>
<body>
<div id="c"></div>
<script>${LIGHTWEIGHT_CHARTS_JS}</script>
<script>
(function () {
  var post = function (m) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m));
  };

  var chart = LightweightCharts.createChart(document.getElementById('c'), {
    layout: { background: { color: '${theme.bg}' }, textColor: '${theme.text}', attributionLogo: false },
    grid: { vertLines: { color: '${theme.grid}' }, horzLines: { color: '${theme.grid}' } },
    rightPriceScale: { borderColor: '${theme.grid}', scaleMargins: { top: 0.12, bottom: 0.12 } },
    timeScale: { borderColor: '${theme.grid}', timeVisible: true, secondsVisible: false, rightOffset: 4 },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: '${theme.crosshair}', width: 1, style: 2, labelBackgroundColor: '${theme.crosshair}' },
      horzLine: { color: '${theme.crosshair}', width: 1, style: 2, labelBackgroundColor: '${theme.crosshair}' }
    },
    // The gestures the native SVG chart could never really do: drag the price axis to rescale,
    // drag the time axis to zoom, pinch anywhere, two-finger vertical scale.
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    handleScale: {
      axisPressedMouseMove: { time: true, price: true },
      axisDoubleClickReset: true,
      mouseWheel: true,
      pinch: true
    },
    autoSize: true
  });

  var series = chart.addSeries(LightweightCharts.CandlestickSeries, {
    upColor: '${theme.up}', downColor: '${theme.down}',
    borderUpColor: '${theme.up}', borderDownColor: '${theme.down}',
    wickUpColor: '${theme.up}', wickDownColor: '${theme.down}'
  });

  // Prices here span from sub-cent memecoins to four-figure majors, so a fixed precision would
  // render most of them as 0.00. Pick precision from the magnitude of the data itself.
  function applyPrecision(data) {
    var lo = Infinity;
    for (var i = 0; i < data.length; i++) if (data[i].low > 0 && data[i].low < lo) lo = data[i].low;
    if (!isFinite(lo)) return;
    var p = lo >= 100 ? 2 : lo >= 1 ? 4 : lo >= 0.01 ? 6 : lo >= 0.0001 ? 8 : 10;
    series.applyOptions({ priceFormat: { type: 'price', precision: p, minMove: Math.pow(10, -p) } });
  }

  window.__chart = {
    setData: function (data) {
      // Anything thrown in here used to vanish — injectJavaScript swallows it — and the user was
      // left looking at an empty rectangle with no way to tell a bug from a token with no market.
      try {
        applyPrecision(data);
        series.setData(data);
        chart.timeScale().fitContent();
        post({ type: 'ready', count: data.length });
      } catch (e) {
        post({ type: 'error', message: String((e && e.message) || e) });
      }
    },
    fit: function () { chart.timeScale().fitContent(); },
    resetScale: function () { chart.priceScale('right').applyOptions({ autoScale: true }); chart.timeScale().fitContent(); }
  };

  // Crosshair readout → native. Sent on every move so the header can show the scrubbed candle;
  // an empty payload (finger lifted / off-chart) tells native to fall back to the latest price.
  chart.subscribeCrosshairMove(function (param) {
    if (!param || !param.time || !param.seriesData) { post({ type: 'cross', active: false }); return; }
    var d = param.seriesData.get(series);
    if (!d) { post({ type: 'cross', active: false }); return; }
    post({ type: 'cross', active: true, time: param.time, open: d.open, high: d.high, low: d.low, close: d.close });
  });

  post({ type: 'boot' });
})();
window.onerror = function (msg) {
  try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: String(msg) })); } catch (e) {}
};
</script>
</body>
</html>`;
}
