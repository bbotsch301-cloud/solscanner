/** A gold crown mark for the "Kingdom Economy" brand — self-contained SVG (react-native-svg,
 *  same dep as the pie/asset logos), so there's no image asset to ship. */
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { colors } from "../theme";

export function Crown({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.84} viewBox="0 0 120 100">
      <Defs>
        <RadialGradient id="crownGold" cx="42%" cy="30%" r="80%">
          <Stop offset="0%" stopColor="#FBE9C1" />
          <Stop offset="55%" stopColor={colors.primary} />
          <Stop offset="100%" stopColor="#8A6A12" />
        </RadialGradient>
      </Defs>
      {/* spiked top */}
      <Path
        d="M12 74 L27 30 L45 56 L60 20 L75 56 L93 30 L108 74 Z"
        fill="url(#crownGold)"
        stroke="#6E540E"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {/* base band */}
      <Rect x="12" y="70" width="96" height="20" rx="5" fill="url(#crownGold)" stroke="#6E540E" strokeWidth={2.5} />
      {/* jewels at the peaks */}
      <Circle cx="27" cy="30" r="5" fill={colors.accent} stroke="#6E540E" strokeWidth={1.5} />
      <Circle cx="60" cy="20" r="6.5" fill="#B5202E" stroke="#6E540E" strokeWidth={1.5} />
      <Circle cx="93" cy="30" r="5" fill={colors.accent} stroke="#6E540E" strokeWidth={1.5} />
      {/* jewels on the band */}
      <Circle cx="40" cy="80" r="4" fill="#B5202E" stroke="#6E540E" strokeWidth={1.2} />
      <Circle cx="60" cy="80" r="4.5" fill={colors.accent} stroke="#6E540E" strokeWidth={1.2} />
      <Circle cx="80" cy="80" r="4" fill="#B5202E" stroke="#6E540E" strokeWidth={1.2} />
    </Svg>
  );
}
