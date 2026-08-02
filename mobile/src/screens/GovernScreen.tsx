import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PublicKey } from "@solana/web3.js";
import { HeroCard } from "../components/HeroCard";
import { EmptyState } from "../components/EmptyState";
import { Card } from "../components/Card";
import { Skeleton } from "../components/Skeleton";
import { useWallet, useWalletStatus } from "../wallet/WalletContext";
import { XGO_MINT, getSupply } from "../solana/token2022";
import { connection } from "../solana/connection";
import { tierFor, multiplierFor } from "../config/staking";
import { compact as fmtCompact, colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

export function GovernScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { address, tokens, solBalance, refresh } = useWallet();
  const { refreshing } = useWalletStatus();
  // An empty `tokens` array means either "holds nothing" or "hasn't loaded" — `solBalance` is the
  // one signal that tells them apart, since it's null until the wallet's balances land. Without
  // this the hero opens claiming 0 votes, which is a statement, not a loading state.
  const balancesLoaded = solBalance != null;
  const [supply, setSupply] = useState<number | null>(null);
  const [firstSeen, setFirstSeen] = useState<number | null>(null);

  const held = useMemo(
    () => tokens.find((t) => t.mint === XGO_MINT)?.amount ?? 0,
    [tokens]
  );
  // "Staking" is non-custodial: holding = weight; holding longer multiplies it.
  const loyalty = multiplierFor(firstSeen);
  const power = held * loyalty.mult; // effective voting power
  const tier = tierFor(held);
  const share = supply && supply > 0 ? power / supply : null;

  const loadSupply = useCallback(async () => {
    setSupply(await getSupply(XGO_MINT));
  }, []);

  const loadFirstSeen = useCallback(async () => {
    if (!address) return;
    try {
      const sigs = await connection.getSignaturesForAddress(new PublicKey(address), { limit: 1000 });
      const times = sigs.map((s) => s.blockTime).filter((t): t is number => !!t);
      setFirstSeen(times.length ? Math.min(...times) : null);
    } catch {
      /* best-effort */
    }
  }, [address]);

  useEffect(() => {
    loadSupply();
    loadFirstSeen();
  }, [loadSupply, loadFirstSeen]);

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
      <HeroCard gap={spacing(2)}>
        <View style={styles.heroTop}>
          <Text style={styles.cardLabel}>Your voting power</Text>
          {tier.current && (
            <View style={styles.tierChip}>
              <Ionicons name="ribbon" size={12} color="#0A0A0C" />
              <Text style={styles.tierText}>{tier.current.name}</Text>
            </View>
          )}
        </View>
        {balancesLoaded ? (
          <>
            <View style={styles.powerRow}>
              <Text style={styles.power} numberOfLines={1} adjustsFontSizeToFit>
                {fmtCompact(power)}
              </Text>
              <Text style={styles.powerUnit}>votes</Text>
            </View>
            <Text style={styles.cardSub}>
              {fmtCompact(held)} XGO × {loyalty.mult}× loyalty
              {share != null ? ` · ${(share * 100).toFixed(2)}% of all` : ""}
            </Text>
          </>
        ) : (
          <>
            <Skeleton width={160} height={40} round={radius.sm} style={{ backgroundColor: "#0A0A0C33" }} />
            <Skeleton width={120} height={15} round={radius.sm} style={{ backgroundColor: "#0A0A0C33" }} />
          </>
        )}
      </HeroCard>

      <View style={styles.noteRow}>
        <Ionicons name="lock-open-outline" size={15} color={colors.primary} />
        <Text style={styles.noteText}>
          Hold XGO to vote on the mission — your tokens never leave your wallet. No lock-up, no custody.
        </Text>
      </View>

      {/* Membership / staking (non-custodial) */}
      <Text style={styles.sectionTitle}>Membership</Text>
      <View style={styles.rewardCard}>
        <View style={styles.rewardRow}>
          <Text style={styles.rewardLabel}>Tier</Text>
          <Text style={styles.rewardValue}>{tier.current?.name ?? "—"}</Text>
        </View>
        <View style={styles.rewardRow}>
          <Text style={styles.rewardLabel}>Loyalty multiplier</Text>
          <Text style={styles.rewardValue}>{loyalty.mult}× · {loyalty.label}</Text>
        </View>
        {tier.next && (
          <>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, (held / tier.next.min) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.rewardNote}>
              Hold {fmtCompact(tier.toNext)} more XGO to reach {tier.next.name}.
            </Text>
          </>
        )}
        <Text style={styles.rewardNote}>
          Your XGO stays in your wallet — no lock-up, no custody. Hold more and longer to rise
          in tier and multiply your voting weight.
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
      <Text style={styles.sectionTitle}>Proposals</Text>
      <Card padding={0}>
        <EmptyState
          icon="documents-outline"
          title="No proposals yet"
          subtitle="On-chain voting opens when the governance program ships at launch. Your voting power above is ready to use the moment it does."
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  header: { color: colors.text, fontSize: font.h1, fontWeight: "900" },
  cardLabel: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  powerRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing(2) },
  power: { color: "#0A0A0C", fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  powerUnit: { color: "#0A0A0C", fontSize: font.h2, fontWeight: "800", marginBottom: spacing(1.5) },
  cardSub: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tierChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#0A0A0C22", paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.pill },
  tierText: { color: "#0A0A0C", fontSize: font.tiny, fontWeight: "900" },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.bgElevated, overflow: "hidden", marginTop: spacing(1) },
  progressFill: { height: 8, backgroundColor: colors.primary },
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
  rewardCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing(4), gap: spacing(3) },
  rewardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rewardLabel: { color: colors.textMuted, fontSize: font.body },
  rewardValue: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  rewardNote: { color: colors.textFaint, fontSize: font.small, lineHeight: 18 },
});
