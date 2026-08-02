/**
 * Shown for a blank tab: featured dApps, the user's favorites, and recent history. Tapping any
 * entry navigates the active tab there.
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../components/PressableScale";
import { colors, font, radius, spacing } from "../theme";
import { FEATURED, hostOf, listFavorites, listHistory, type DappChain } from "./dapps";

const CHAIN_LABEL: Record<DappChain, string> = { solana: "Solana", evm: "EVM", multi: "Multi-chain" };
const letterColor = (s: string) => {
  const palette = [colors.primary, colors.accent, colors.positive, "#7C9CF5", "#C77DFF", "#F58A7C"];
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
};

function Tile({ title, subtitle, badge, onPress }: { title: string; subtitle: string; badge?: string; onPress: () => void }) {
  const letter = title.slice(0, 1).toUpperCase();
  return (
    <PressableScale onPress={onPress} style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: letterColor(title) + "33", borderColor: letterColor(title) }]}>
        <Text style={[styles.avatarText, { color: letterColor(title) }]}>{letter}</Text>
      </View>
      <View style={styles.rowMid}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {badge && <Text style={styles.badge}>{badge}</Text>}
    </PressableScale>
  );
}

export function DiscoverHome({ onOpen, rev }: { onOpen: (url: string) => void; rev: number }) {
  void rev; // re-render when favorites/history change
  const favorites = listFavorites();
  const history = listHistory().slice(0, 8);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing(4), paddingBottom: spacing(10) }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}>
        <Ionicons name="compass" size={26} color={colors.primary} />
        <Text style={styles.heroTitle}>Discover dApps</Text>
        <Text style={styles.heroSub}>Connect your XGO wallet to apps across Solana, Ethereum & BNB Chain.</Text>
      </View>

      {favorites.length > 0 && (
        <>
          <Text style={styles.section}>Favorites</Text>
          <View style={styles.group}>
            {favorites.map((f, i) => (
              <View key={f.url}>
                {i > 0 && <View style={styles.divider} />}
                <Tile title={f.title || hostOf(f.url)} subtitle={hostOf(f.url)} onPress={() => onOpen(f.url)} />
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.section}>Featured</Text>
      <View style={styles.group}>
        {FEATURED.map((d, i) => (
          <View key={d.url}>
            {i > 0 && <View style={styles.divider} />}
            <Tile title={d.name} subtitle={d.blurb} badge={CHAIN_LABEL[d.chain]} onPress={() => onOpen(d.url)} />
          </View>
        ))}
      </View>

      {history.length > 0 && (
        <>
          <Text style={styles.section}>Recent</Text>
          <View style={styles.group}>
            {history.map((h, i) => (
              <View key={`${h.url}:${i}`}>
                {i > 0 && <View style={styles.divider} />}
                <Tile title={h.title || hostOf(h.url)} subtitle={hostOf(h.url)} onPress={() => onOpen(h.url)} />
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { alignItems: "center", gap: spacing(1), paddingVertical: spacing(5) },
  heroTitle: { color: colors.text, fontSize: font.h2, fontWeight: "900", marginTop: spacing(1) },
  heroSub: { color: colors.textMuted, fontSize: font.small, textAlign: "center", lineHeight: 19, paddingHorizontal: spacing(4) },
  section: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginTop: spacing(5), marginBottom: spacing(2) },
  group: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing(4) },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  avatar: { width: 38, height: 38, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: font.body, fontWeight: "900" },
  rowMid: { flex: 1, gap: 2 },
  rowTitle: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  rowSub: { color: colors.textMuted, fontSize: font.small },
  badge: { color: colors.textFaint, fontSize: font.tiny, fontWeight: "700" },
});
