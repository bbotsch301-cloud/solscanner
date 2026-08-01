import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../wallet/WalletContext";
import {
  fetchMultisigInfo,
  fetchProposals,
  isMember,
  approveProposal,
  rejectProposal,
  executeProposal,
  type MultisigInfo,
  type ProposalView,
} from "../solana/multisig";
import { multisigConfigured } from "../config/multisig";
import { humanizeError } from "../solana/errors";
import { colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function TreasuryMultisigScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { keypair, solanaAddress } = useWallet();
  const [info, setInfo] = useState<MultisigInfo | null>(null);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const member = isMember(info, solanaAddress);

  const load = useCallback(async () => {
    if (!multisigConfigured()) return;
    setLoading(true);
    try {
      const i = await fetchMultisigInfo();
      setInfo(i);
      setProposals(i ? await fetchProposals(i) : []);
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch (async, matches other screens)
    load();
  }, [load]);

  const act = (
    p: ProposalView,
    verb: "Approve" | "Reject" | "Execute",
    run: (kp: NonNullable<typeof keypair>, index: number) => Promise<string>
  ) => {
    if (!keypair) return;
    Alert.alert(
      `${verb} proposal #${p.index}?`,
      `${p.summary}\n\nApprovals: ${p.approvals}/${p.threshold}. This signs a real transaction with your key.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: verb,
          style: verb === "Reject" ? "destructive" : "default",
          onPress: async () => {
            setBusy(p.index);
            try {
              await run(keypair, p.index);
              await load();
            } catch (e) {
              Alert.alert(`${verb} failed`, humanizeError(e, { action: "load" }));
            } finally {
              setBusy(null);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Multisig proposals</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6) }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {info && (
          <Pressable
            style={styles.header}
            onPress={() => member && nav.navigate("ManageSigners")}
            disabled={!member}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.headerThreshold}>
                {info.threshold} of {info.members.length} signers
              </Text>
              <Text style={styles.headerSub}>
                {member ? "You're a signer on this treasury." : "You're viewing only — not a signer."}
              </Text>
            </View>
            {member && (
              <View style={styles.manageLink}>
                <Text style={styles.manageText}>Manage</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              </View>
            )}
          </Pressable>
        )}

        {member && (
          <Pressable style={styles.proposeBtn} onPress={() => nav.navigate("ProposeTransfer")}>
            <Ionicons name="add-circle" size={20} color={colors.bg} />
            <Text style={styles.proposeText}>Propose a transfer</Text>
          </Pressable>
        )}

        {!multisigConfigured() ? (
          <Text style={styles.empty}>No multisig is configured for this wallet.</Text>
        ) : proposals.length === 0 && !loading ? (
          <Text style={styles.empty}>No proposals yet. Create one from the treasury (or Squads app).</Text>
        ) : (
          proposals.map((p) => {
            const active = p.status === "Active";
            const approved = p.status === "Approved";
            return (
              <View key={p.index} style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardIndex}>#{p.index}</Text>
                  <View style={[styles.statusPill, statusStyle(p.status)]}>
                    <Text style={styles.statusText}>{p.status}</Text>
                  </View>
                  <Text style={styles.approvals}>
                    {p.approvals}/{p.threshold}
                  </Text>
                </View>
                <Text style={styles.summary}>{p.summary}</Text>
                <Pressable onPress={() => Linking.openURL(p.solscan)} hitSlop={6}>
                  <Text style={styles.solscan}>Review on Solscan ↗</Text>
                </Pressable>

                {member && (active || approved) && (
                  <View style={styles.actions}>
                    {busy === p.index ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : active ? (
                      <>
                        <Pressable style={[styles.btn, styles.approve]} onPress={() => act(p, "Approve", approveProposal)}>
                          <Text style={styles.approveText}>Approve</Text>
                        </Pressable>
                        <Pressable style={[styles.btn, styles.reject]} onPress={() => act(p, "Reject", rejectProposal)}>
                          <Text style={styles.rejectText}>Reject</Text>
                        </Pressable>
                      </>
                    ) : (
                      <Pressable
                        style={[styles.btn, styles.execute]}
                        onPress={() => act(p, "Execute", (kp, i) => executeProposal(kp, i, p.kind))}
                      >
                        <Text style={styles.approveText}>Execute</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.noteText}>
            Powered by Squads Protocol (audited). Always read what a proposal does before you
            approve — approvals sign a real transaction from the treasury.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function statusStyle(status: string) {
  if (status === "Approved") return { backgroundColor: colors.positive + "22", borderColor: colors.positive };
  if (status === "Active") return { backgroundColor: colors.primary + "22", borderColor: colors.primary };
  if (status === "Rejected" || status === "Cancelled") return { backgroundColor: colors.negative + "22", borderColor: colors.negative };
  return { backgroundColor: colors.cardBorder, borderColor: colors.cardBorder };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  header: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4), marginBottom: spacing(3) },
  manageLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  manageText: { color: colors.primary, fontSize: font.small, fontWeight: "800" },
  headerThreshold: { color: colors.accent, fontSize: font.h3, fontWeight: "900" },
  headerSub: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  proposeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing(2),
    backgroundColor: colors.primary,
    paddingVertical: spacing(3.5),
    borderRadius: radius.pill,
    marginBottom: spacing(3),
  },
  proposeText: { color: colors.bg, fontSize: font.body, fontWeight: "800" },
  empty: { color: colors.textMuted, fontSize: font.body, textAlign: "center", paddingVertical: spacing(8) },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4), marginBottom: spacing(3), gap: spacing(2) },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  cardIndex: { color: colors.textMuted, fontSize: font.small, fontWeight: "800" },
  statusPill: { flex: 1, alignSelf: "flex-start", borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing(2), paddingVertical: 2, maxWidth: 90 },
  statusText: { color: colors.text, fontSize: font.tiny, fontWeight: "800", textAlign: "center" },
  approvals: { color: colors.textMuted, fontSize: font.small, fontWeight: "800" },
  summary: { color: colors.text, fontSize: font.body, fontWeight: "600" },
  solscan: { color: colors.primary, fontSize: font.small, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing(2), marginTop: spacing(2) },
  btn: { flex: 1, paddingVertical: spacing(3), borderRadius: radius.pill, alignItems: "center" },
  approve: { backgroundColor: colors.primary },
  execute: { backgroundColor: colors.positive },
  approveText: { color: colors.bg, fontSize: font.body, fontWeight: "800" },
  reject: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.negative },
  rejectText: { color: colors.negative, fontSize: font.body, fontWeight: "800" },
  note: { flexDirection: "row", gap: spacing(2), backgroundColor: colors.primary + "12", borderRadius: radius.md, padding: spacing(4), marginTop: spacing(2) },
  noteText: { flex: 1, color: colors.textMuted, fontSize: font.small, lineHeight: 18 },
});
