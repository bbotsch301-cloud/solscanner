import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "../components/TokenAvatar";
import { XGO_FEES } from "../config/xgo";
import { colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

const USDC_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png";

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, muted && { color: colors.textMuted }]}>{value}</Text>
    </View>
  );
}

export function BuyScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const [pay, setPay] = useState("");

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing(2) }]}>
        <Text style={styles.title}>Buy XGO</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }} keyboardShouldPersistTaps="handled">
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>You pay</Text>
          <View style={styles.payRow}>
            <TextInput
              value={pay}
              onChangeText={setPay}
              placeholder="0"
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
              style={styles.payInput}
            />
            <View style={styles.assetPill}>
              <TokenAvatar symbol="USDC" color={colors.primary} size={22} logoURI={USDC_LOGO} />
              <Text style={styles.assetText}>USDC</Text>
            </View>
          </View>
        </View>

        <View style={styles.arrow}>
          <Ionicons name="arrow-down" size={18} color={colors.primary} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelLabel}>You receive</Text>
          <View style={styles.payRow}>
            <Text style={styles.receive}>—</Text>
            <View style={styles.assetPill}>
              <TokenAvatar symbol="XGO" color={colors.primary} size={22} />
              <Text style={styles.assetText}>XGO</Text>
            </View>
          </View>
          <Text style={styles.rate}>Pricing available when XGO lists on mainnet.</Text>
        </View>

        <View style={styles.details}>
          <View style={styles.poweredRow}>
            <Ionicons name="flash" size={14} color={colors.primary} />
            <Text style={styles.powered}>Powered by Jupiter</Text>
          </View>
          <Row label="XGO Protocol Assessment" value={`${XGO_FEES.protocolAssessment.toFixed(2)}%`} />
          <Row label="Treasury Allocation" value={`${XGO_FEES.treasuryAllocation.toFixed(2)}%`} />
          <Row label="Permanent Burn" value={`${XGO_FEES.permanentBurn.toFixed(2)}%`} />
          <Row label="Network fee" value="~$0.02" muted />
        </View>

        <View style={styles.banner}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={styles.bannerText}>
            Buying opens when XGO lists on mainnet. The breakdown above is how value
            flows on every XGO trade.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing(3) }]}>
        <View style={[styles.primaryBtn, styles.primaryDisabled]}>
          <Text style={styles.primaryTextDisabled}>Review Order · available on mainnet</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing(4), paddingBottom: spacing(2) },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  panel: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4), gap: spacing(2) },
  panelLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  payRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  payInput: { flex: 1, color: colors.text, fontSize: font.h1, fontWeight: "800", padding: 0 },
  receive: { flex: 1, color: colors.text, fontSize: font.h1, fontWeight: "800" },
  assetPill: { flexDirection: "row", alignItems: "center", gap: spacing(2), backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing(3), paddingVertical: spacing(2), borderRadius: radius.pill },
  assetText: { color: colors.text, fontSize: font.body, fontWeight: "800" },
  rate: { color: colors.textMuted, fontSize: font.small },
  arrow: { alignSelf: "center", width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, alignItems: "center", justifyContent: "center", marginVertical: -spacing(1) },
  details: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4), gap: spacing(2) },
  poweredRow: { flexDirection: "row", alignItems: "center", gap: spacing(1.5), marginBottom: spacing(1) },
  powered: { color: colors.primary, fontSize: font.small, fontWeight: "700" },
  detailRow: { flexDirection: "row", justifyContent: "space-between" },
  detailLabel: { color: colors.textMuted, fontSize: font.small },
  detailValue: { color: colors.text, fontSize: font.small, fontWeight: "700" },
  banner: { flexDirection: "row", gap: spacing(2), backgroundColor: colors.primary + "14", borderRadius: radius.md, padding: spacing(4) },
  bannerText: { flex: 1, color: colors.primary, fontSize: font.small, lineHeight: 18 },
  footer: { paddingHorizontal: spacing(4), paddingTop: spacing(3), borderTopWidth: 1, borderTopColor: colors.cardBorder },
  primaryBtn: { paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center" },
  primaryDisabled: { backgroundColor: colors.card },
  primaryTextDisabled: { color: colors.textMuted, fontSize: font.h3, fontWeight: "800" },
});
