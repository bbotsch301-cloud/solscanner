/**
 * Browser top chrome: an address/search bar (with https lock + host display) and a nav toolbar
 * (back / forward / home / favorite / tabs). A thin progress bar shows load progress.
 */
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "../components/PressableScale";
import { colors, font, radius, spacing } from "../theme";
import { hostOf } from "./dapps";
import type { TabState } from "./types";

export function BrowserChrome({
  tab,
  isFav,
  tabCount,
  onNavigate,
  onBack,
  onForward,
  onReload,
  onStop,
  onHome,
  onToggleFav,
  onTabs,
}: {
  tab: TabState;
  isFav: boolean;
  tabCount: number;
  onNavigate: (input: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
  onHome: () => void;
  onToggleFav: () => void;
  onTabs: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const url = tab.currentUrl || tab.uri;
  const secure = /^https:/i.test(url);
  const host = url ? hostOf(url) : "";
  const blank = !url;

  return (
    <View style={styles.wrap}>
      <View style={styles.barRow}>
        <View style={styles.bar}>
          {!editing && !blank && (
            <Ionicons
              name={secure ? "lock-closed" : "warning"}
              size={13}
              color={secure ? colors.textMuted : colors.warning}
            />
          )}
          <TextInput
            value={editing ? text : host}
            onChangeText={setText}
            onFocus={() => {
              setText(url);
              setEditing(true);
            }}
            onBlur={() => setEditing(false)}
            onSubmitEditing={() => {
              setEditing(false);
              if (text.trim()) onNavigate(text);
            }}
            placeholder="Search or enter address"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="web-search"
            selectTextOnFocus
            returnKeyType="go"
            style={styles.input}
          />
          <PressableScale onPress={tab.loading ? onStop : onReload} hitSlop={8} haptic={null}>
            <Ionicons name={tab.loading ? "close" : "reload"} size={16} color={colors.textMuted} />
          </PressableScale>
        </View>
      </View>

      <View style={styles.toolbar}>
        <NavBtn icon="chevron-back" disabled={!tab.canGoBack} onPress={onBack} />
        <NavBtn icon="chevron-forward" disabled={!tab.canGoForward} onPress={onForward} />
        <NavBtn icon="home-outline" onPress={onHome} />
        <NavBtn icon={isFav ? "star" : "star-outline"} onPress={onToggleFav} disabled={blank} color={isFav ? colors.primary : undefined} />
        <PressableScale onPress={onTabs} style={styles.tabsBtn} hitSlop={8}>
          <Ionicons name="copy-outline" size={16} color={colors.text} />
          <Text style={styles.tabsCount}>{tabCount}</Text>
        </PressableScale>
      </View>

      {tab.loading && tab.progress < 1 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(4, tab.progress * 100)}%` }]} />
        </View>
      )}
    </View>
  );
}

function NavBtn({ icon, onPress, disabled, color }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean; color?: string }) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} hitSlop={8} style={styles.navBtn}>
      <Ionicons name={icon} size={22} color={disabled ? colors.textFaint : color ?? colors.text} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  barRow: { paddingHorizontal: spacing(4), paddingTop: spacing(2) },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2.5),
  },
  input: { flex: 1, color: colors.text, fontSize: font.body, padding: 0 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: spacing(1.5), paddingHorizontal: spacing(3) },
  navBtn: { padding: spacing(2) },
  tabsBtn: { flexDirection: "row", alignItems: "center", gap: spacing(1), padding: spacing(2) },
  tabsCount: { color: colors.text, fontSize: font.small, fontWeight: "800" },
  progressTrack: { height: 2, backgroundColor: "transparent" },
  progressFill: { height: 2, backgroundColor: colors.primary },
});
