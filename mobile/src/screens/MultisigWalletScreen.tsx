import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PieChart } from "../components/PieChart";
import { Holding } from "../components/Holding";
import { useWallet } from "../wallet/WalletContext";
import { fetchMultisigInfo, isMember, type MultisigInfo } from "../solana/multisig";
import { fetchHoldings, type Holdings } from "../solana/treasury";
import { buildAllocation } from "../solana/allocation";
import { fetchPrices, WSOL_MINT, type PriceInfo } from "../solana/prices";
import { fetchTokenMetas, type TokenMeta } from "../solana/tokens";
import { nativeLogo } from "../config/logos";
import { activeMultisigAddress, multisigConfigured, multisigLabel } from "../config/multisig";
import { solscanAccount } from "../solana/connection";
import { colors, font, radius, shortAddress, spacing, usd } from "../theme";
import type { RootNav } from "../navigation";

const pctOf = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);

export function MultisigWalletScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { solanaAddress } = useWallet();
  const [info, setInfo] = useState<MultisigInfo | null>(null);
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [metas, setMetas] = useState<Record<string, TokenMeta>>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!multisigConfigured()) return;
    setLoading(true);
    try {
      const i = await fetchMultisigInfo();
      setInfo(i);
      if (i) {
        const h = await fetchHoldings(i.vault);
        setHoldings(h);
        const mints = h.tokens.map((t) => t.mint);
        const [p, m] = await Promise.all([
          fetchPrices([WSOL_MINT, ...mints]).catch(() => ({}) as Record<string, PriceInfo>),
          fetchTokenMetas(mints).catch(() => ({}) as Record<string, TokenMeta>),
        ]);
        setPrices(p);
        setMetas(m);
      }
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const member = isMember(info, solanaAddress);
  const label = multisigLabel(activeMultisigAddress());
  // A multisig vault holds only on-chain assets (no off-chain silver/dinar).
  const { slices, total, solUsd, sortedTokens } = buildAllocation(holdings, prices, metas, {}, false);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing(2) }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => nav.canGoBack() && nav.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{label}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6) }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={[colors.gradA, colors.gradB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroInner}>
            <Text style={styles.heroLabel}>
              Multisig vault{info ? ` · ${info.threshold} of ${info.members.length}` : ""}
            </Text>
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
              {holdings ? usd(total) : "—"}
            </Text>
            {info && (
              <View style={styles.addrRow}>
                <Text style={styles.addr}>{shortAddress(info.vault, 4, 4)}</Text>
                <Pressable
                  onPress={async () => {
                    await Clipboard.setStringAsync(info.vault);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  hitSlop={10}
                >
                  <Ionicons name={copied ? "checkmark" : "copy-outline"} size={14} color="#0A0A0C" />
                </Pressable>
              </View>
            )}
          </View>
        </LinearGradient>

        {info && (
          <Pressable onPress={() => Linking.openURL(solscanAccount(info.vault))} style={styles.verify}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
            <Text style={styles.verifyText}>
              {member ? "You're a signer" : "View only"} · verify on Solscan ↗
            </Text>
          </Pressable>
        )}

        {member && (
          <Pressable style={styles.primaryBtn} onPress={() => nav.navigate("ProposeTransfer")}>
            <Ionicons name="paper-plane" size={18} color={colors.bg} />
            <Text style={styles.primaryText}>Propose a transfer</Text>
          </Pressable>
        )}

        <View style={styles.actions}>
          <Pressable style={styles.action} onPress={() => nav.navigate("TreasuryMultisig")}>
            <Ionicons name="list-outline" size={20} color={colors.primary} />
            <Text style={styles.actionText}>Proposals</Text>
          </Pressable>
          {member && (
            <Pressable style={styles.action} onPress={() => nav.navigate("ManageSigners")}>
              <Ionicons name="people-outline" size={20} color={colors.primary} />
              <Text style={styles.actionText}>Signers</Text>
            </Pressable>
          )}
        </View>

        {loading && !holdings ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing(6) }} />
        ) : (
          <>
            {holdings && slices.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Allocation</Text>
                <View style={styles.chartCard}>
                  <PieChart data={slices} centerValue={usd(total)} centerLabel="Vault" />
                </View>
              </>
            )}

            <Text style={styles.sectionTitle}>Holdings</Text>
            <View style={styles.list}>
              <Holding
                symbol="SOL"
                name="Solana"
                amount={holdings?.sol ?? 0}
                usdValue={solUsd}
                pct={pctOf(solUsd, total)}
                logoURI={nativeLogo.solana}
                color={colors.accent}
              />
              {sortedTokens.map(({ t, value }) => {
                const meta = metas[t.mint];
                const price = prices[t.mint]?.usdPrice;
                return (
                  <View key={t.mint}>
                    <View style={styles.divider} />
                    <Holding
                      symbol={meta?.symbol ?? t.mint.slice(0, 3)}
                      name={meta?.name ?? shortAddress(t.mint, 4, 4)}
                      amount={t.amount}
                      usdValue={price != null ? value : undefined}
                      pct={pctOf(value, total)}
                      logoURI={meta?.logoURI}
                      color={colors.primary}
                    />
                  </View>
                );
              })}
              {sortedTokens.length === 0 && (holdings?.sol ?? 0) === 0 && (
                <Text style={styles.empty}>This vault is empty. Fund it by sending to the address above.</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(3) },
  title: { flex: 1, textAlign: "center", color: colors.text, fontSize: font.h3, fontWeight: "800" },
  hero: { borderRadius: radius.lg, padding: 1 },
  heroInner: { borderRadius: radius.lg - 1, padding: spacing(5), gap: spacing(1) },
  heroLabel: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  heroValue: { color: "#0A0A0C", fontSize: 38, fontWeight: "900", letterSpacing: -1 },
  addrRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginTop: spacing(1) },
  addr: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  verify: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(3) },
  verifyText: { color: colors.primary, fontSize: font.small, fontWeight: "600" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), backgroundColor: colors.primary, paddingVertical: spacing(3.5), borderRadius: radius.pill, marginTop: spacing(1) },
  primaryText: { color: colors.bg, fontSize: font.body, fontWeight: "800" },
  actions: { flexDirection: "row", gap: spacing(3), marginTop: spacing(3) },
  action: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, paddingVertical: spacing(3.5), borderRadius: radius.md },
  actionText: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(6),
    marginBottom: spacing(3),
  },
  chartCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing(4) },
  list: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing(4) },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  empty: { color: colors.textMuted, fontSize: font.small, paddingVertical: spacing(4), textAlign: "center" },
});
