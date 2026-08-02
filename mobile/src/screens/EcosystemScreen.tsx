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
import { HelpTip } from "../components/HelpTip";
import { TokenAvatar } from "../components/TokenAvatar";
import { fetchHoldings, treasuryAddress, type Holdings } from "../solana/treasury";
import { buildAllocation } from "../solana/allocation";
import { fetchDeposits, lastDepositScan, type Deposit } from "../solana/deposits";
import { getSupply, getTransferFee, XGO_MINT, type TransferFee } from "../solana/token2022";
// The fee economics drive the swap flow but were displayed nowhere until now.
import { SWAP_FEE_BPS } from "../config/swapFee";
import { XGO_FEE_TOTAL } from "../config/xgo";
import { fetchPrices, cachedPrices, WSOL_MINT, type PriceInfo } from "../solana/prices";
import { fetchTokenMetas, cachedTokenMetas, type TokenMeta } from "../solana/tokens";
import { fetchOffchainPrices, type OffchainPrices } from "../prices/offchain";
import { ecoSnapshots } from "../cache/screens";
import { haptics } from "../ui/haptics";
import { Skeleton, SkeletonRow } from "../components/Skeleton";
import { Updating } from "../components/Updating";
import { solscanAccount } from "../solana/connection";
import { amount as fmtAmount, colors, compact, font, radius, shortAddress, spacing, timeAgo, usd } from "../theme";
import type { RootNav } from "../navigation";

function StatTile({
  label,
  value,
  delta,
  deltaUp,
  loading,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaUp?: boolean;
  /** True until the real figure is known. A tile that prints "0" while loading is a lie; this
   *  shows the shape of the number instead. */
  loading?: boolean;
}) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      {loading ? (
        <Skeleton width={72} height={22} style={{ marginVertical: spacing(1) }} />
      ) : (
        <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      )}
      {delta && <Text style={[styles.tileDelta, { color: deltaUp ? colors.positive : colors.textMuted }]}>{delta}</Text>}
    </View>
  );
}

