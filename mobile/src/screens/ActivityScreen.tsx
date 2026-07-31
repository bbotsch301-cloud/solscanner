import { SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityRow } from "../components/ActivityRow";
import { activity, type Activity } from "../data/mockWallet";
import { colors, font, spacing } from "../theme";

function groupByDay(items: Activity[]): { title: string; data: Activity[] }[] {
  const day = 86_400;
  const nowDay = Math.floor(Date.now() / 1000 / day);
  const groups = new Map<string, Activity[]>();
  for (const a of items) {
    const d = Math.floor(a.timestamp / day);
    const label = d === nowDay ? "Today" : d === nowDay - 1 ? "Yesterday" : "Earlier";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(a);
  }
  return [...groups.entries()].map(([title, data]) => ({ title, data }));
}

export function ActivityScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <Text style={[styles.header, { paddingTop: insets.top + spacing(2) }]}>Activity</Text>
      <SectionList
        sections={groupByDay(activity)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ActivityRow item={item} />}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        contentContainerStyle={{ paddingHorizontal: spacing(4), paddingBottom: spacing(10) }}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    color: colors.text,
    fontSize: font.h1,
    fontWeight: "900",
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(2),
  },
  sectionHeader: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(5),
    marginBottom: spacing(1),
  },
});
