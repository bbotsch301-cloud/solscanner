/**
 * The last look before funds leave, as a designed surface rather than a system dialog.
 *
 * Send was the odd one out. Swapping holds to confirm through `SwapConfirmSheet`, burning an NFT
 * holds to confirm on the collectible screen — and the most irreversible everyday action in the app
 * asked for a tap in an `Alert.alert`. That is one mis-aimed thumb from money gone, on the screen
 * where that matters most.
 *
 * ## The warnings are the real reason this exists
 *
 * The alert built one string: amount, recipient, fee, the address-poisoning warning and the
 * spend-everything caution, all joined with blank lines. A system dialog renders that as one block
 * of grey body text — so "this closely resembles a different address you've used before" carried
 * exactly the same visual weight as the network fee. The warning that exists to stop a scam looked
 * like a footnote.
 *
 * Here they are warnings: their own boxes, their own colour, above the control that commits. Nothing
 * about what is checked has changed — `findLookalike` and the balance caution are computed exactly
 * where they were. This is about whether a member can SEE them.
 */
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { HoldToConfirm } from "./HoldToConfirm";
import { colors, elevation, font, leading, radius, semantic, spacing, weight } from "../theme";

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} numberOfLines={mono ? undefined : 1}>
        {value}
      </Text>
    </View>
  );
}

function Warn({ text, danger }: { text: string; danger?: boolean }) {
  const color = danger ? colors.negative : colors.warning;
  return (
    <View style={[styles.warnBox, { borderColor: color + "55", backgroundColor: color + "14" }]}>
      <Ionicons
        name={danger ? "alert-circle" : "warning-outline"}
        size={16}
        color={color}
        style={{ marginTop: 1 }}
      />
      <Text style={[styles.warnText, { color }]}>{text}</Text>
    </View>
  );
}

export function SendConfirmSheet({
  visible,
  amount,
  symbol,
  network,
  /** Full address — shown whole, never truncated. Truncation is how a poisoned lookalike slips by. */
  to,
  /** Address-book name, when this recipient has one. */
  contactName,
  fee,
  /** The address this one imitates, already shortened for display. Null when nothing resembles it. */
  lookalike,
  /** "You're sending your entire balance…", or null. */
  caution,
  busy,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  amount: string;
  symbol: string;
  network: string;
  to: string;
  contactName?: string | null;
  fee?: string | null;
  lookalike?: string | null;
  caution?: string | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Not dismissable mid-flight, matching the swap sheet: losing sight of a transaction that may
      // already be on its way is worse than being held on a sheet for a few seconds.
      onRequestClose={busy ? () => {} : onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing(4) }]}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <Text style={styles.title}>Confirm send</Text>

            <View style={styles.amountWrap}>
              <Text style={styles.amount} numberOfLines={1} adjustsFontSizeToFit>
                {amount}
              </Text>
              <Text style={styles.symbol}>{symbol}</Text>
            </View>

            <View style={styles.card}>
              {contactName ? <Row label="To" value={contactName} /> : null}
              {/* The full address, in a monospaced face, on its own lines. The one job of this
                  screen is that a member can compare it character by character with what they
                  meant — an ellipsis in the middle is precisely where a lookalike hides. */}
              <Row label={contactName ? "Address" : "To"} value={to} mono />
              <View style={styles.divider} />
              <Row label="Network" value={network} />
              {fee ? (
                <>
                  <View style={styles.divider} />
                  <Row label="Estimated network fee" value={fee} />
                </>
              ) : null}
            </View>

            {lookalike ? (
              <Warn
                danger
                text={`This closely resembles a different address you've used before (${lookalike}). Address-poisoning scams rely on lookalikes — be certain this is the one you mean.`}
              />
            ) : null}
            {caution ? <Warn text={caution} /> : null}

            <Text style={styles.finality}>
              Double-check every character. A send cannot be undone, and nobody can reverse it.
            </Text>

            <View style={styles.confirmArea}>
              <HoldToConfirm label={`Hold to send ${symbol}`} confirmedLabel="Sending…" onConfirm={onConfirm} disabled={busy} />
              <Pressable onPress={onClose} disabled={busy} hitSlop={8} style={styles.cancel}>
                <Text style={[styles.cancelText, busy && { opacity: 0.4 }]}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
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
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.cardBorder,
    marginBottom: spacing(3),
  },
  title: { color: colors.text, fontSize: font.h2, fontWeight: weight.bold, marginBottom: spacing(3) },
  amountWrap: { flexDirection: "row", alignItems: "flex-end", gap: spacing(2), marginBottom: spacing(4) },
  amount: { color: colors.text, fontSize: font.h1, fontWeight: weight.black },
  symbol: { color: colors.textMuted, fontSize: font.h3, fontWeight: weight.bold, paddingBottom: spacing(1) },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(1),
  },
  row: { paddingVertical: spacing(3), gap: spacing(1) },
  rowLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: weight.semibold },
  rowValue: { color: colors.text, fontSize: font.body, fontWeight: weight.semibold },
  mono: { fontFamily: "Courier", fontSize: font.small, lineHeight: font.small * leading.relaxed },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  warnBox: {
    flexDirection: "row",
    gap: spacing(2),
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(3),
    marginTop: spacing(3),
  },
  warnText: { flex: 1, fontSize: font.small, fontWeight: weight.semibold, lineHeight: font.small * leading.normal },
  finality: {
    color: colors.textMuted,
    fontSize: font.small,
    lineHeight: font.small * leading.relaxed,
    marginTop: spacing(4),
  },
  confirmArea: { marginTop: spacing(5), gap: spacing(1) },
  cancel: { alignSelf: "center", paddingVertical: spacing(3) },
  cancelText: { color: colors.textMuted, fontSize: font.body, fontWeight: weight.semibold },
});
