/** Full-screen warning shown when a navigation is stopped by the phishing/scam domain blocklist. */
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../components/PressableScale";
import { colors, font, radius, spacing } from "../theme";
import { hostOf } from "./dapps";

export function BlockInterstitial({ url, onBack, onProceed }: { url: string; onBack: () => void; onProceed: () => void }) {
  return (
    <View style={styles.screen}>
      <View style={styles.iconWrap}>
        <Ionicons name="warning" size={40} color={colors.negative} />
      </View>
      <Text style={styles.title}>Dangerous site blocked</Text>
      <Text style={styles.host}>{hostOf(url)}</Text>
      <Text style={styles.body}>
        This site has been reported for phishing or scams that try to drain wallets. We stopped it
        from loading to protect your funds.
      </Text>
      <PressableScale onPress={onBack} style={styles.safeBtn}>
        <Text style={styles.safeText}>Back to safety</Text>
      </PressableScale>
      <PressableScale onPress={onProceed} style={styles.proceedBtn}>
        <Text style={styles.proceedText}>Proceed anyway (dangerous)</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", padding: spacing(6), gap: spacing(3) },
  iconWrap: { width: 76, height: 76, borderRadius: radius.pill, backgroundColor: colors.negative + "22", alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "900", textAlign: "center" },
  host: { color: colors.negative, fontSize: font.body, fontWeight: "800" },
  body: { color: colors.textMuted, fontSize: font.body, textAlign: "center", lineHeight: 22, marginBottom: spacing(2) },
  safeBtn: { backgroundColor: colors.primary, paddingVertical: spacing(4), paddingHorizontal: spacing(8), borderRadius: radius.pill, alignItems: "center", alignSelf: "stretch" },
  safeText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  proceedBtn: { paddingVertical: spacing(3), alignItems: "center" },
  proceedText: { color: colors.textFaint, fontSize: font.small, fontWeight: "700" },
});
