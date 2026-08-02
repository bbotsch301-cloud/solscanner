/**
 * Approval sheets for dApp-browser requests: a Connect sheet (grant an origin access to an account)
 * and a Sign sheet (decoded, per-request signature/transaction approval). Mirrors the WalletConnect
 * sheet styling so both surfaces feel identical.
 */
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, spacing } from "../theme";
import type { RequestSummary } from "../walletconnect/handlers";

function Buttons({ busy, onApprove, onReject, approveLabel, danger }: { busy: boolean; onApprove: () => void; onReject: () => void; approveLabel: string; danger?: boolean }) {
  return (
    <View style={styles.btnRow}>
      <Pressable onPress={onReject} disabled={busy} style={[styles.btn, styles.reject]}>
        <Text style={styles.rejectText}>Reject</Text>
      </Pressable>
      <Pressable onPress={onApprove} disabled={busy} style={[styles.btn, danger ? styles.approveDanger : styles.approve]}>
        {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={[styles.approveText, danger && { color: colors.text }]}>{approveLabel}</Text>}
      </Pressable>
    </View>
  );
}

export function ConnectSheet({
  visible,
  host,
  kind,
  address,
  chainName,
  busy,
  onApprove,
  onReject,
}: {
  visible: boolean;
  host: string;
  kind: "evm" | "solana";
  address: string | null;
  chainName: string;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onReject}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <Ionicons name="globe-outline" size={22} color={colors.primary} />
          </View>
          <Text style={styles.title}>Connect to {host}?</Text>
          <Text style={styles.method}>{kind === "solana" ? "Solana" : "Ethereum / EVM"} · {chainName}</Text>
          <View style={styles.reqBox}>
            <View style={styles.reqRow}>
              <Text style={styles.reqLabel}>Account</Text>
              <Text style={styles.reqValue}>{short}</Text>
            </View>
          </View>
          <Text style={styles.body}>
            This site will see your public address and can request signatures. It can&apos;t move funds
            without your approval on each request.
          </Text>
          <Buttons busy={busy} onApprove={onApprove} onReject={onReject} approveLabel="Connect" />
        </View>
      </View>
    </Modal>
  );
}

export function SignSheet({
  visible,
  host,
  method,
  summary,
  busy,
  onApprove,
  onReject,
}: {
  visible: boolean;
  host: string;
  method: string;
  summary: RequestSummary | null;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onReject}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{summary?.title ?? "Review request"}</Text>
          <Text style={styles.method}>{host} · {method}</Text>
          <View style={styles.reqBox}>
            {(summary?.lines ?? []).map((l, i) => (
              <View key={i} style={styles.reqRow}>
                <Text style={styles.reqLabel}>{l.label}</Text>
                <Text style={styles.reqValue} numberOfLines={4}>
                  {l.value}
                </Text>
              </View>
            ))}
          </View>
          {summary?.danger && <Text style={styles.warn}>{summary.danger}</Text>}
          <Text style={styles.subtle}>Only approve if you trust this site and understand this action.</Text>
          <Buttons busy={busy} onApprove={onApprove} onReject={onReject} approveLabel="Approve" danger={!!summary?.danger} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000AA", alignItems: "center", justifyContent: "center", padding: spacing(5) },
  sheet: { width: "100%", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.lg, padding: spacing(5), gap: spacing(3) },
  iconWrap: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center" },
  title: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  method: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  body: { color: colors.textMuted, fontSize: font.small, lineHeight: 19 },
  reqBox: { backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing(3), gap: spacing(2) },
  reqRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing(3) },
  reqLabel: { color: colors.textFaint, fontSize: font.tiny, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  reqValue: { color: colors.text, fontSize: font.small, flexShrink: 1, textAlign: "right" },
  warn: { color: colors.negative, fontSize: font.small, fontWeight: "700", lineHeight: 18 },
  subtle: { color: colors.textMuted, fontSize: font.small },
  btnRow: { flexDirection: "row", gap: spacing(3), marginTop: spacing(2) },
  btn: { flex: 1, paddingVertical: spacing(3.5), borderRadius: radius.pill, alignItems: "center" },
  reject: { backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.cardBorder },
  rejectText: { color: colors.text, fontSize: font.body, fontWeight: "800" },
  approve: { backgroundColor: colors.primary },
  approveDanger: { backgroundColor: colors.negative },
  approveText: { color: colors.bg, fontSize: font.body, fontWeight: "800" },
});
