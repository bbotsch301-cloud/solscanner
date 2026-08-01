import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useWallet } from "../wallet/WalletContext";
import { deriveAccount } from "../wallet/vault";
import { HelpTip } from "../components/HelpTip";
import { ImportWallet } from "./ImportWallet";
import { colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function WalletsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { seeds, activeSeedId, activeIndex, switchAccount, addAccount, removeWallet, renameWallet, create } =
    useWallet();

  const [addrs, setAddrs] = useState<Record<string, { sol: string; evm: string | null }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createPass, setCreatePass] = useState("");
  const [createAdvanced, setCreateAdvanced] = useState(false);

  // Derive the (public) addresses for every account to show under each wallet.
  const structureKey = seeds.map((s) => `${s.id}:${s.accounts.join(",")}`).join("|");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map: Record<string, { sol: string; evm: string | null }> = {};
      for (const s of seeds) {
        for (const i of s.accounts) {
          const d = await deriveAccount(s.id, i);
          if (d) map[`${s.id}:${i}`] = { sol: d.solanaAddress, evm: d.evmAddress };
        }
      }
      if (!cancelled) setAddrs(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [structureKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const doRemove = useCallback(
    (id: string, label: string) => {
      Alert.alert(
        `Remove "${label}"?`,
        "This deletes the wallet and all its accounts from this device. If you haven't saved its recovery phrase, its funds will be UNRECOVERABLE. Make sure you've backed it up first.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", style: "destructive", onPress: () => removeWallet(id) },
        ]
      );
    },
    [removeWallet]
  );

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      Alert.alert("Something went wrong", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const doCreate = () => {
    const run = async () => {
      const pass = createPass;
      setShowCreate(false);
      setCreatePass("");
      setCreateAdvanced(false);
      await withBusy("create", () => create(pass));
    };
    // A passphrase is unrecoverable and required for every future restore — confirm first.
    if (createPass) {
      Alert.alert(
        "Use a passphrase (25th word)?",
        "You'll need BOTH your recovery phrase AND this exact passphrase to ever restore this wallet. If you lose the passphrase, the funds are gone forever — no one can recover it. Save it with your recovery phrase.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "I've saved it — create", style: "destructive", onPress: run },
        ]
      );
    } else {
      run();
    }
  };

  if (showImport) {
    return <ImportWallet onDone={() => setShowImport(false)} onCancel={() => setShowImport(false)} />;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Wallets & accounts</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6) }} showsVerticalScrollIndicator={false}>
        {seeds.map((s) => (
          <View key={s.id} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {s.label}
              </Text>
              {s.needsBackup && (
                <Pressable onPress={() => nav.navigate("Backup")} style={styles.backupPill}>
                  <Ionicons name="warning" size={12} color={colors.negative} />
                  <Text style={styles.backupPillText}>Back up</Text>
                </Pressable>
              )}
              <Pressable onPress={() => setRenaming({ id: s.id, label: s.label })} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="pencil" size={16} color={colors.textMuted} />
              </Pressable>
              <Pressable onPress={() => doRemove(s.id, s.label)} hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="trash" size={16} color={colors.negative} />
              </Pressable>
            </View>

            {s.accounts.map((i) => {
              const a = addrs[`${s.id}:${i}`];
              const active = s.id === activeSeedId && i === activeIndex;
              return (
                <Pressable
                  key={i}
                  onPress={() => !active && withBusy(`sw:${s.id}:${i}`, () => switchAccount(s.id, i))}
                  style={[styles.acct, active && styles.acctActive]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.acctName}>Account {i + 1}</Text>
                    <Text style={styles.acctAddr}>
                      SOL {a ? shortAddress(a.sol, 5, 5) : "…"}
                      {a?.evm ? `   ·   EVM ${shortAddress(a.evm, 5, 4)}` : ""}
                    </Text>
                  </View>
                  {busy === `sw:${s.id}:${i}` ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : active ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={20} color={colors.textFaint} />
                  )}
                </Pressable>
              );
            })}

            {s.kind === "mnemonic" && (
              <Pressable
                onPress={() => withBusy(`add:${s.id}`, () => addAccount(s.id))}
                style={styles.addAcct}
                disabled={busy === `add:${s.id}`}
              >
                {busy === `add:${s.id}` ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="add" size={16} color={colors.primary} />
                    <Text style={styles.addAcctText}>Add account</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
        ))}

        <Pressable
          onPress={() => setShowCreate(true)}
          style={styles.primaryBtn}
          disabled={busy === "create"}
        >
          {busy === "create" ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <>
              <Ionicons name="add-circle" size={20} color={colors.bg} />
              <Text style={styles.primaryText}>Create new wallet</Text>
            </>
          )}
        </Pressable>
        <Pressable onPress={() => setShowImport(true)} style={styles.secondaryBtn}>
          <Ionicons name="download" size={18} color={colors.text} />
          <Text style={styles.secondaryText}>Import a wallet</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowCreate(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Create a new wallet</Text>
            <Text style={styles.createSub}>
              A fresh 24-word recovery phrase. You&apos;ll be asked to back it up next.
            </Text>

            <View style={styles.advRow}>
              <Pressable
                onPress={() => setCreateAdvanced((v) => !v)}
                style={styles.advToggle}
                hitSlop={8}
              >
                <Ionicons
                  name={createAdvanced ? "chevron-down" : "chevron-forward"}
                  size={16}
                  color={colors.textMuted}
                />
                <Text style={styles.advText}>Advanced · add a passphrase (25th word)</Text>
              </Pressable>
              <HelpTip topic="passphrase" />
            </View>

            {createAdvanced && (
              <>
                <Text style={styles.advHint}>
                  Optional extra secret mixed into your seed for a hidden wallet. Save it with
                  your recovery phrase — if you lose it, the wallet is gone forever.
                </Text>
                <TextInput
                  value={createPass}
                  onChangeText={setCreatePass}
                  placeholder="Passphrase (optional)"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  style={styles.modalInput}
                />
              </>
            )}

            <Pressable onPress={doCreate} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>Create wallet</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!renaming} transparent animationType="fade" onRequestClose={() => setRenaming(null)}>
        <Pressable style={styles.backdrop} onPress={() => setRenaming(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Rename wallet</Text>
            <TextInput
              value={renaming?.label ?? ""}
              onChangeText={(label) => setRenaming((r) => (r ? { ...r, label } : r))}
              placeholder="Wallet name"
              placeholderTextColor={colors.textFaint}
              style={styles.modalInput}
              autoFocus
            />
            <Pressable
              onPress={() => {
                if (renaming) renameWallet(renaming.id, renaming.label);
                setRenaming(null);
              }}
              style={styles.primaryBtn}
            >
              <Text style={styles.primaryText}>Save</Text>
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
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(3),
    marginBottom: spacing(3),
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginBottom: spacing(2) },
  cardTitle: { flex: 1, color: colors.text, fontSize: font.h3, fontWeight: "800" },
  backupPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.negative + "22",
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2),
    paddingVertical: 3,
  },
  backupPillText: { color: colors.negative, fontSize: font.tiny, fontWeight: "800" },
  iconBtn: { padding: spacing(1) },
  acct: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(2),
    borderRadius: radius.sm,
  },
  acctActive: { backgroundColor: colors.primary + "12" },
  acctName: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  acctAddr: { color: colors.textMuted, fontSize: font.small, marginTop: 2, fontFamily: undefined },
  addAcct: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(1),
    paddingVertical: spacing(2),
    marginTop: spacing(1),
  },
  addAcctText: { color: colors.primary, fontSize: font.small, fontWeight: "700" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radius.pill,
    marginTop: spacing(4),
    minHeight: 52,
  },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    paddingVertical: spacing(3),
    marginTop: spacing(2),
  },
  secondaryText: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "#000000CC", justifyContent: "center", paddingHorizontal: spacing(6) },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing(5),
  },
  modalTitle: { color: colors.text, fontSize: font.h3, fontWeight: "800", marginBottom: spacing(3) },
  createSub: { color: colors.textMuted, fontSize: font.small, lineHeight: 18, marginBottom: spacing(3) },
  advRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  advToggle: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(1) },
  advText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  advHint: { color: colors.textFaint, fontSize: font.small, lineHeight: 17, marginTop: spacing(2), marginBottom: spacing(2) },
  modalInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    color: colors.text,
    fontSize: font.body,
  },
});
