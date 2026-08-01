/**
 * Custom SVG "coin" logos for off-chain treasury assets that have no on-chain logo:
 *   - silver → a brushed-metal medallion stamped "Ag" (the element)
 *   - dinar  → a gold medallion with a date palm (Iraq's national emblem)
 * Self-contained (react-native-svg, same dep as PieChart) — no image assets to ship.
 */
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop, Text as SvgText } from "react-native-svg";

export type AssetIcon = "silver" | "dinar";

export function AssetLogo({ icon, size = 40 }: { icon: AssetIcon; size?: number }) {
  return icon === "silver" ? <SilverCoin size={size} /> : <DinarCoin size={size} />;
}

function SilverCoin({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <RadialGradient id="agFace" cx="34%" cy="28%" r="78%">
          <Stop offset="0%" stopColor="#FCFDFE" />
          <Stop offset="55%" stopColor="#C9D1DB" />
          <Stop offset="100%" stopColor="#8F98A7" />
        </RadialGradient>
      </Defs>
      <Circle cx="20" cy="20" r="19" fill="url(#agFace)" stroke="#79828F" strokeWidth="1.4" />
      <Circle cx="20" cy="20" r="15.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1" />
      {/* top-left gleam */}
      <Path d="M9 13.6 A12.6 12.6 0 0 1 21 7.1" fill="none" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="1.8" strokeLinecap="round" />
      <SvgText x="20" y="25.6" fontSize="14.5" fontWeight="800" fill="#2C3542" textAnchor="middle">
        Ag
      </SvgText>
    </Svg>
  );
}

function DinarCoin({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Defs>
        <RadialGradient id="iqdFace" cx="34%" cy="28%" r="82%">
          <Stop offset="0%" stopColor="#FBE9C1" />
          <Stop offset="55%" stopColor="#E7B838" />
          <Stop offset="100%" stopColor="#8A6A12" />
        </RadialGradient>
      </Defs>
      <Circle cx="20" cy="20" r="19" fill="url(#iqdFace)" stroke="#6E540E" strokeWidth="1.4" />
      <Circle cx="20" cy="20" r="15.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.28" strokeWidth="1" />
      {/* date palm — trunk + fronds */}
      <G stroke="#5A430C" strokeWidth="1.9" strokeLinecap="round" fill="none">
        <Path d="M20 29 Q19.3 23 20 17" />
        <Path d="M20 17 Q13 15.5 8.5 19.5" />
        <Path d="M20 17 Q13.5 12 9.5 12.5" />
        <Path d="M20 17 Q17 9.5 13.5 8" />
        <Path d="M20 17 Q23 9.5 26.5 8" />
        <Path d="M20 17 Q26.5 12 30.5 12.5" />
        <Path d="M20 17 Q27 15.5 31.5 19.5" />
        <Path d="M14 30 Q20 32.4 26 30" strokeWidth="1.6" />
      </G>
      {/* dates at the crown */}
      <Circle cx="20" cy="15.4" r="1.05" fill="#5A430C" />
      <Circle cx="17.3" cy="16.4" r="0.9" fill="#5A430C" />
      <Circle cx="22.7" cy="16.4" r="0.9" fill="#5A430C" />
    </Svg>
  );
}
