import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { IconChip } from "../components/IconChip";
import { ENV, summarize, unreadKeys } from "../config/env";
import { webappUrl } from "../config/webapp";
import { openWebapp } from "../browser/openWebapp";
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

/**
 * Every configurable variable and what this build was given for it. Development only — a member has
 * no `.env`, no Metro and no way to act on any of it, which is the whole reason this app stopped
 * printing variable names into its own interface.
 *
 * Values are truncated by `summarize`, and the two that carry API keys report only their length.
 */
function EnvList() {
  const unread = unreadKeys();
  return (
    <View style={styles.envList}>
      {unread.length > 0 && (
        // Declared in env.json with no literal read in env.ts, so it reads as unset on the device no
        // matter what `.env` says. Silent by nature; loud here.
        <Text style={styles.envBroken}>
          No value is read for: {unread.join(", ")} — add a literal read in src/config/env.ts.
        </Text>
      )}
      {ENV.map((v) => (
        <View key={v.key} style={styles.envRow}>
          <Text style={styles.envKey} numberOfLines={1}>
            {v.key.replace("EXPO_PUBLIC_", "")}
          </Text>
          <Text
            style={[
              styles.envValue,
              !v.value.trim() && (v.tier === "release" ? styles.envMissing : styles.envUnset),
            ]}
            numberOfLines={1}
          >
            {summarize(v)}
          </Text>
        </View>
      ))}
      <Text style={styles.envFootnote}>
        Red is required for a release build and missing — `app.config.ts` refuses an EAS
        preview/production build in that state. Grey is unset and legitimately optional. See
        CONFIG.md.
      </Text>
    </View>
  );
}

export function MoreScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const [showEnv, setShowEnv] = useState(false);

  // Null when no web app is configured, which is what disables the rows below rather than a
  // separate flag — the link and the reason it works are the same value.
  const market = webappUrl("market");
  const issue = webappUrl("issue");

  /** Hand a web-app URL to the bridged browser. Shared with the empty Keys and Vault states. */
  const open = (url: string) => openWebapp(nav, url);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
    >
      <Text style={styles.header}>More</Text>

      {/* Nine unlabelled rows used to sit here, above the first heading — your wallet, the
          association, app tools and settings all in one list. Every group below was labelled, so
          the layout was implicitly saying those nine had nothing in common, which is exactly what
          it felt like. Sections now, short enough to scan.

          NO ACTIVITY ROW. The Wallet tab header already has a clock icon to the same screen
          (`HomeScreen.tsx`), and transaction history is wallet content rather than a menu item. */}
      <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>Your wallet</Text>
      <View style={styles.group}>
        <Row icon="wallet" label="Wallets & accounts" onPress={() => nav.navigate("Wallets")} />
        <View style={styles.divider} />
        {/* "Multisig treasury" until now, which read as a sibling of the Association treasury below
            and is nothing of the kind: this is a Squads multisig YOU operate. `.env.example` says it
            outright — the multisig "does NOT change the Global Goshens treasury view". Different
            section and a different noun, so the two can't be confused for each other again. */}
        <Row icon="people-circle" label="Multisig wallet" onPress={() => nav.navigate("Multisig")} />
        <View style={styles.divider} />
        <Row icon="book" label="Address book" onPress={() => nav.navigate("Contacts")} />
      </View>

      <Text style={styles.sectionTitle}>The Association</Text>
      <View style={styles.group}>
        {/* "Association" inside a section called The Association was noise. "Standing" is the word
            the rest of the app already uses for what this screen shows. */}
        <Row icon="ribbon" label="Your standing" onPress={() => nav.navigate("Association")} />
        <View style={styles.divider} />
        {/* The communal treasury — a view of the association's money, whose whole purpose is to be
            publicly verifiable (see `config/treasury.ts`). Named for whose money it is. */}
        <Row icon="business" label="Association treasury" onPress={() => nav.navigate("Treasury")} />
        <View style={styles.divider} />
        <Row icon="people" label="Governance" onPress={() => nav.navigate("Govern")} />
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

      <Text style={styles.sectionTitle}>App</Text>
      <View style={styles.group}>
        <Row icon="compass" label="Browser" onPress={() => nav.navigate("Browser")} />
        <View style={styles.divider} />
        <Row icon="settings" label="Settings" onPress={() => nav.navigate("Settings")} />
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
            {/* Gone entirely from a release build — see the route registration in App.tsx.
                `eye` rather than `ribbon`, which now belongs to Your standing; two rows wearing the
                same icon is the sort of small thing that makes a list feel arbitrary. */}
            <Row icon="eye" label="Deed preview" onPress={() => nav.navigate("DeedPreview")} />
            <View style={styles.divider} />
            {/* What this build was actually given. Every feature that reaches the network is gated
                on one of these, and until now the only way to find out one was unset was to use the
                feature and watch it not work. Inline rather than its own route: it is a list, it is
                read-only, and it should not outlive being useful. */}
            <Row
              icon="construct"
              label="Build configuration"
              onPress={() => setShowEnv((v) => !v)}
            />
            {showEnv && <EnvList />}
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
  /** The first heading follows the page title, which already carries its own gap below it. Without
   *  this it inherits the between-sections margin as well and opens a hole under "More". */
  sectionTitleFirst: { marginTop: 0 },
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
  envList: { paddingBottom: spacing(3), gap: spacing(1) },
  envRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  envKey: { flex: 1, color: colors.textMuted, fontSize: font.tiny, fontWeight: "700" },
  envValue: { flex: 1, color: colors.text, fontSize: font.tiny, textAlign: "right" },
  envUnset: { color: colors.textFaint },
  envMissing: { color: colors.negative, fontWeight: "700" },
  envBroken: { color: colors.negative, fontSize: font.tiny, marginBottom: spacing(2) },
  envFootnote: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(2) },
});
