import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";

/** The XGO gold coin mark. */
export function XGOLogo({ size = 96 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <LinearGradient
        colors={["#F7E3A1", "#E7B838", "#8A6A12"]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[
          styles.coin,
          { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size * 0.04) },
        ]}
      >
        <View
          style={[
            styles.innerRing,
            { width: size * 0.82, height: size * 0.82, borderRadius: size * 0.41, borderWidth: Math.max(1, size * 0.012) },
          ]}
        >
          <Text style={{ color: "#0A0A0C", fontWeight: "900", fontSize: size * 0.3, letterSpacing: size * 0.01 }}>
            XGO
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  coin: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#F7E3A1",
  },
  innerRing: {
    alignItems: "center",
    justifyContent: "center",
    borderColor: "#0A0A0C33",
  },
});
