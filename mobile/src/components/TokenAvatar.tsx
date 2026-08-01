import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

// Fallback IPFS gateways, tried in order if the resolved one fails to load on-device.
const IPFS_GATEWAYS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://nftstorage.link/ipfs/"];

/** Ordered image candidates for a logo. For an IPFS URL that's every gateway (in case one is
 *  down); for a normal CDN URL it's just that URL. Exhausting the list → the text badge. */
function candidates(logoURI?: string): string[] {
  if (!logoURI) return [];
  const cid = logoURI.match(/\/ipfs\/([^?#]+)/i)?.[1];
  if (!cid) return [logoURI];
  const rest = IPFS_GATEWAYS.map((g) => g + cid).filter((u) => u !== logoURI);
  return [logoURI, ...rest];
}

export function TokenAvatar({
  symbol,
  color,
  size = 40,
  logoURI,
}: {
  symbol: string;
  color: string;
  size?: number;
  logoURI?: string;
}) {
  const sources = candidates(logoURI);
  const [idx, setIdx] = useState(0);
  const src = sources[idx];

  if (src) {
    return (
      <Image
        source={{ uri: src }}
        onError={() => setIdx((i) => i + 1)}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bgElevated }}
      />
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color + "22", borderColor: color + "55" },
      ]}
    >
      <Text style={[styles.text, { color, fontSize: size * 0.34 }]}>
        {symbol.slice(0, 3)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  text: { fontWeight: "800", color: colors.text },
});
