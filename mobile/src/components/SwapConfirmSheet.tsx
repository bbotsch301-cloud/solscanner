/**
 * The swap confirmation, executing, and success states — one branded sheet instead of three OS
 * alerts.
 *
 * What this replaces was `Alert.alert("Confirm swap", "Swap 429958596.999247 BABYBONK for about
 * 0.2737 SOL via Jupiter? This uses real funds.")`: unstyled, unreadable (the raw amount), and
 * silent about everything the quote actually knows — price impact, minimum received, the community
 * fee, the one-time account rent, and whether the trade routes through the XGO treasury pool.
 *
 * The sheet stays mounted through execution, so the user never loses sight of an in-flight
 * transaction, and it can't be dismissed while one is running.
 */
import { useEffect, useState } from "react";
import { Animated, Easing, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "./TokenAvatar";
import { Button } from "./Button";
import { Crown } from "./Crown";
import { SuccessCheck } from "./SuccessCheck";
import { HoldToConfirm } from "./HoldToConfirm";
import { getLastFeeAttempt } from "../solana/feeDiagnostics";
import type { UnifiedQuote } from "../swap/types";
import {
  amount as fmtAmount,
  colors,
  compact,
  elevation,
  font,
  leading,
  radius,
  semantic,
  spacing,
  tracking,
  usd as fmtUsd,
  weight,
} from "../theme";

export type SwapPhase = "confirm" | "executing" | "success" | "error";

/** Price impact only matters once it's big enough to cost real money — colour it accordingly. */
function impactTone(pct: number): { color: string; warn: string | null } {
  if (pct >= 10) return { color: colors.negative, warn: `You'd lose about ${pct.toFixed(1)}% of your value to price impact on this trade.` };
  if (pct >= 3) return { color: colors.warning, warn: `Price impact is high — about ${pct.toFixed(1)}% of your value.` };
  return { color: colors.text, warn: null };
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone ? { color: tone } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** One side of the trade: artwork, compact amount, dollar value. */
function Leg({
  caption,
  symbol,
  logoURI,
  amountUi,
  usd,
}: {
  caption: string;
  symbol: string;
  logoURI?: string;
  amountUi: number;
  usd?: number;
}) {
  return (
    <View style={styles.leg}>
      <TokenAvatar symbol={symbol} color={colors.primary} size={40} logoURI={logoURI} />
      <View style={styles.legText}>
        <Text style={styles.legCaption}>{caption}</Text>
        {/* compact(), so a nine-digit memecoin balance reads as 429.96M rather than overflowing. */}
        <Text style={styles.legAmount} numberOfLines={1}>
          {compact(amountUi)} <Text style={styles.legSymbol}>{symbol}</Text>
        </Text>
      </View>
      <Text style={styles.legUsd}>{usd != null ? fmtUsd(usd) : "—"}</Text>
    </View>
  );
}

export function SwapConfirmSheet({
  visible,
  phase,
  quote,
  payAmount,
  slippageBps,
  payUsd,
  receiveUsd,
  status,
  signature,
  errorText,
  explorerUrl,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  phase: SwapPhase;
  quote: UnifiedQuote | null;
  /** What the user is paying, in UI units — the quote carries outUi but no input amount. */
  payAmount: number;
  slippageBps: number;
  payUsd: number | null;
  receiveUsd: number | null;
  status: string | null;
  signature: string | null;
  errorText: string | null;
  explorerUrl: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [spin] = useState(() => new Animated.Value(0));

  // The crown, turning while the swap is in flight — the app's own idiom for "working" rather than
  // a generic spinner.
  useEffect(() => {
    if (phase !== "executing") return;
    const anim = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => {
      anim.stop();
      spin.setValue(0);
    };
  }, [phase, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  if (!quote) return null;
  const inSym = quote.input.symbol;
  const outSym = quote.output.symbol;
  const impact = impactTone(quote.priceImpactPct);
  const rate = payAmount > 0 ? quote.outUi / payAmount : 0;
  const busy = phase === "executing";
  const fee = getLastFeeAttempt();
  const feeMissed = phase === "success" && fee && fee.swapSignature === signature && !fee.ok;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Not dismissable mid-flight: losing sight of an in-flight transaction is worse than being
      // stuck on a sheet for a few seconds.
      onRequestClose={busy ? () => {} : onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing(4) }]}>
          <View style={styles.handle} />

          {phase === "success" ? (
            <View style={styles.centered}>
              <SuccessCheck />
              <Text style={styles.successTitle}>Swapped</Text>
              <Text style={styles.successAmount}>
                You received {fmtAmount(quote.outUi)} {outSym}
              </Text>
              {feeMissed && (
                <Text style={styles.feeNote}>
                  The community fee didn&apos;t reach the treasury ({fee!.detail}). Your swap is unaffected.
                </Text>
              )}
              <View style={styles.footer}>
                {explorerUrl && (
                  <Button
                    label="View on explorer"
                    variant="secondary"
                    icon="open-outline"
                    style={styles.footerBtn}
                    onPress={() => Linking.openURL(explorerUrl)}
                  />
                )}
                <Button label="Done" style={styles.footerBtn} onPress={onClose} />
              </View>
            </View>
          ) : phase === "executing" ? (
            <View style={styles.centered}>
              <Animated.View style={{ transform: [{ rotate }] }}>
                <Crown size={104} />
              </Animated.View>
              <Text style={styles.execTitle}>Swapping</Text>
              {/* Real words on Solana now that executeSwap reports its stages — this used to be a
                  silent wait, because onStatus was dropped on the Solana branch. */}
              <Text style={styles.execStatus}>{status ?? "Working…"}</Text>
              <Text style={styles.execHint}>Keep the app open until this finishes.</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <Text style={styles.title}>Confirm swap</Text>

              <View style={styles.trade}>
                <Leg caption="You pay" symbol={inSym} logoURI={quote.input.logoURI} amountUi={payAmount} usd={payUsd ?? quote.inUsd} />
                <View style={styles.arrowWrap}>
                  <View style={styles.arrowLine} />
                  <Ionicons name="arrow-down" size={16} color={colors.primary} />
                  <View style={styles.arrowLine} />
                </View>
                <Leg caption="You receive" symbol={outSym} logoURI={quote.output.logoURI} amountUi={quote.outUi} usd={receiveUsd ?? quote.outUsd} />
              </View>

              {impact.warn && (
                <View style={[styles.warnBox, { borderColor: impact.color + "66", backgroundColor: impact.color + "14" }]}>
                  <Ionicons name="warning-outline" size={16} color={impact.color} />
                  <Text style={[styles.warnText, { color: impact.color }]}>{impact.warn}</Text>
                </View>
              )}

              <View style={styles.facts}>
                {rate > 0 && <Row label="Rate" value={`1 ${inSym} ≈ ${fmtAmount(rate)} ${outSym}`} />}
                <Row
                  label="Price impact"
                  value={`${quote.priceImpactPct < 0.01 ? "<0.01" : quote.priceImpactPct.toFixed(2)}%`}
                  tone={impact.color}
                />
                <Row label="Min received" value={`${fmtAmount(quote.minReceivedUi)} ${outSym}`} />
                <Row label="Slippage" value={`${slippageBps / 100}%`} />
                <Row
                  label="Community fee"
                  value={
                    quote.isTreasuryPair
                      ? "Free (XGO)"
                      : quote.feeBps > 0
                        ? `${(quote.feeBps / 100).toFixed(2)}% → treasury`
                        : "None"
                  }
                />
                {quote.feeAccountSetup && <Row label="Account setup (one-time)" value="~0.002 SOL" />}
                <Row label="Route" value={quote.routeLabels?.length ? quote.routeLabels.join(" → ") : quote.provider} />
              </View>

              {quote.venue === "treasury" && (
                <View style={styles.treasuryBox}>
                  <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
                  <Text style={styles.treasuryText}>
                    Routed through the XGO treasury pool — trading fees flow back to the treasury.
                  </Text>
                </View>
              )}
              {quote.fellBack && (
                <Text style={styles.fellBack}>
                  The treasury pool was priced
                  {quote.gapBps != null ? ` about ${(quote.gapBps / 100).toFixed(2)}% ` : " "}
                  worse, so this routes on the open market to protect your trade.
                </Text>
              )}

              {phase === "error" && errorText && (
                <View style={[styles.warnBox, { borderColor: colors.negative + "66", backgroundColor: colors.negative + "14" }]}>
                  <Ionicons name="close-circle-outline" size={16} color={colors.negative} />
                  <Text style={[styles.warnText, { color: colors.negative }]}>{errorText}</Text>
                </View>
              )}

              <View style={styles.confirmArea}>
                <HoldToConfirm
                  label={phase === "error" ? "Hold to try again" : `Hold to swap for ${outSym}`}
                  onConfirm={onConfirm}
                />
                <Pressable onPress={onClose} hitSlop={8} style={styles.cancel}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: semantic.overlay, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
    maxHeight: "92%",
    ...elevation(3),
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.cardBorder,
    marginBottom: spacing(3),
  },
  title: { color: colors.text, fontSize: font.h2, fontWeight: weight.bold, marginBottom: spacing(4) },

  trade: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
  },
  leg: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  legText: { flex: 1 },
  legCaption: { color: colors.textFaint, fontSize: font.tiny, fontWeight: weight.bold, textTransform: "uppercase", letterSpacing: tracking.wide },
  legAmount: { color: colors.text, fontSize: font.h3, fontWeight: weight.bold },
  legSymbol: { color: colors.textMuted, fontSize: font.body },
  legUsd: { color: colors.text, fontSize: font.body, fontWeight: weight.semibold },
  arrowWrap: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(3) },
  arrowLine: { flex: 1, height: 1, backgroundColor: colors.cardBorder },

  warnBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing(2),
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(3),
    marginTop: spacing(3),
  },
  warnText: { flex: 1, fontSize: font.small, fontWeight: weight.semibold, lineHeight: font.small * leading.normal },

  facts: { marginTop: spacing(4), gap: spacing(2) },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(3) },
  rowLabel: { color: colors.textMuted, fontSize: font.small },
  rowValue: { color: colors.text, fontSize: font.small, fontWeight: weight.semibold, flexShrink: 1, textAlign: "right" },

  treasuryBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing(2),
    marginTop: spacing(4),
    padding: spacing(3),
    borderRadius: radius.md,
    backgroundColor: colors.primary + "14",
    borderWidth: 1,
    borderColor: colors.primary + "44",
  },
  treasuryText: { flex: 1, color: colors.primary, fontSize: font.small, lineHeight: font.small * leading.normal },
  fellBack: { color: colors.textMuted, fontSize: font.small, marginTop: spacing(3), lineHeight: font.small * leading.normal },

  confirmArea: { marginTop: spacing(5), gap: spacing(2) },
  cancel: { alignSelf: "center", paddingVertical: spacing(3) },
  cancelText: { color: colors.textMuted, fontSize: font.body, fontWeight: weight.semibold },

  centered: { alignItems: "center", paddingVertical: spacing(6), gap: spacing(2) },
  execTitle: { color: colors.text, fontSize: font.h2, fontWeight: weight.bold, marginTop: spacing(3) },
  execStatus: { color: colors.primary, fontSize: font.body, fontWeight: weight.semibold },
  execHint: { color: colors.textFaint, fontSize: font.small, marginTop: spacing(1) },
  successTitle: { color: colors.text, fontSize: font.h1, fontWeight: weight.black, marginTop: spacing(3) },
  successAmount: { color: colors.textMuted, fontSize: font.h3 },
  feeNote: { color: colors.warning, fontSize: font.small, textAlign: "center", marginTop: spacing(2), lineHeight: font.small * leading.normal },
  footer: { flexDirection: "row", gap: spacing(3), marginTop: spacing(5), alignSelf: "stretch" },
  footerBtn: { flex: 1 },
});
