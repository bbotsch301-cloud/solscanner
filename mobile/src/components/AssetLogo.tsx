/**
 * Coin artwork for off-chain treasury assets, which have no on-chain logo to fetch:
 *   - silver → a struck silver medallion
 *   - dinar  → a Central Bank of Iraq medallion
 *
 * These were hand-drawn SVGs (an "Ag" disc and a date-palm disc). They're now the real artwork,
 * shipped as trimmed, alpha-cut PNGs at 192px — enough for the 32–40pt they render at, even at 3x.
 * The API is unchanged, so every caller (Holding, allocation rows) keeps working as before.
 */
import { Image } from "expo-image";

// Metro asset imports; the ESM form would need a .png module declaration this project doesn't carry.
/* eslint-disable @typescript-eslint/no-require-imports */
const ART = {
  silver: require("../../assets/asset-silver.png") as number,
  dinar: require("../../assets/asset-dinar.png") as number,
};
/* eslint-enable @typescript-eslint/no-require-imports */

const ALT: Record<AssetIcon, string> = {
  silver: "Silver coin",
  dinar: "Iraqi dinar coin",
};

export type AssetIcon = "silver" | "dinar";

export function AssetLogo({ icon, size = 40 }: { icon: AssetIcon; size?: number }) {
  return (
    <Image
      source={ART[icon]}
      alt={ALT[icon]}
      style={{ width: size, height: size }}
      contentFit="contain"
      // Bundled assets are already local, so a fade would only ever be a flicker.
      transition={0}
    />
  );
}
