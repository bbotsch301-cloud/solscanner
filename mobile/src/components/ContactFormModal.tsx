/** Add / edit an address-book contact. Reused by the Contacts screen and the Send screen's
 *  "Save to contacts" action. The address is editable only when adding (edit changes name/note). */
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput } from "react-native";
import { addContact, updateContact, type Contact } from "../contacts/contacts";
import { haptics } from "../ui/haptics";
import { colors, font, radius, spacing } from "../theme";

export function ContactFormModal({
  visible,
  editing,
  presetAddress,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** When set, edit this contact (name/note only). */
  editing?: Contact | null;
  /** Prefill the address when adding (e.g. from the Send screen). */
  presetAddress?: string;
  onClose: () => void;
  onSaved?: (c?: Contact) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isEdit = !!editing;

  // Reset the form as the modal appears (event, not an effect — avoids sync-setState-in-effect).
  const reset = () => {
    setName(editing?.name ?? "");
    setAddress(editing?.address ?? presetAddress ?? "");
    setNote(editing?.note ?? "");
    setError(null);
    setBusy(false);
  };

  const save = async () => {
    if (busy) return;
    setError(null);
    if (!name.trim()) return setError("Give this contact a name.");
    setBusy(true);
    try {
      if (isEdit && editing) {
        await updateContact(editing.id, { name, note });
        haptics.success();
        onSaved?.();
      } else {
        const c = await addContact({ name, address, note });
        haptics.success();
        onSaved?.(c);
      }
      onClose();
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : "Couldn't save the contact.");
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onShow={reset} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{isEdit ? "Edit contact" : "Add contact"}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            autoFocus
          />
          <TextInput
            value={address}
            onChangeText={setAddress}
            editable={!isEdit}
            placeholder="Address (Solana or 0x…)"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={[styles.input, styles.addr, isEdit && { opacity: 0.6 }]}
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (optional)"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <Pressable onPress={save} disabled={busy} style={[styles.btn, busy && { opacity: 0.6 }]}>
            <Text style={styles.btnText}>{isEdit ? "Save" : "Add contact"}</Text>
          </Pressable>
          <Pressable onPress={onClose} disabled={busy} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000CC", justifyContent: "center", paddingHorizontal: spacing(5) },
  card: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg, padding: spacing(5), gap: spacing(3) },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    color: colors.text,
    fontSize: font.body,
  },
  addr: { fontSize: font.small, minHeight: 44 },
  error: { color: colors.negative, fontSize: font.small },
  btn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", marginTop: spacing(1) },
  btnText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  cancel: { alignItems: "center", paddingVertical: spacing(2) },
  cancelText: { color: colors.textMuted, fontSize: font.body, fontWeight: "700" },
});
