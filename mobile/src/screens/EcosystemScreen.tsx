import * as Clipboard from "expo-clipboard";
import { useCallback, useRef, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { LayoutAnimation, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PieChart } from "../components/PieChart";
import { Holding } from "../components/Holding";
import { HeroCard } from "../components/HeroCard";
import { EmptyState } from "../components/EmptyState";
import { TokenAvatar } from "../components/TokenAvatar";
import { fetchHoldings, treasuryAddress, type Holdings } from "../solana/treasury";
import { buildAllocation } from "../solana/allocation";
import { fetchDeposits, type Deposit } from "../solana/deposits";
import { getSupply, getTransferFee, XGO_MINT, type TransferFee } from "../solana/token2022";
// The fee economics drive the swap flow but were displayed nowhere until now.
import { SWAP_FEE_BPS } from "../config/swapFee";
import { XGO_FEES } from "../config/xgo";
import { fetchPrices, WSOL_MINT, type PriceInfo } from "../solana/prices";
import { fetchTokenMetas, cachedTokenMetas, type TokenMeta } from "../solana/tokens";
import { fetchOffchainPrices, type OffchainPrices } from "../prices/offchain";
import { haptics } from "../ui/haptics";
import { Skeleton } from "../components/Skeleton";
import { solscanAccount } from "../solana/connection";
import { amount as fmtAmount, colors, compact, font, radius, shortAddress, spacing, timeAgo, usd } from "../theme";
import type { RootNav } from "../navigation";

function StatTile({ label, value, delta, deltaUp }: { label: string; value: string; delta?: string; deltaUp?: boolean }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {delta && <Text style={[styles.tileDelta, { color: deltaUp ? colors.positive : colors.textMuted }]}>{delta}</Text>}
    </View>
  );
}

// Last-good treasury data, kept in memory so returning to this tab shows instantly (then
// refreshes behind it) instead of a cold blank reload. Survives navigation, not app restart.
interface EcoSnapshot {
  holdings: Holdings;
  prices: Record<string, PriceInfo>;
  metas: Record<string, TokenMeta>;
  supply: number | null;
  fee: TransferFee | null;
  ocPrices: OffchainPrices;
  deposits: Deposit[];
}
const ecoCache = new Map<string, EcoSnapshot>();

