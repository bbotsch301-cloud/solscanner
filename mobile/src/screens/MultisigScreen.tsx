import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  savedMultisigs,
  activeMultisigAddress,
  setActiveMultisig,
  removeMultisig,
  renameMultisig,
  multisigLabel,
  type MultisigEntry,
} from "../config/multisig";
import { colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

function AddRow({
  icon,
  label,
  sub,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.addRow, pressed && { opacity: 0.6 }]}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text style={styles.addLabel}>{label}</Text>
        {sub && <Text style={styles.addSub}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

export function MultisigScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const [entries, setEntries] = useState<MultisigEntry[]>(savedMultisigs());
  const [active, setActive] = useState(activeMultisigAddress());
  const [renaming, setRenaming] = useState<{ address: string; label: string } | null>(null);

  const refresh = useCallback(() => {
    setEntries([...savedMultisigs()]);
    setActive(activeMultisigAddress());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const open = async (address: string) => {
    await setActiveMultisig(address);
    refresh();
    nav.navigate("MultisigWallet");
  };

  const remove = (e: MultisigEntry) => {
    Alert.alert(
      `Remove "${multisigLabel(e.address)}"?`,
      "This only forgets it on this device — the on-chain Squad and its funds are untouched. Reconnect anytime with its address.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeMultisig(e.address);
            refresh();
          },
        },
      ]
    );
  };

  const saveRename = async () => {
    if (renaming) {
      await renameMultisig(renaming.address, renaming.label);
      refresh();
    }
    setRenaming(null);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Multisig treasuries</Text>
        <Pressable onPress={() => nav.canGoBack() && nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6) }} showsVerticalScrollIndicator={false}>
        {entries.length === 0 ? (
          <Text style={styles.intro}>
            A shared treasury governed by Squads Protocol (audited): multiple signers must approve
            every spend. Create a new one, or connect an existing Squad by its address. You can save
            as many as you like and switch between them.
          </Text>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Your treasuries</Text>
            <View style={styles.group}>
              {entries.map((e, i) => (
                <View key={e.address}>
                  {i > 0 && <View style={styles.divider} />}
                  <View style={styles.walletRow}>
                    <Pressable style={styles.walletMain} onPress={() => open(e.address)}>
                      <Ionicons name="people-circle" size={26} color={colors.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.walletName} numberOfLines={1}>{multisigLabel(e.address)}</Text>
                        <Text style={styles.walletAddr}>{shortAddress(e.address, 6, 6)}</Text>
                      </View>
                      {e.address === active && <Text style={styles.activeTag}>Active</Text>}
                      <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                    </Pressable>
                    <View style={styles.walletIcons}>
                      <Pressable onPress={() => setRenaming({ address: e.address, label: e.label ?? "" })} hitSlop={8} style={styles.iconBtn}>
                        <Ionicons name="pencil" size={15} color={colors.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => remove(e)} hitSlop={8} style={styles.iconBtn}>
                        <Ionicons name="trash" size={15} color={colors.negative} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>{entries.length === 0 ? "Get started" : "Add another"}</Text>
        <View style={styles.group}>
          <AddRow
            icon="add-circle-outline"
            label="Create a Squad"
            sub="Deploy a new multisig you control"
            onPress={() => nav.navigate("CreateSquad")}
          />
          <View style={styles.divider} />
          <AddRow
            icon="link-outline"
            label="Connect an existing multisig"
            sub="Track or sign an existing Squad by address"
            onPress={() => nav.navigate("ConnectMultisig")}
          />
        </View>

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>
            These are separate from the main Global Goshens treasury shown on Home. Tap a treasury
            to view its balance and act on it. Powered by Squads Protocol (audited) — your keys
            never leave this device.
          </Text>
        </View>
      </ScrollView>

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <Pressable style={styles.backdrop} onPress={() => setRenaming(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Name this treasury</Text>
            <TextInput
              value={renaming?.label ?? ""}
              onChangeText={(label) => setRenaming((r) => (r ? { ...r, label } : r))}
              placeholder="e.g. Global Goshens"
              placeholderTextColor={colors.textFaint}
              style={styles.modalInput}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveRename}
            />
            <Pressable onPress={saveRename} style={styles.modalSave}>
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
            <Pressable onPress={() => setRenaming(null)} style={styles.modalCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  intro: { color: colors.textMuted, fontSize: font.body, lineHeight: 22, marginBottom: spacing(2) },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(6),
    marginBottom: spacing(2),
  },
  group: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing(4) },
  walletRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing(2) },
  walletMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(1.5) },
  walletName: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  walletAddr: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
  activeTag: { color: colors.primary, fontSize: font.tiny, fontWeight: "800" },
  walletIcons: { flexDirection: "row", alignItems: "center", gap: spacing(1), marginLeft: spacing(2) },
  iconBtn: { padding: spacing(1) },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3.5) },
  addLabel: { color: colors.text, fontSize: font.body, fontWeight: "600" },
  addSub: { color: colors.textMuted, fontSize: font.small, marginTop: 1 },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  note: { flexDirection: "row", gap: spacing(2), backgroundColor: colors.primary + "12", borderRadius: radius.md, padding: spacing(4), marginTop: spacing(6) },
  noteText: { flex: 1, color: colors.textMuted, fontSize: font.small, lineHeight: 18 },
  backdrop: { flex: 1, backgroundColor: "#000000CC", justifyContent: "center", paddingHorizontal: spacing(6) },
  modalCard: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg, padding: spacing(5) },
  modalTitle: { color: colors.text, fontSize: font.h3, fontWeight: "800", marginBottom: spacing(3) },
  modalInput: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4), color: colors.text, fontSize: font.body },
  modalSave: { backgroundColor: colors.primary, paddingVertical: spacing(3.5), borderRadius: radius.pill, alignItems: "center", marginTop: spacing(4) },
  modalSaveText: { color: colors.bg, fontSize: font.body, fontWeight: "800" },
  modalCancel: { alignItems: "center", paddingVertical: spacing(3), marginTop: spacing(1) },
  modalCancelText: { color: colors.textMuted, fontSize: font.body, fontWeight: "700" },
});
