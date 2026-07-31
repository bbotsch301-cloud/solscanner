import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../wallet/WalletContext";
import { XGO_MINT, getSupply } from "../solana/token2022";
import { compact as fmtCompact, colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

// Illustrative proposals to show the governance UX. Real proposals + on-chain
// tallies arrive with the vote program; base votes here are in XGO.
const EXAMPLE_PROPOSALS = [
  {
    id: "p1",
    title: "Deploy 40% of treasury stablecoins into Solana lending",
    desc: "Put idle USDC to work in an audited lending market to grow the treasury.",
    forVotes: 4_200_000,
    againstVotes: 1_100_000,
  },
  {
    id: "p2",
    title: "Fund the first real-world revenue pilot",
    desc: "Allocate treasury capital to acquire a small revenue-producing operation as the first off-chain venture.",
    forVotes: 2_800_000,
    againstVotes: 2_400_000,
  },
];

export function GovernScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { tokens, refresh, refreshing } = useWallet();
  const [supply, setSupply] = useState<number | null>(null);
  const [votes, setVotes] = useState<Record<string, "for" | "against">>({});

  const power = useMemo(
    () => tokens.find((t) => t.mint === XGO_MINT)?.amount ?? 0,
    [tokens]
  );
  const share = supply && supply > 0 ? power / supply : null;

  const loadSupply = useCallback(async () => {
    setSupply(await getSupply(XGO_MINT));
  }, []);

  useEffect(() => {
    loadSupply();
  }, [loadSupply]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            refresh();
            loadSupply();
          }}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <Text style={styles.header}>Govern</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Voting power */}
      <LinearGradient colors={[colors.gradA, colors.gradB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.cardInner}>
          <Text style={styles.cardLabel}>Your voting power</Text>
          <View style={styles.powerRow}>
            <Text style={styles.power} numberOfLines={1} adjustsFontSizeToFit>
              {fmtCompact(power)}
            </Text>
            <Text style={styles.powerUnit}>XGO</Text>
          </View>
          <Text style={styles.cardSub}>
            {share != null ? `${(share * 100).toFixed(2)}% of all voting power` : "—"}
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.noteRow}>
        <Ionicons name="lock-open-outline" size={15} color={colors.primary} />
        <Text style={styles.noteText}>
          Hold XGO to vote on the mission — your tokens never leave your wallet. No lock-up, no custody.
        </Text>
      </View>

      {/* Treasury reinvestment (informational) */}
      <Text style={styles.sectionTitle}>Treasury reinvestment</Text>
      <View style={styles.rewardCard}>
        <View style={styles.rewardRow}>
          <Text style={styles.rewardLabel}>Fees reinvested</Text>
          <Text style={styles.rewardValue}>100%</Text>
        </View>
        <Text style={styles.rewardNote}>
          The 1.11% transfer fee and LP fees flow to the treasury and stay there — funding the
          mission and its assets. The treasury may buy back or burn XGO at its discretion.
        </Text>
      </View>

      {/* Proposals */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Proposals</Text>
        <View style={styles.previewTag}>
          <Text style={styles.previewText}>PREVIEW</Text>
        </View>
      </View>

      {EXAMPLE_PROPOSALS.map((p) => {
        const myVote = votes[p.id];
        const forV = p.forVotes + (myVote === "for" ? power : 0);
        const againstV = p.againstVotes + (myVote === "against" ? power : 0);
        const totalV = forV + againstV;
        const forPct = totalV ? (forV / totalV) * 100 : 50;
        return (
          <View key={p.id} style={styles.proposal}>
            <Text style={styles.proposalTitle}>{p.title}</Text>
            <Text style={styles.proposalDesc}>{p.desc}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${forPct}%` }]} />
            </View>
            <View style={styles.tallyRow}>
              <Text style={styles.tallyFor}>{forPct.toFixed(0)}% For · {fmtCompact(forV)}</Text>
              <Text style={styles.tallyAgainst}>{fmtCompact(againstV)} · Against {(100 - forPct).toFixed(0)}%</Text>
            </View>
            <View style={styles.voteRow}>
              <Pressable
                onPress={() => setVotes((v) => ({ ...v, [p.id]: "for" }))}
                style={[styles.voteBtn, myVote === "for" && styles.voteForActive]}
              >
                <Text style={[styles.voteText, myVote === "for" && { color: colors.bg }]}>Vote For</Text>
              </Pressable>
              <Pressable
                onPress={() => setVotes((v) => ({ ...v, [p.id]: "against" }))}
                style={[styles.voteBtn, myVote === "against" && styles.voteAgainstActive]}
              >
                <Text style={[styles.voteText, myVote === "against" && { color: colors.bg }]}>Against</Text>
              </Pressable>
            </View>
            {myVote && (
              <Text style={styles.votedNote}>
                You voted {myVote} with {fmtCompact(power)} XGO (preview — not yet on-chain).
              </Text>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  header: { color: colors.text, fontSize: font.h1, fontWeight: "900" },
  card: { borderRadius: radius.lg, padding: 1 },
  cardInner: { borderRadius: radius.lg - 1, padding: spacing(5), gap: spacing(2) },
  cardLabel: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  powerRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing(2) },
  power: { color: "#0A0A0C", fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  powerUnit: { color: "#0A0A0C", fontSize: font.h2, fontWeight: "800", marginBottom: spacing(1.5) },
  cardSub: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  noteRow: { flexDirection: "row", gap: spacing(2), alignItems: "flex-start", marginTop: spacing(3) },
  noteText: { flex: 1, color: colors.textMuted, fontSize: font.small, lineHeight: 18 },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(6),
    marginBottom: spacing(3),
  },
  sectionRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  previewTag: { backgroundColor: colors.warning + "22", borderRadius: radius.sm, paddingHorizontal: spacing(2), paddingVertical: 2, marginTop: spacing(3) },
  previewText: { color: colors.warning, fontSize: font.tiny, fontWeight: "800" },
  rewardCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing(4), gap: spacing(3) },
  rewardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rewardLabel: { color: colors.textMuted, fontSize: font.body },
  rewardValue: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  claimBtn: { paddingVertical: spacing(3.5), borderRadius: radius.pill, alignItems: "center", marginTop: spacing(1) },
  claimDisabled: { backgroundColor: colors.bgElevated },
  claimDisabledText: { color: colors.textFaint, fontSize: font.body, fontWeight: "700" },
  rewardNote: { color: colors.textFaint, fontSize: font.small, lineHeight: 18 },
  proposal: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing(4), gap: spacing(2), marginBottom: spacing(3) },
  proposalTitle: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  proposalDesc: { color: colors.textMuted, fontSize: font.small, lineHeight: 19 },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: colors.negative + "55", overflow: "hidden", marginTop: spacing(2) },
  barFill: { height: 8, backgroundColor: colors.positive },
  tallyRow: { flexDirection: "row", justifyContent: "space-between" },
  tallyFor: { color: colors.positive, fontSize: font.small, fontWeight: "700" },
  tallyAgainst: { color: colors.negative, fontSize: font.small, fontWeight: "700" },
  voteRow: { flexDirection: "row", gap: spacing(2), marginTop: spacing(2) },
  voteBtn: { flex: 1, paddingVertical: spacing(3), borderRadius: radius.pill, alignItems: "center", backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder },
  voteForActive: { backgroundColor: colors.positive, borderColor: colors.positive },
  voteAgainstActive: { backgroundColor: colors.negative, borderColor: colors.negative },
  voteText: { color: colors.text, fontSize: font.body, fontWeight: "800" },
  votedNote: { color: colors.textFaint, fontSize: font.small, marginTop: spacing(1) },
});
