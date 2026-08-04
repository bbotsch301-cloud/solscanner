import { useNavigation } from "@react-navigation/native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { IconChip } from "../components/IconChip";
import { webappUrl } from "../config/webapp";
import { requestBrowserUrl } from "../browser/openRequest";
import { haptics } from "../ui/haptics";
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

  // Null when no web app is configured, which is what disables the rows below rather than a
  // separate flag — the link and the reason it works are the same value.
  const market = webappUrl("market");
  const issue = webappUrl("issue");

  /** Hand a web-app URL to the bridged browser. Same handoff a portal Key already uses. */
  const open = (url: string) => {
    haptics.tap();
    requestBrowserUrl(url);
    nav.navigate("Browser");
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
    >
      <Text style={styles.header}>More</Text>

      <View style={styles.group}>
        <Row icon="ribbon" label="Association" onPress={() => nav.navigate("Association")} />
        <View style={styles.divider} />
        <Row icon="business" label="Treasury" onPress={() => nav.navigate("Treasury")} />
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

      {/* The half of the system that isn't this app. The wallet holds keys and proves what you own;
          buying, browsing communities and issuing all happen on the web app, and land back here as
          Keys. So these open it in the bridged browser rather than being rebuilt inside a wallet.

          Both stay disabled until a web-app URL is configured. A row that goes nowhere is the thing
          this replaced — "Impact" and "Marketplace" sat here hard-coded as "Coming soon" pointing at
          nothing — so a row that can't work says so rather than failing on tap. */}
      <Text style={styles.sectionTitle}>Goshen</Text>
      <View style={styles.group}>
        <Row icon="storefront" label="Marketplace" soon={!market} onPress={() => market && open(market)} />
        <View style={styles.divider} />
        {/* The wallet has no issuing surface by design — it never holds a key it didn't earn the
            right to hold. A creator goes to the web app, signs there, and the key arrives here. */}
        <Row icon="add-circle" label="Issue a Key" soon={!issue} onPress={() => issue && open(issue)} />
      </View>

      <Text style={styles.sectionTitle}>Legal</Text>
      <View style={styles.group}>
        {/* The way in to the agreement records — and to signing the ones made before a wallet
            existed. The screen was built and routed but nothing ever navigated to it, so every
            first-run acceptance stayed permanently unsigned. */}
        <Row icon="create" label="Agreements" onPress={() => nav.navigate("Agreements")} />
        <View style={styles.divider} />
        <Row icon="shield-checkmark" label="How your keys are protected" onPress={() => nav.navigate("Legal", { doc: "security" })} />
        <View style={styles.divider} />
        <Row icon="lock-closed" label="Privacy Policy" onPress={() => nav.navigate("Legal", { doc: "privacy" })} />
        <View style={styles.divider} />
        <Row icon="document-text" label="Terms of Service" onPress={() => nav.navigate("Legal", { doc: "terms" })} />
      </View>

      {__DEV__ && (
        <>
          <Text style={styles.sectionTitle}>Development</Text>
          <View style={styles.group}>
            {/* Gone entirely from a release build — see the route registration in App.tsx. */}
            <Row icon="ribbon" label="Deed preview" onPress={() => nav.navigate("DeedPreview")} />
          </View>
        </>
      )}
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
