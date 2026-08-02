/** A gold crown mark for the "Kingdom Economy" brand — self-contained SVG (react-native-svg,
 *  same dep as the pie/asset logos), so there's no image asset to ship. All gold, ringed by the
 *  twelve biblical gemstones (the foundation stones of the New Jerusalem, Revelation 21:19-20). */
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors } from "../theme";

// The twelve foundation stones, in order (Rev 21:19-20): jasper, sapphire, chalcedony, emerald,
// sardonyx, sardius, chrysolite, beryl, topaz, chrysoprase, jacinth, amethyst.
const GEMS = [
  "#2E8B57", // jasper (green)
  "#1E5FBF", // sapphire (blue)
  "#7FB7BE", // chalcedony (pale blue)
  "#2FA84F", // emerald (green)
  "#C97B63", // sardonyx (banded red)
  "#B5202E", // sardius (red)
  "#C9B037", // chrysolite (gold-yellow)
  "#3FC7A8", // beryl (aqua)
  "#F0C93B", // topaz (yellow)
  "#6FBF3F", // chrysoprase (green)
  "#E07B39", // jacinth (orange)
  "#8E5AA8", // amethyst (purple)
];
const GEM_STROKE = "#5A430B";

export function Crown({ size = 96 }: { size?: number }) {
  // Twelve gemstones set in a row around the band — one for each foundation stone.
  const bandGems = GEMS.map((fill, i) => ({ cx: 16 + i * 8, cy: 80, r: 3, fill }));
  // Three larger stones crowning the peaks.
  const peakGems = [
    { cx: 27, cy: 30, r: 6, fill: GEMS[1] }, // sapphire
    { cx: 60, cy: 20, r: 7, fill: GEMS[5] }, // sardius (ruby)
    { cx: 93, cy: 30, r: 6, fill: GEMS[3] }, // emerald
  ];
  return (
    <Svg width={size} height={size * 0.84} viewBox="0 0 120 100">
      <Defs>
        <RadialGradient id="crownGold" cx="42%" cy="30%" r="80%">
          <Stop offset="0%" stopColor="#FBE9C1" />
          <Stop offset="55%" stopColor={colors.primary} />
          <Stop offset="100%" stopColor="#8A6A12" />
        </RadialGradient>
      </Defs>
      {/* spiked top — all gold */}
      <Path
        d="M12 74 L27 30 L45 56 L60 20 L75 56 L93 30 L108 74 Z"
        fill="url(#crownGold)"
        stroke="#6E540E"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {/* base band — all gold */}
      <Rect x="12" y="70" width="96" height="20" rx="5" fill="url(#crownGold)" stroke="#6E540E" strokeWidth={2.5} />
      {/* the twelve foundation stones around the band */}
      {bandGems.map((g, i) => (
        <Circle key={`b${i}`} cx={g.cx} cy={g.cy} r={g.r} fill={g.fill} stroke={GEM_STROKE} strokeWidth={0.8} />
      ))}
      {/* crowning stones on the peaks */}
      {peakGems.map((g, i) => (
        <Circle key={`p${i}`} cx={g.cx} cy={g.cy} r={g.r} fill={g.fill} stroke={GEM_STROKE} strokeWidth={1.5} />
      ))}
    </Svg>
  );
}
