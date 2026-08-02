/** Full-screen overlay to manage open browser tabs: select, close, or open a new one. */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../components/PressableScale";
import { colors, font, radius, spacing } from "../theme";
import { hostOf } from "./dapps";
import type { TabState } from "./types";

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
        <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(3), paddingBottom: insets.bottom + spacing(6) }} showsVerticalScrollIndicator={false}>
          {tabs.map((t) => {
            const title = t.title || hostOf(t.currentUrl || t.uri) || "New tab";
            const host = hostOf(t.currentUrl || t.uri);
            return (
              <PressableScale key={t.id} onPress={() => onSelect(t.id)} style={[styles.card, t.id === activeId && styles.cardActive]}>
                <View style={styles.cardMid}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={styles.cardHost} numberOfLines={1}>
                    {host || "Discover"}
                  </Text>
                </View>
                <Pressable onPress={() => onClose(t.id)} hitSlop={10} style={styles.closeBtn}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </PressableScale>
            );
          })}
          <PressableScale onPress={onNewTab} style={styles.newTab}>
            <Ionicons name="add" size={20} color={colors.primary} />
            <Text style={styles.newTabText}>New tab</Text>
          </PressableScale>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing(5), paddingBottom: spacing(2) },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  done: { color: colors.primary, fontSize: font.body, fontWeight: "800" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4) },
  cardActive: { borderColor: colors.primary },
  cardMid: { flex: 1, gap: 2 },
  cardTitle: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  cardHost: { color: colors.textMuted, fontSize: font.small },
  closeBtn: { padding: spacing(1) },
  newTab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), paddingVertical: spacing(4), borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder, borderStyle: "dashed" },
  newTabText: { color: colors.primary, fontSize: font.body, fontWeight: "800" },
});
