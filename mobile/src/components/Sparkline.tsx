import Svg, { Polyline } from "react-native-svg";
import { colors } from "../theme";

/** Lightweight price sparkline — a single polyline, no chart library. */
export function Sparkline({
  data,
  height = 80,
  color,
}: {
  data: number[];
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;
  const W = 300;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${height - ((v - min) / range) * height}`)
    .join(" ");
  const up = data[data.length - 1] >= data[0];
  const stroke = color ?? (up ? colors.positive : colors.negative);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
      <Polyline points={points} fill="none" stroke={stroke} strokeWidth={2} />
    </Svg>
  );
}