export function EcosystemScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const TREASURY_ADDRESS = treasuryAddress();
  const seed = ecoCache.get(TREASURY_ADDRESS);
  const [holdings, setHoldings] = useState<Holdings | null>(seed?.holdings ?? null);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>(seed?.prices ?? {});
  const [metas, setMetas] = useState<Record<string, TokenMeta>>(seed?.metas ?? {});
  const [supply, setSupply] = useState<number | null>(seed?.supply ?? null);
  const [fee, setFee] = useState<TransferFee | null>(seed?.fee ?? null);
  const [ocPrices, setOcPrices] = useState<OffchainPrices>(seed?.ocPrices ?? {});
  const [deposits, setDeposits] = useState<Deposit[]>(seed?.deposits ?? []);
  const [depositsError, setDepositsError] = useState(false);
  const [depositsExpanded, setDepositsExpanded] = useState(false);
  const [otherExpanded, setOtherExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const lastLoadRef = useRef(0);
  const load = useCallback(async () => {
    lastLoadRef.current = Date.now();
    setLoading(true);
    try {
      const [h, s, f] = await Promise.all([
        fetchHoldings(treasuryAddress()),
        getSupply(XGO_MINT),
        getTransferFee(XGO_MINT).catch(() => null),
      ]);
      const mints = h.tokens.map((t) => t.mint);
      setHoldings(h);
      setSupply(s);
      setFee(f);
      // Seed names/logos synchronously from the warm cache so they render immediately with the
      // holdings (no flash of the contract address); the async fetch below fills in the rest.
      setMetas((prev) => ({ ...cachedTokenMetas(mints), ...prev }));
      // Deposits fail independently (heaviest RPC): null = couldn't load (keep last + flag the
      // error), an array = authoritative (incl. genuinely empty). Don't let it blank a good list.
      const [p, m, oc, d] = await Promise.all([
        fetchPrices([WSOL_MINT, ...mints]).catch(() => ({}) as Record<string, PriceInfo>),
        fetchTokenMetas(mints).catch(() => ({}) as Record<string, TokenMeta>),
        fetchOffchainPrices().catch(() => ({}) as OffchainPrices),
        fetchDeposits(treasuryAddress(), 15).then((x) => x, () => null as Deposit[] | null),
      ]);
      setPrices(p);
      setMetas((prev) => ({ ...prev, ...m }));
      setOcPrices(oc);
      const nextDeposits = d ?? ecoCache.get(treasuryAddress())?.deposits ?? [];
      setDeposits(nextDeposits);
      setDepositsError(d === null);
      ecoCache.set(treasuryAddress(), { holdings: h, prices: p, metas: m, supply: s, fee: f, ocPrices: oc, deposits: nextDeposits });
    } catch {
      /* keep last data */
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the tab regains focus (so a swap fee / any inflow shows without a manual pull),
  // but throttle so rapid tab-hopping doesn't refetch the whole treasury each time. Cached data
  // stays on screen meanwhile (state is seeded from ecoCache), so this refreshes behind it.
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadRef.current > 15_000) load();
    }, [load])
  );

  // The full Global Goshens treasury: on-chain holdings + off-chain silver + dinar, with the
  // long tail of crypto lumped into one "Other holdings" row so the list stays short.
  const { slices, rows, total: treasuryValue, solUsd, tokensUsd, offchainUsd } =
    buildAllocation(holdings, prices, metas, ocPrices, { topN: 5 });
  // The distinction that matters on a page whose job is proof: what anyone can check on-chain
  // versus what we simply state. buildAllocation already computes both; the screen just never used them.
  const onchainUsd = solUsd + tokensUsd;

  const depositsTotal = deposits.reduce((s, d) => s + (d.usd ?? 0), 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* No greeting: this stopped being the front door when Wallet took the first tab. You arrive
          here deliberately, to check something. */}
      <Text style={styles.greet}>Treasury</Text>
      <Text style={styles.greetSub}>Building the Kingdom Economy</Text>

      {/* Gated on the supply being unreadable — i.e. XGO isn't listed yet. Previously this was
          gated on IS_MAINNET, so it would have kept promising a launch after launch. */}
      {supply == null && (
        <View style={styles.soonBanner}>
          <Ionicons name="rocket-outline" size={16} color={colors.primary} />
          <Text style={styles.soonText}>
            The exchange is live. XGO treasury, supply, and governance activate when
            XGO launches on mainnet.
          </Text>
        </View>
      )}

      {/* Treasury value hero */}
      <HeroCard gap={spacing(1)}>
        <Text style={styles.heroLabel}>XGO Treasury Value</Text>
        {holdings ? (
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
            {usd(treasuryValue)}
          </Text>
        ) : (
          <Skeleton width={200} height={40} round={radius.sm} style={{ backgroundColor: "#0A0A0C33", marginVertical: spacing(1) }} />
        )}
        <View style={styles.addrRow}>
          <Text style={styles.addr}>{shortAddress(TREASURY_ADDRESS, 4, 4)}</Text>
          <Pressable
            onPress={async () => {
              await Clipboard.setStringAsync(TREASURY_ADDRESS);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            hitSlop={10}
          >
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={14} color="#0A0A0C" />
          </Pressable>
        </View>
      </HeroCard>

      <Pressable onPress={() => Linking.openURL(solscanAccount(TREASURY_ADDRESS))} style={styles.verify}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
        <Text style={styles.verifyText}>Public & verifiable on-chain — view on Solscan ↗</Text>
      </Pressable>

      {/* What's verifiable versus what's merely stated. Off-chain holdings are a manual figure —
          on a page about proof, that line must not blur. */}
      {holdings && treasuryValue > 0 && (
        <View style={styles.tiles}>
          <StatTile label="On-chain" value={usd(onchainUsd)} delta="anyone can verify" />
          <StatTile label="Stated off-chain" value={usd(offchainUsd)} delta="silver + dinar" />
        </View>
      )}

      {/* Supply and transfer fee are read live from the mint, which doesn't exist until XGO is
          listed — so pre-launch they'd render as two bare "—" tiles that read as broken. */}
      {supply != null || fee ? (
        <View style={styles.tiles}>
          <StatTile label="Total Supply" value={supply != null ? compact(supply) : "—"} delta="XGO" />
          <StatTile
            label="Transfer Fee"
            value={fee ? `${(fee.bps / 100).toFixed(2)}%` : "—"}
            delta="on every transfer"
          />
        </View>
      ) : (
        <Text style={styles.pending}>
          XGO supply and its transfer fee are read live from the chain, and appear here once XGO is
          listed.
        </Text>
      )}

      {/* The fee policy, stated as policy — never as measured income. These constants drive the
          actual swap flow but were displayed nowhere. */}
      <Text style={styles.sectionTitle}>How the treasury is funded</Text>
      <View style={styles.list}>
        <View style={styles.policyRow}>
          <Text style={styles.policyLabel}>Community fee on swaps</Text>
          <Text style={styles.policyValue}>{(SWAP_FEE_BPS / 100).toFixed(2)}%</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.policyRow}>
          <Text style={styles.policyLabel}>Swaps involving XGO</Text>
          <Text style={styles.policyValue}>Free</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.policyRow}>
          <Text style={styles.policyLabel}>XGO transfer fee → treasury</Text>
          <Text style={styles.policyValue}>{XGO_FEES.treasuryAllocation.toFixed(2)}%</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.policyRow}>
          <Text style={styles.policyLabel}>XGO transfer fee → permanent burn</Text>
          <Text style={styles.policyValue}>{XGO_FEES.permanentBurn.toFixed(2)}%</Text>
        </View>
      </View>
      <Text style={styles.policyNote}>
        Stated protocol policy. The deposits below are the actual arrivals, each one checkable on
        Solscan.
      </Text>

      {/* Allocation */}
      {holdings && slices.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Allocation</Text>
          <View style={styles.chartCard}>
            <PieChart data={slices} centerValue={usd(treasuryValue)} centerLabel="Total" />
          </View>
        </>
      )}

      {/* Holdings — top 5 crypto + Other, then off-chain silver/dinar */}
      <Text style={styles.sectionTitle}>Holdings</Text>
      <View style={styles.list}>
        {rows.map((r, i) => (
          <View key={r.key}>
            {i > 0 && <View style={styles.divider} />}
            {r.children && r.children.length > 0 ? (
              <>
                <Pressable
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    haptics.tap();
                    setOtherExpanded((o) => !o);
                  }}
                  hitSlop={6}
                >
                  <Holding
                    symbol={r.symbol}
                    name={r.name}
                    usdValue={r.usdValue}
                    pct={r.pct}
                    color={r.color}
                    subtitle={r.subtitle}
                    expandable
                    expanded={otherExpanded}
                  />
                </Pressable>
                {otherExpanded && (
                  <View style={styles.nested}>
                    {r.children.map((c, j) => (
                      <View key={c.key}>
                        {j > 0 && <View style={styles.divider} />}
                        <Holding
                          symbol={c.symbol}
                          name={c.name}
                          amount={c.amount}
                          usdValue={c.usdValue}
                          pct={c.pct}
                          logoURI={c.logoURI}
                          color={c.color}
                          size={32}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <Holding
                symbol={r.symbol}
                name={r.name}
                amount={r.amount}
                usdValue={r.usdValue}
                pct={r.pct}
                logoURI={r.logoURI}
                color={r.color}
                icon={r.icon}
                offchainDetail={r.offchainDetail}
                subtitle={r.subtitle}
              />
            )}
          </View>
        ))}
      </View>

      {/* Recent deposits — inflows to the treasury, incl. swap fees */}
      <Text style={styles.sectionTitle}>Recent deposits</Text>
      <View style={styles.tiles}>
        <StatTile label="Deposits" value={compact(deposits.length)} delta="recent" />
        <StatTile label="Total in" value={usd(depositsTotal)} delta="recent" deltaUp={depositsTotal > 0} />
      </View>
      <View style={[styles.list, { marginTop: spacing(3) }]}>
        {deposits.length === 0 && depositsError ? (
          <EmptyState
            icon="cloud-offline-outline"
            color={colors.warning}
            title="Couldn't load deposits"
            subtitle="The public RPC is rate-limited or unreachable, so history can't load. Add a dedicated RPC (a free Helius key works) for reliable deposits, or pull to refresh."
            cta={{ label: "Set a custom RPC", icon: "server-outline", onPress: () => nav.navigate("Settings") }}
          />
        ) : deposits.length === 0 ? (
          <EmptyState
            icon="arrow-down-circle-outline"
            title="No deposits yet"
            subtitle="Fees and inflows to the treasury show up here."
          />
        ) : (
          (depositsExpanded ? deposits : deposits.slice(0, 4)).map((d, i) => (
            <View key={`${d.signature}:${d.mint ?? "sol"}`}>
              {i > 0 && <View style={styles.divider} />}
              <Pressable
                onPress={() => Linking.openURL(d.explorerUrl)}
                style={({ pressed }) => [styles.depositRow, pressed && { opacity: 0.6 }]}
              >
                <View style={styles.inBadge}>
                  <Ionicons name="arrow-down" size={14} color={colors.positive} />
                </View>
                <TokenAvatar symbol={d.symbol} color={colors.primary} size={32} logoURI={d.logoURI} />
                <View style={styles.depMid}>
                  <Text style={styles.depTitle}>
                    +{fmtAmount(d.amountUi)} {d.symbol}
                  </Text>
                  <Text style={styles.depSub}>
                    {d.usd != null ? `${usd(d.usd)} · ` : ""}
                    {timeAgo(d.time) || "pending"}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={15} color={colors.textFaint} />
              </Pressable>
            </View>
          ))
        )}
      </View>
      {deposits.length > 4 && (
        <Pressable
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            haptics.tap();
            setDepositsExpanded((v) => !v);
          }}
          style={styles.moreToggle}
          hitSlop={8}
        >
          <Ionicons name={depositsExpanded ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
          <Text style={styles.moreText}>{depositsExpanded ? "Show less" : `Show more (${deposits.length - 4})`}</Text>
        </Pressable>
      )}

      <Text style={styles.note}>
        On-chain holdings, XGO supply, and the transfer fee are read live from the chain.
        Off-chain assets (silver, dinar) are stated and live-priced where possible.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  greet: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  pending: {
    color: colors.textMuted,
    fontSize: font.small,
    lineHeight: font.small * 1.5,
    marginTop: spacing(4),
  },
  policyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing(3),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(4),
  },
  policyLabel: { color: colors.textMuted, fontSize: font.small, flexShrink: 1 },
  policyValue: { color: colors.text, fontSize: font.small, fontWeight: "700" },
  policyNote: {
    color: colors.textFaint,
    fontSize: font.tiny,
    lineHeight: font.tiny * 1.5,
    marginTop: spacing(2),
  },
  greetSub: { color: colors.accent, fontSize: font.small, marginTop: 2, marginBottom: spacing(4), fontWeight: "600" },
  soonBanner: { flexDirection: "row", gap: spacing(2), alignItems: "flex-start", backgroundColor: colors.primary + "14", borderRadius: radius.md, padding: spacing(3.5), marginBottom: spacing(4) },
  soonText: { flex: 1, color: colors.primary, fontSize: font.small, lineHeight: 18 },
  heroLabel: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  heroValue: { color: "#0A0A0C", fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  addrRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginTop: spacing(1) },
  addr: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  verify: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(3) },
  verifyText: { color: colors.primary, fontSize: font.small, fontWeight: "600" },
  tiles: { flexDirection: "row", gap: spacing(2.5), marginTop: spacing(2) },
  tile: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(3), gap: 2 },
  tileLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700" },
  tileValue: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  tileDelta: { fontSize: font.tiny, fontWeight: "700" },
  chartCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing(4) },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(6),
    marginBottom: spacing(3),
  },
  list: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing(4) },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  nested: { marginLeft: spacing(3), paddingLeft: spacing(3), borderLeftWidth: 2, borderLeftColor: colors.cardBorder, marginBottom: spacing(2) },
  depositRow: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  inBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.positive + "22", alignItems: "center", justifyContent: "center" },
  depMid: { flex: 1, gap: 2 },
  depTitle: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  depSub: { color: colors.textMuted, fontSize: font.small },
  moreToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), paddingVertical: spacing(3), marginTop: spacing(1) },
  moreText: { color: colors.primary, fontSize: font.small, fontWeight: "700" },
  note: { color: colors.textFaint, fontSize: font.small, lineHeight: 18, marginTop: spacing(5) },
});
