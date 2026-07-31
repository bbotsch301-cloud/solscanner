import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from "react-native-svg";

/** A friendly ghost mark, in spirit of Phantom. */
export function GhostLogo({ size = 96 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="ghost" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#7A6FD6" />
          <Stop offset="1" stopColor="#AB9FF2" />
        </LinearGradient>
      </Defs>
      <Path
        d="M50 10 C29 10 15 26 15 47 L15 84 C15 88 19 90 22 87 L30 80 L38 87 C40 89 43 89 45 87 L50 82 L55 87 C57 89 60 89 62 87 L70 80 L78 87 C81 90 85 88 85 84 L85 47 C85 26 71 10 50 10 Z"
        fill="url(#ghost)"
      />
      <Ellipse cx="39" cy="45" rx="5.5" ry="7" fill="#12121A" />
      <Ellipse cx="61" cy="45" rx="5.5" ry="7" fill="#12121A" />
    </Svg>
  );
}
