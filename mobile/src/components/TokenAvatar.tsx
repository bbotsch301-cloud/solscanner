import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

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
  const [failed, setFailed] = useState(false);

  if (logoURI && !failed) {
    return (
      <Image
        source={{ uri: logoURI }}
        onError={() => setFailed(true)}
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
