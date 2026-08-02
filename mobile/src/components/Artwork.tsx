/**
 * NFT/collectible artwork with the same IPFS gateway-fallback behavior as token logos: try each
 * candidate URL in order, and if all fail (or there's no image) show a gold placeholder with the
 * item's initial. Square by default — the gallery and detail views size it via `style`.
 */
import { useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { candidates } from "./TokenAvatar";
import { colors, font, weight } from "../theme";

export function Artwork({
  uri,
  name,
  style,
  radius = 12,
}: {
  uri?: string;
  name: string;
  style?: StyleProp<ViewStyle>;
  radius?: number;
}) {
  const sources = candidates(uri);
  const [idx, setIdx] = useState(0);
  const src = sources[idx];

  if (src) {
    return (
      <Image
        source={{ uri: src }}
        alt={name}
        onError={() => setIdx((i) => i + 1)}
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={150}
        style={[styles.base, { borderRadius: radius }, style as object]}
      />
    );
  }
  return (
    <View style={[styles.base, styles.fallback, { borderRadius: radius }, style]}>
      <Text style={styles.letter}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { width: "100%", aspectRatio: 1, backgroundColor: colors.bgElevated },
  fallback: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.cardBorder },
  letter: { color: colors.primary, fontSize: font.h1, fontWeight: weight.black },
});
