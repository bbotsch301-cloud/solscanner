import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors } from "../theme";

// Ordered image candidates now live in solana/uri.ts alongside the ipfs://, ar:// and bare-CID
// handling — this local version only matched a /ipfs/<cid> path, so a bare ipfs:// URI never
// loaded. Re-exported here because callers (the Collection gallery, Artwork) import it from this
// module.
import { candidates } from "../solana/uri";
export { candidates };

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
        cachePolicy="memory-disk" // keep the downloaded logo on disk (persists across restarts)
        contentFit="cover"
        transition={120}
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
