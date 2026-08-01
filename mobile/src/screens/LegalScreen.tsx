import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LegalText } from "../components/LegalText";
import { LEGAL_DOCS } from "../legal/content";
import { colors, font, spacing } from "../theme";
import type { RootNav, RootStackParamList } from "../navigation";

/** Renders one legal/security document (privacy | terms | security) by route param. */
export function LegalScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RootStackParamList, "Legal">>();
  const doc = LEGAL_DOCS[route.params.doc];

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing(2) }]}>
        <Text style={styles.title} numberOfLines={1}>
          {doc.title}
        </Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing(5), paddingBottom: insets.bottom + spacing(10) }}
        showsVerticalScrollIndicator={false}
      >
        <LegalText body={doc.body} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(2),
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  title: { flex: 1, color: colors.text, fontSize: font.h3, fontWeight: "800", marginRight: spacing(3) },
});
