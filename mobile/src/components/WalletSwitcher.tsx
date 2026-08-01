/**
 * The wallet/account switcher that lives in the Wallet-tab header. Shows the active wallet's
 * name + a chevron; tapping opens a top-anchored dropdown to switch between wallets/accounts or
 * jump to the full manager. Data + actions come straight from useWallet() — no new state layer.
 */
import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../wallet/WalletContext";
import { deriveAccount } from "../wallet/vault";
import { getPubAddress, type PubAddress } from "../wallet/pubAddresses";
import { PressableScale } from "./PressableScale";
import { haptics } from "../ui/haptics";
import { colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function WalletSwitcher() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { seeds, activeSeedId, activeIndex, switchAccount } = useWallet();

  const [open, setOpen] = useState(false);
  const [addrs, setAddrs] = useState<Record<string, PubAddress>>({});

  // Show each account's public addresses. They're stable, so read them instantly from the shared
  // persisted store (populated by any prior derivation) and only derive the ones we've never seen.
  const structureKey = seeds.map((s) => `${s.id}:${s.accounts.join(",")}`).join("|");
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const map: Record<string, PubAddress> = {};
      for (const s of seeds) for (const i of s.accounts) {
        const stored = getPubAddress(s.id, i);
        if (stored) map[`${s.id}:${i}`] = stored;
      }
      if (!cancelled) setAddrs({ ...map }); // instant paint from the cache

      for (const s of seeds) {
        for (const i of s.accounts) {
          const key = `${s.id}:${i}`;
          if (map[key]) continue;
          const d = await deriveAccount(s.id, i); // caches into the shared store
          if (d && !cancelled) {
            map[key] = { sol: d.solanaAddress, evm: d.evmAddress };
            setAddrs({ ...map });
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, structureKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeSeed = seeds.find((s) => s.id === activeSeedId);
  const activeLabel = activeSeed?.label ?? "Wallet";
  const triggerText =
    (activeSeed?.accounts.length ?? 0) > 1 ? `${activeLabel} · Account ${activeIndex + 1}` : activeLabel;

  // Close the menu immediately and switch in the background — the header label and balances update
  // underneath (balances skeleton-load), so it feels instant instead of blocking on a spinner.
  const select = (seedId: string, index: number) => {
    setOpen(false);
    if (seedId === activeSeedId && index === activeIndex) return;
    haptics.select();
    void switchAccount(seedId, index);
  };

  const goManage = () => {
    setOpen(false);
    nav.navigate("Wallets");
  };
  const goAdd = () => {
    setOpen(false);
    nav.navigate("CreateWallet");
  };

  return (
    <>
      <PressableScale onPress={() => setOpen(true)} style={styles.trigger} hitSlop={8}>
        <Text style={styles.triggerText} numberOfLines={1}>
          {triggerText}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
      </PressableScale>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { paddingTop: insets.top + spacing(11) }]} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.cardTitle}>Wallets</Text>
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {seeds.map((s) =>
                s.accounts.map((i) => {
                  const active = s.id === activeSeedId && i === activeIndex;
                  const key = `${s.id}:${i}`;
                  const a = addrs[key];
                  const name = s.accounts.length > 1 ? `${s.label} · Account ${i + 1}` : s.label;
                  return (
                    <PressableScale key={key} haptic={null} onPress={() => select(s.id, i)} style={[styles.row, active && styles.rowActive]}>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowName} numberOfLines={1}>
                          {name}
                        </Text>
                        {a && (
                          <Text style={styles.rowAddr} numberOfLines={1}>
                            SOL {shortAddress(a.sol, 5, 5)}
                            {a.evm ? `  ·  EVM ${shortAddress(a.evm, 5, 4)}` : ""}
                          </Text>
                        )}
                      </View>
                      <Ionicons
                        name={active ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={active ? colors.primary : colors.textFaint}
                      />
                    </PressableScale>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.divider} />
            <PressableScale onPress={goAdd} style={styles.footerRow}>
              <Ionicons name="add-circle-outline" size={20} color={colors.text} />
              <Text style={styles.footerText}>Add wallet</Text>
            </PressableScale>
            <PressableScale onPress={goManage} style={styles.footerRow}>
              <Ionicons name="settings-outline" size={20} color={colors.text} />
              <Text style={styles.footerText}>Manage wallets & accounts</Text>
            </PressableScale>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: "row", alignItems: "center", gap: spacing(1), flexShrink: 1 },
  triggerText: { color: colors.text, fontSize: font.h1, fontWeight: "900" },
  backdrop: { flex: 1, backgroundColor: "#000000CC", paddingHorizontal: spacing(4), justifyContent: "flex-start" },
  card: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.lg,
    padding: spacing(3),
  },
  cardTitle: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(2),
  },
  list: { maxHeight: 340 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(2),
    borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.primary + "18" },
  rowMain: { flex: 1, gap: 2 },
  rowName: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  rowAddr: { color: colors.textMuted, fontSize: font.tiny },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginVertical: spacing(2) },
  footerRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3), paddingHorizontal: spacing(2) },
  footerText: { color: colors.text, fontSize: font.body, fontWeight: "700" },
});