export function EcosystemScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const TREASURY_ADDRESS = treasuryAddress();
  // Seeded from DISK, not just from memory: a cold open now paints the last-known treasury on the
  // first frame instead of counting up from $0.00 while the RPC round-trips.
  const seed = ecoSnapshots.get(TREASURY_ADDRESS);
  const [holdings, setHoldings] = useState<Holdings | null>(seed?.holdings ?? null);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>(seed?.prices ?? {});
  // Names/logos are persisted per-mint by solana/tokens.ts, so they're read from there rather
  // than stored in the snapshot — one copy, no chance of the two disagreeing.
  const [metas, setMetas] = useState<Record<string, TokenMeta>>(() =>
    seed ? cachedTokenMetas(seed.holdings.tokens.map((t) => t.mint)) : {}
  );
  const [supply, setSupply] = useState<number | null>(seed?.supply ?? null);
  const [fee, setFee] = useState<TransferFee | null>(seed?.fee ?? null);
  const [ocPrices, setOcPrices] = useState<OffchainPrices>(seed?.ocPrices ?? {});
  const [deposits, setDeposits] = useState<Deposit[]>(seed?.deposits ?? []);
  // "Never fetched" and "fetched, found none" look identical in an empty array — but the first
  // must show a skeleton and the second an empty state. This is the difference.
  const [depositsLoaded, setDepositsLoaded] = useState(seed != null);
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
      // Seed names/logos AND prices synchronously from the warm caches, so the holdings render
      // complete the moment they arrive — no flash of a contract address, and no window where a
      // real holding is priced at $0.00 just because the price call hasn't returned yet.
      setMetas((prev) => ({ ...cachedTokenMetas(mints), ...prev }));
      setPrices((prev) => ({ ...cachedPrices([WSOL_MINT, ...mints]), ...prev }));
      // Deposits fail independently (heaviest RPC): null = couldn't load (keep last + flag the
      // error), an array = authoritative (incl. genuinely empty). Don't let it blank a good list.
      const [p, m, oc, d] = await Promise.all([
        fetchPrices([WSOL_MINT, ...mints]).catch(() => ({}) as Record<string, PriceInfo>),
        fetchTokenMetas(mints).catch(() => ({}) as Record<string, TokenMeta>),
        fetchOffchainPrices().catch(() => ({}) as OffchainPrices),
        fetchDeposits(treasuryAddress(), 15).then((x) => x, () => null as Deposit[] | null),
      ]);
      // A failed price call must not wipe the cached prices we're already painting with.
      const nextPrices = Object.keys(p).length ? p : cachedPrices([WSOL_MINT, ...mints]);
      setPrices(nextPrices);
      setMetas((prev) => ({ ...prev, ...m }));
      setOcPrices(oc);
      const nextDeposits = d ?? ecoSnapshots.get(treasuryAddress())?.deposits ?? [];
      setDeposits(nextDeposits);
      if (d !== null) setDepositsLoaded(true);
      setDepositsError(d === null);
      ecoSnapshots.set(treasuryAddress(), {
        holdings: h,
        prices: nextPrices,
        ocPrices: oc,
        deposits: nextDeposits,
        supply: s,
        fee: f,
      });
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
  const { slices, rows, total: treasuryValue, solUsd, tokensUsd, offchainUsd, priced, unpriced } =
    buildAllocation(holdings, prices, metas, ocPrices, { topN: 5 });
  // The distinction that matters on a page whose job is proof: what anyone can check on-chain
  // versus what we simply state. buildAllocation already computes both; the screen just never used them.
  const onchainUsd = solUsd + tokensUsd;

  // The three states every figure on this page has to be able to be in. A zero is a FACT, so it
  // may only be printed when we actually know the value is zero.
  //   • nothing known yet          → skeleton
  //   • known but being refreshed  → the number, with the Updating cue
  //   • known and current          → just the number
  const noPricingAtAll = priced === 0 && unpriced > 0;
  const valueKnown = holdings != null && !noPricingAtAll;
  // Partial pricing is common (small tokens genuinely have no market), so an incomplete total is
  // still worth showing — it just isn't final, and says so.
  const valueStale = loading || unpriced > 0;

  const depositsTotal = deposits.reduce((s, d) => s + (d.usd ?? 0), 0);
  const depositsPriced = deposits.every((d) => d.usd != null);
  const scan = lastDepositScan();

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
        <View style={styles.heroLabelRow}>
          <Text style={styles.heroLabel}>XGO Treasury Value</Text>
          {valueKnown && valueStale && <Updating compact color="#0A0A0C" />}
        </View>
        {valueKnown ? (
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
      {valueKnown && treasuryValue > 0 && (
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

      {/* One line plus a (?) rather than a four-row table: this is policy a user reads once and
          then never needs again, and it was outweighing the numbers it exists to explain. */}
      <View style={styles.fundedRow}>
        <Ionicons name="git-branch-outline" size={15} color={colors.primary} />
        <Text style={styles.fundedText}>
          Funded by a {(SWAP_FEE_BPS / 100).toFixed(2)}% swap fee and {XGO_FEE_TOTAL.toFixed(2)}% on
          XGO transfers
        </Text>
        <HelpTip topic="treasuryFunding" size={16} />
      </View>

      {/* Allocation */}
      {valueKnown && slices.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Allocation</Text>
          <View style={styles.chartCard}>
            <PieChart data={slices} centerValue={usd(treasuryValue)} centerLabel="Total" />
          </View>
        </>
      )}

      {/* Holdings — top 5 crypto + Other, then off-chain silver/dinar */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Holdings</Text>
        {holdings != null && loading && <Updating style={{ marginTop: spacing(5) }} />}
      </View>
      <View style={styles.list}>
        {holdings == null
          ? [0, 1, 2].map((k) => (
              <View key={`hsk${k}`}>
                {k > 0 && <View style={styles.divider} />}
                <SkeletonRow />
              </View>
            ))
          : rows.map((r, i) => (
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
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Recent deposits</Text>
        {depositsLoaded && loading && <Updating style={{ marginTop: spacing(5) }} />}
      </View>
      <View style={styles.tiles}>
        <StatTile label="Deposits" value={compact(deposits.length)} delta="recent" loading={!depositsLoaded} />
        <StatTile
          label="Total in"
          // Deposits whose token has no price contribute nothing to the sum, so the total would
          // read as complete when it isn't. Say so rather than under-report.
          value={depositsPriced ? usd(depositsTotal) : `${usd(depositsTotal)}+`}
          delta="recent"
          deltaUp={depositsTotal > 0}
          loading={!depositsLoaded}
        />
      </View>
      <View style={[styles.list, { marginTop: spacing(3) }]}>
        {/* Never fetched yet — an empty state here would claim there are no deposits when we
            simply haven't looked. */}
        {!depositsLoaded && !depositsError ? (
          [0, 1, 2].map((k) => (
            <View key={`dsk${k}`}>
              {k > 0 && <View style={styles.divider} />}
              <SkeletonRow />
            </View>
          ))
        ) : deposits.length === 0 && depositsError ? (
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

      {scan && (
        // This feed has been "fixed" several times on guesses about where coverage was being lost.
        // Showing what the scan actually reached turns the next report into evidence.
        <Text style={styles.scanNote}>
          Scanned {scan.scannedAccounts} of {scan.tokenAccounts + 1} treasury accounts ·{" "}
          {scan.signatures} transactions · {scan.deposits} inflows found
        </Text>
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
  scanNote: {
    color: colors.textFaint,
    fontSize: font.tiny,
    marginTop: spacing(2),
    lineHeight: font.tiny * 1.4,
  },
  fundedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    marginTop: spacing(4),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(4),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
  },
  fundedText: { flex: 1, color: colors.textMuted, fontSize: font.small, lineHeight: font.small * 1.4 },
  pending: {
    color: colors.textMuted,
    fontSize: font.small,
    lineHeight: font.small * 1.5,
    marginTop: spacing(4),
  },
  greetSub: { color: colors.accent, fontSize: font.small, marginTop: 2, marginBottom: spacing(4), fontWeight: "600" },
  soonBanner: { flexDirection: "row", gap: spacing(2), alignItems: "flex-start", backgroundColor: colors.primary + "14", borderRadius: radius.md, padding: spacing(3.5), marginBottom: spacing(4) },
  soonText: { flex: 1, color: colors.primary, fontSize: font.small, lineHeight: 18 },
  heroLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  // The section heading with room for the Updating cue on its right. The heading keeps its own
  // top margin, so the cue is nudged down to sit on its baseline rather than above it.
  sectionRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
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
