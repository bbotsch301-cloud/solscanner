/**
 * One transaction, in full: what moved, what it cost, and when.
 *
 * The activity list deliberately shows only the headline — this is where the rest lives, so tapping
 * a row keeps you in the app instead of bouncing to a block explorer. The explorer is still one tap
 * away at the bottom for anyone who wants the raw truth.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "../components/ScreenHeader";
import { TokenAvatar } from "../components/TokenAvatar";
import { Button } from "../components/Button";
import { Skeleton } from "../components/Skeleton";
import { enrichActivity, type AssetMove, type HistoryItem } from "../activity";
import { useWallet } from "../wallet/WalletContext";
import { solscanTx } from "../solana/connection";
import { haptics } from "../ui/haptics";
import {
  amount as fmtAmount,
  colors,
  font,
  leading,
  radius,
  shortAddress,
  spacing,
  usd as fmtUsd,
  weight,
} from "../theme";
import type { RootNav, RootStackParamList } from "../navigation";

const TITLE: Record<string, string> = {
  swap: "Swapped",
  received: "Received",
  sent: "Sent",
  interaction: "Interaction",
  failed: "Failed",
};

function Leg({ move, sign }: { move: AssetMove; sign: "+" | "−" }) {
  return (
    <View style={styles.leg}>
      <TokenAvatar symbol={move.symbol} color={colors.primary} size={36} logoURI={move.logoURI} />
      <View style={styles.legMid}>
        <Text style={[styles.legAmount, sign === "+" && { color: colors.positive }]} numberOfLines={1}>
          {sign}
          {fmtAmount(move.amount)} {move.symbol}
        </Text>
        {move.usd != null && <Text style={styles.legUsd}>{fmtUsd(move.usd)}</Text>}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

export function TransactionDetailScreen() {
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "TransactionDetail">>();
  const insets = useSafeAreaInsets();
  const { activeChain, activeAddress } = useWallet();
  const seed = route.params.item;

  // The list passes the row it already has, so this paints instantly. If that row hadn't been
  // parsed yet, finish the job here rather than showing a signature and nothing else.
  const [item, setItem] = useState<HistoryItem>(seed);
  useEffect(() => {
    if (seed.kind !== null) return;
    let cancelled = false;
    void (async () => {
      const [enriched] = await enrichActivity(activeChain, activeAddress, [seed]);
      if (!cancelled && enriched) setItem(enriched);
    })();
    return () => {
      cancelled = true;
    };
  }, [seed, activeChain, activeAddress]);

  const [copied, setCopied] = useState(false);
  const when = useMemo(
    () =>
      item.time
        ? new Date(item.time * 1000).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "Pending",
    [item.time]
  );

  const kind = item.kind ?? (item.failed ? "failed" : null);
  const explorer = item.explorerUrl || solscanTx(item.id);

  const copy = async () => {
    await Clipboard.setStringAsync(item.id);
    haptics.tap();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={kind ? TITLE[kind] : "Transaction"} size="modal" onClose={() => nav.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}
        showsVerticalScrollIndicator={false}
      >
        {item.kind === null && !item.failed ? (
          <View style={styles.card}>
            <Skeleton width="60%" height={18} />
            <Skeleton width="40%" height={12} style={{ marginTop: spacing(2) }} />
          </View>
        ) : item.moveIn.length === 0 && item.moveOut.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.none}>
              {item.failed
                ? "This transaction failed, so nothing moved."
                : "No assets moved — this was a contract interaction, such as an approval or an account change."}
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            {item.moveOut.map((m, i) => (
              <Leg key={`o${i}`} move={m} sign="−" />
            ))}
            {item.moveOut.length > 0 && item.moveIn.length > 0 && (
              <View style={styles.arrowRow}>
                <View style={styles.line} />
                <Ionicons name="arrow-down" size={15} color={colors.primary} />
                <View style={styles.line} />
              </View>
            )}
            {item.moveIn.map((m, i) => (
              <Leg key={`i${i}`} move={m} sign="+" />
            ))}
          </View>
        )}

        {/* Prices come from the live feed, so this is what the assets are worth now — not what they
            were worth when the transaction happened. Say so rather than let it be misread. */}
        {(item.moveIn[0]?.usd != null || item.moveOut[0]?.usd != null) && (
          <Text style={styles.priceNote}>Dollar values are at today&apos;s price.</Text>
        )}

        <View style={styles.details}>
          <Row label="Status" value={item.failed ? "Failed" : "Confirmed"} />
          <Row label="When" value={when} />
          {item.feeSol != null && item.feeSol > 0 && <Row label="Network fee" value={`${item.feeSol.toFixed(6)} SOL`} />}
          <Row label="Network" value={activeChain.name} />
        </View>

        <Pressable onPress={copy} style={styles.sigBox}>
          <View style={styles.sigMid}>
            <Text style={styles.sigLabel}>Transaction ID</Text>
            <Text style={styles.sig} numberOfLines={1}>{shortAddress(item.id, 10, 10)}</Text>
          </View>
          <Ionicons name={copied ? "checkmark" : "copy-outline"} size={17} color={copied ? colors.positive : colors.textMuted} />
        </Pressable>

        <Button
          label="View on Solscan"
          variant="secondary"
          icon="open-outline"
          style={{ marginTop: spacing(4) }}
          onPress={() => Linking.openURL(explorer)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
  },
  leg: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  legMid: { flex: 1 },
  legAmount: { color: colors.text, fontSize: font.h3, fontWeight: weight.bold },
  legUsd: { color: colors.textMuted, fontSize: font.small, marginTop: 2 },
  arrowRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(3) },
  line: { flex: 1, height: 1, backgroundColor: colors.cardBorder },
  none: { color: colors.textMuted, fontSize: font.body, lineHeight: font.body * leading.normal },
  priceNote: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(2) },
  details: { marginTop: spacing(5), gap: spacing(3) },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(3) },
  rowLabel: { color: colors.textMuted, fontSize: font.small },
  rowValue: { color: colors.text, fontSize: font.small, fontWeight: weight.semibold, flexShrink: 1, textAlign: "right" },
  sigBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    marginTop: spacing(5),
    padding: spacing(3),
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  sigMid: { flex: 1 },
  sigLabel: { color: colors.textFaint, fontSize: font.tiny, fontWeight: weight.semibold },
  sig: { color: colors.text, fontSize: font.small, fontWeight: weight.medium, marginTop: 2 },
});
