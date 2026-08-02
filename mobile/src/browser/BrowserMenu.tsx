/** The browser ••• overflow menu (bottom sheet) and the Connected-sites manager. */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../components/PressableScale";
import { colors, font, radius, spacing } from "../theme";
import { hostOf } from "./dapps";
import type { Connection } from "./connections";

function Item({ icon, label, onPress, disabled, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  const color = disabled ? colors.textFaint : danger ? colors.negative : colors.text;
  return (
    <PressableScale onPress={onPress} disabled={disabled} style={styles.item} haptic="select">
      <Ionicons name={icon} size={20} color={disabled ? colors.textFaint : danger ? colors.negative : colors.primary} />
      <Text style={[styles.itemText, { color }]}>{label}</Text>
    </PressableScale>
  );
}

export function BrowserMenu({
  visible,
  hasUrl,
  isFav,
  onClose,
  onToggleFav,
  onCopy,
  onShare,
  onConnectedSites,
  onClearData,
}: {
  visible: boolean;
  hasUrl: boolean;
  isFav: boolean;
  onClose: () => void;
  onToggleFav: () => void;
  onCopy: () => void;
  onShare: () => void;
  onConnectedSites: () => void;
  onClearData: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing(3) }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Item icon={isFav ? "star" : "star-outline"} label={isFav ? "Remove favorite" : "Add to favorites"} onPress={onToggleFav} disabled={!hasUrl} />
          <Item icon="copy-outline" label="Copy link" onPress={onCopy} disabled={!hasUrl} />
          <Item icon="share-social-outline" label="Share" onPress={onShare} disabled={!hasUrl} />
          <View style={styles.divider} />
          <Item icon="link-outline" label="Connected sites" onPress={onConnectedSites} />
          <Item icon="trash-outline" label="Clear browsing data" onPress={onClearData} danger />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ConnectedSitesModal({
  visible,
  connections,
  onClose,
  onDisconnect,
  onDisconnectAll,
}: {
  visible: boolean;
  connections: Connection[];
  onClose: () => void;
  onDisconnect: (origin: string) => void;
  onDisconnectAll: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
        <View style={styles.topBar}>
          <Text style={styles.title}>Connected sites</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(6) }} showsVerticalScrollIndicator={false}>
          {connections.length === 0 ? (
            <Text style={styles.empty}>No sites are connected. When you approve a dApp connection, it appears here.</Text>
          ) : (
            <>
              <View style={styles.group}>
                {connections.map((c, i) => (
                  <View key={c.origin}>
                    {i > 0 && <View style={styles.rowDivider} />}
                    <View style={styles.siteRow}>
                      <View style={styles.siteMid}>
                        <Text style={styles.siteHost} numberOfLines={1}>
                          {hostOf(c.origin)}
                        </Text>
                        <Text style={styles.siteChains}>
                          {[c.solana && "Solana", c.evm && "EVM"].filter(Boolean).join(" · ") || "Connected"}
                        </Text>
                      </View>
                      <PressableScale onPress={() => onDisconnect(c.origin)} style={styles.disconnectBtn} haptic="select">
                        <Text style={styles.disconnectText}>Disconnect</Text>
                      </PressableScale>
                    </View>
                  </View>
                ))}
              </View>
              <PressableScale onPress={onDisconnectAll} style={styles.allBtn}>
                <Text style={styles.allText}>Disconnect all</Text>
              </PressableScale>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderTopWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing(4), paddingTop: spacing(2) },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.cardBorder, marginBottom: spacing(2) },
  item: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3.5) },
  itemText: { fontSize: font.body, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginVertical: spacing(1) },
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing(5), paddingBottom: spacing(2) },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  empty: { color: colors.textMuted, fontSize: font.body, textAlign: "center", lineHeight: 22, marginTop: spacing(8), paddingHorizontal: spacing(4) },
  group: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing(4) },
  rowDivider: { height: 1, backgroundColor: colors.cardBorder },
  siteRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3.5) },
  siteMid: { flex: 1, gap: 2 },
  siteHost: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  siteChains: { color: colors.textMuted, fontSize: font.small },
  disconnectBtn: { paddingVertical: spacing(2), paddingHorizontal: spacing(3), borderRadius: radius.pill, borderWidth: 1, borderColor: colors.negative },
  disconnectText: { color: colors.negative, fontSize: font.small, fontWeight: "800" },
  allBtn: { marginTop: spacing(4), paddingVertical: spacing(4), borderRadius: radius.pill, borderWidth: 1, borderColor: colors.cardBorder, alignItems: "center" },
  allText: { color: colors.negative, fontSize: font.body, fontWeight: "800" },
});
