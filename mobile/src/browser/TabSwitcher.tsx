/** Full-screen overlay to manage open browser tabs: select, close, or open a new one. */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../components/PressableScale";
import { colors, font, radius, spacing, weight } from "../theme";
import { hostOf } from "./dapps";
import type { TabState } from "./types";

// Deterministic accent per tab so its letter-avatar is stable across renders (same palette as
// the Discover home so the two browser surfaces feel like one system).
const PALETTE = [colors.primary, colors.accent, colors.positive, "#7C9CF5", "#C77DFF", "#F58A7C"];
function accentFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function TabSwitcher({
  visible,
  tabs,
  activeId,
  onSelect,
  onClose,
  onNewTab,
  onDone,
}: {
  visible: boolean;
  tabs: TabState[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewTab: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDone}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
        <View style={styles.topBar}>
          <Text style={styles.title}>{tabs.length} tab{tabs.length === 1 ? "" : "s"}</Text>
          <Pressable onPress={onDone} hitSlop={12}>
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(6) }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            {tabs.map((t) => {
              const host = hostOf(t.currentUrl || t.uri);
              const title = t.title || host || "New tab";
              const active = t.id === activeId;
              const accent = accentFor(host || t.id);
              const letter = (host || title).slice(0, 1).toUpperCase();
              return (
                <PressableScale key={t.id} onPress={() => onSelect(t.id)} style={[styles.card, active && styles.cardActive]}>
                  <Pressable onPress={() => onClose(t.id)} hitSlop={10} style={styles.closeBtn}>
                    <Ionicons name="close" size={16} color={colors.textMuted} />
                  </Pressable>
                  <View style={[styles.avatar, { backgroundColor: accent + "33", borderColor: accent }]}>
                    <Text style={[styles.avatarText, { color: accent }]}>{letter}</Text>
                  </View>
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
                    <Text style={styles.cardHost} numberOfLines={1}>{host || "Discover"}</Text>
                  </View>
                </PressableScale>
              );
            })}
            <PressableScale onPress={onNewTab} style={[styles.card, styles.newTab]}>
              <Ionicons name="add" size={26} color={colors.primary} />
              <Text style={styles.newTabText}>New tab</Text>
            </PressableScale>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const CARD_MIN_HEIGHT = 128;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing(5), paddingBottom: spacing(2) },
  title: { color: colors.text, fontSize: font.h3, fontWeight: weight.bold },
  done: { color: colors.primary, fontSize: font.body, fontWeight: weight.bold },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3) },
  card: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: CARD_MIN_HEIGHT,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    justifyContent: "space-between",
  },
  cardActive: { borderColor: colors.primary, backgroundColor: colors.primary + "12" },
  closeBtn: { position: "absolute", top: spacing(2), right: spacing(2), padding: spacing(1), zIndex: 1 },
  avatar: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: font.h3, fontWeight: weight.bold },
  cardMeta: { gap: 2, marginTop: spacing(3) },
  cardTitle: { color: colors.text, fontSize: font.body, fontWeight: weight.semibold },
  cardHost: { color: colors.textMuted, fontSize: font.small },
  newTab: { alignItems: "center", justifyContent: "center", gap: spacing(2), borderStyle: "dashed", borderColor: colors.cardBorder },
  newTabText: { color: colors.primary, fontSize: font.body, fontWeight: weight.bold },
});
