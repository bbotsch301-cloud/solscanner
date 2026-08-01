/** Address book manager — list saved contacts, add / edit / delete. Reached from More. */
import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ContactFormModal } from "../components/ContactFormModal";
import { PressableScale } from "../components/PressableScale";
import { listContacts, removeContact, type Contact } from "../contacts/contacts";
import { haptics } from "../ui/haptics";
import { colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function ContactsScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const [rev, setRev] = useState(0); // bump to re-read the (module-level) contact list
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const contacts = useMemo(() => {
    void rev; // re-read the module-level contact list whenever it's bumped
    return listContacts();
  }, [rev]);

  const confirmRemove = (c: Contact) => {
    Alert.alert(`Remove "${c.name}"?`, "This only removes the saved contact — it doesn't affect any funds.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await removeContact(c.id);
          haptics.tap();
          setRev((r) => r + 1);
        },
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing(2) }]}>
        <Text style={styles.header}>Address book</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(6) }}
        showsVerticalScrollIndicator={false}
      >
        <PressableScale onPress={() => setAdding(true)} style={styles.addBtn}>
          <Ionicons name="person-add" size={18} color={colors.bg} />
          <Text style={styles.addText}>Add contact</Text>
        </PressableScale>

        {contacts.length === 0 ? (
          <Text style={styles.empty}>
            No contacts yet. Save the people and wallets you send to often — they’ll show up by name on
            the Send screen and count as trusted for scam checks.
          </Text>
        ) : (
          <View style={styles.list}>
            {contacts.map((c, i) => (
              <View key={c.id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{c.name.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.addr} numberOfLines={1}>
                      {c.kind === "evm" ? "EVM" : "SOL"} · {shortAddress(c.address, 6, 6)}
                    </Text>
                    {c.note ? <Text style={styles.note} numberOfLines={1}>{c.note}</Text> : null}
                  </View>
                  <Pressable onPress={() => setEditing(c)} hitSlop={8} style={styles.iconBtn}>
                    <Ionicons name="create-outline" size={20} color={colors.textMuted} />
                  </Pressable>
                  <Pressable onPress={() => confirmRemove(c)} hitSlop={8} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={19} color={colors.negative} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <ContactFormModal visible={adding} onClose={() => setAdding(false)} onSaved={() => setRev((r) => r + 1)} />
      <ContactFormModal
        visible={!!editing}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setRev((r) => r + 1)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(2) },
  header: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), backgroundColor: colors.primary, paddingVertical: spacing(3.5), borderRadius: radius.pill, marginBottom: spacing(4) },
  addText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  empty: { color: colors.textMuted, fontSize: font.body, lineHeight: 22, textAlign: "center", paddingHorizontal: spacing(4), marginTop: spacing(6) },
  list: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing(4) },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3.5) },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + "22", borderWidth: 1, borderColor: colors.primary + "55", alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.primary, fontSize: font.h3, fontWeight: "800" },
  name: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  addr: { color: colors.textMuted, fontSize: font.small },
  note: { color: colors.textFaint, fontSize: font.small, marginTop: 1 },
  iconBtn: { padding: spacing(1) },
});
