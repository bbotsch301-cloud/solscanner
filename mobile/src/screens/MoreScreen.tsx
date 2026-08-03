import { useNavigation } from "@react-navigation/native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { IconChip } from "../components/IconChip";
import { colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

function Row({
  icon,
  label,
  soon,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  soon?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={soon ? undefined : onPress}
      style={({ pressed }) => [styles.row, pressed && !soon && { opacity: 0.6 }]}
    >
      <IconChip icon={icon} color={soon ? colors.textFaint : colors.primary} size={36} />
      <Text style={[styles.rowLabel, soon && { color: colors.textFaint }]}>{label}</Text>
      {soon ? (
        <Text style={styles.soon}>Coming soon</Text>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
      )}
    </Pressable>
  );
}

export function MoreScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
    >
      <Text style={styles.header}>More</Text>

      <View style={styles.group}>
        <Row icon="ribbon" label="Association" onPress={() => nav.navigate("Association")} />
        <View style={styles.divider} />
        <Row icon="wallet" label="Wallets & accounts" onPress={() => nav.navigate("Wallets")} />
        <View style={styles.divider} />
        <Row icon="compass" label="Browser" onPress={() => nav.navigate("Browser")} />
        <View style={styles.divider} />
        <Row icon="book" label="Address book" onPress={() => nav.navigate("Contacts")} />
        <View style={styles.divider} />
        <Row icon="people-circle" label="Multisig treasury" onPress={() => nav.navigate("Multisig")} />
        <View style={styles.divider} />
        <Row icon="people" label="Governance" onPress={() => nav.navigate("Govern")} />
        <View style={styles.divider} />
        <Row icon="time" label="Activity" onPress={() => nav.navigate("Activity")} />
        <View style={styles.divider} />
        <Row icon="settings" label="Settings" onPress={() => nav.navigate("Settings")} />
      </View>

      <Text style={styles.sectionTitle}>Ecosystem</Text>
      <View style={styles.group}>
        <Row icon="heart" label="Impact" soon />
        <View style={styles.divider} />
        <Row icon="storefront" label="Marketplace" soon />
      </View>

      <Text style={styles.sectionTitle}>Legal</Text>
      <View style={styles.group}>
        <Row icon="shield-checkmark" label="How your keys are protected" onPress={() => nav.navigate("Legal", { doc: "security" })} />
        <View style={styles.divider} />
        <Row icon="lock-closed" label="Privacy Policy" onPress={() => nav.navigate("Legal", { doc: "privacy" })} />
        <View style={styles.divider} />
        <Row icon="document-text" label="Terms of Service" onPress={() => nav.navigate("Legal", { doc: "terms" })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { color: colors.text, fontSize: font.h1, fontWeight: "900", marginBottom: spacing(4) },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(6),
    marginBottom: spacing(2),
  },
  group: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3.5) },
  rowLabel: { flex: 1, color: colors.text, fontSize: font.body, fontWeight: "600" },
  soon: { color: colors.textFaint, fontSize: font.small },
  divider: { height: 1, backgroundColor: colors.cardBorder },
});
