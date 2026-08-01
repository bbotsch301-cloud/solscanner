/** A modal list to pick a saved contact (filtered to the active chain kind) on the Send screen. */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listContacts, type ContactKind } from "../contacts/contacts";
import { PressableScale } from "./PressableScale";
import { colors, font, radius, shortAddress, spacing } from "../theme";

export function ContactPicker({
  visible,
  kind,
  onClose,
  onSelect,
}: {
  visible: boolean;
  kind: ContactKind;
  onClose: () => void;
  onSelect: (address: string) => void;
}) {
  const contacts = listContacts(kind);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>Send to a contact</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          {contacts.length === 0 ? (
            <Text style={styles.empty}>No saved contacts on this network yet. Add one from More → Address book.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              {contacts.map((c) => (
                <PressableScale
                  key={c.id}
                  onPress={() => {
                    onSelect(c.address);
                    onClose();
                  }}
                  style={styles.row}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{c.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.addr} numberOfLines={1}>{shortAddress(c.address, 6, 6)}</Text>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000CC", justifyContent: "center", paddingHorizontal: spacing(5) },
  card: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg, padding: spacing(4) },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(2) },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  empty: { color: colors.textMuted, fontSize: font.body, lineHeight: 21, paddingVertical: spacing(4) },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + "22", borderWidth: 1, borderColor: colors.primary + "55", alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontSize: font.h3, fontWeight: "800" },
  name: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  addr: { color: colors.textMuted, fontSize: font.small },
});
