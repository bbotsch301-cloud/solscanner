/**
 * Agreements — every agreement this member has accepted, with the evidence.
 *
 * Version, date, the document's sha256, and the wallet signature over all three. Nothing here is
 * ever removed: an agreement you're no longer under is still one you were once under, so a superseded
 * version stays listed rather than being overwritten by its replacement.
 *
 * Records made at the first-run gate start unsigned, because no wallet existed yet. Those show a
 * Sign button rather than pretending to a proof they don't have.
 */
import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { ScreenHeader } from "../components/ScreenHeader";
import { PressableScale } from "../components/PressableScale";
import { acceptanceHistory, signPending, type AgreementRecord } from "../agreements/record";
import { useWallet } from "../wallet/WalletContext";
import { haptics } from "../ui/haptics";
import { colors, font, radius, shortAddress, spacing, tracking, weight } from "../theme";
import type { RootNav } from "../navigation";

const when = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isFinite(t)
    ? new Date(t).toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : iso;
};

/** Enough of a hash to compare by eye, without a wall of hex. */
const shortHash = (h: string): string => `${h.slice(0, 8)}…${h.slice(-8)}`;

function Field({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {onCopy ? (
        <PressableScale haptic={null} onPress={onCopy} style={styles.copyRow}>
          <Text style={styles.fieldValue}>{value}</Text>
          <Ionicons name="copy-outline" size={13} color={colors.textFaint} />
        </PressableScale>
      ) : (
        <Text style={styles.fieldValue}>{value}</Text>
      )}
    </View>
  );
}

function RecordCard({ r, onOpen }: { r: AgreementRecord; onOpen: () => void }) {
  const copy = (label: string, value: string) => {
    void Clipboard.setStringAsync(value);
    haptics.tap();
    Alert.alert("Copied", `${label} copied to the clipboard.`);
  };

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.title}>{r.title}</Text>
        <View style={[styles.pill, r.signature ? styles.pillSigned : styles.pillUnsigned]}>
          <Ionicons
            name={r.signature ? "shield-checkmark" : "time-outline"}
            size={11}
            color={r.signature ? colors.positive : colors.warning}
          />
          <Text style={[styles.pillText, { color: r.signature ? colors.positive : colors.warning }]}>
            {r.signature ? "Signed" : "Unsigned"}
          </Text>
        </View>
      </View>

      <Field label="Version" value={String(r.version)} />
      <Field label="Accepted" value={when(r.acceptedAt)} />
      <Field label="SHA-256" value={shortHash(r.hash)} onCopy={() => copy("Document hash", r.hash)} />
      {r.wallet && <Field label="Wallet" value={shortAddress(r.wallet, 4, 4)} />}
      {r.signature && (
        <Field
          label="Signature"
          value={shortHash(r.signature)}
          onCopy={() => copy("Signature", r.signature!)}
        />
      )}
      {!r.signature && (
        <Text style={styles.note}>
          Recorded before this wallet existed, so there was no key to sign with. What was agreed and
          when is still pinned by the hash above.
        </Text>
      )}

      <Button label="Read the document" variant="secondary" icon="document-text-outline" onPress={onOpen} />
    </Card>
  );
}

export function AgreementsScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<RootNav>();
  const { solanaAddress, keypair } = useWallet();
  const [records, setRecords] = useState<AgreementRecord[] | null>(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await acceptanceHistory();
      if (!cancelled) setRecords(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unsigned = (records ?? []).filter((r) => !r.signature).length;

  const doSign = async () => {
    if (!solanaAddress || !keypair) return;
    setSigning(true);
    try {
      const n = await signPending(solanaAddress, keypair);
      setRecords(await acceptanceHistory());
      if (n > 0) {
        haptics.success();
        Alert.alert("Signed", `${n} agreement${n === 1 ? "" : "s"} now carry your wallet signature.`);
      }
    } finally {
      setSigning(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Agreements" onBack={() => nav.goBack()} />
      <ScrollView
        contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }}
        showsVerticalScrollIndicator={false}
      >
        {records === null ? null : records.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="No agreements recorded"
            subtitle="Agreements you accept are recorded here with their version, date, document hash and your signature."
          />
        ) : (
          <>
            {unsigned > 0 && keypair && solanaAddress && (
              <Card style={styles.signCard}>
                <Text style={styles.signText}>
                  {unsigned} agreement{unsigned === 1 ? "" : "s"} {unsigned === 1 ? "is" : "are"} recorded
                  but not signed. Signing proves this wallet stands behind {unsigned === 1 ? "it" : "them"}.
                </Text>
                <Button label="Sign with this wallet" icon="create-outline" onPress={doSign} loading={signing} />
              </Card>
            )}
            {records.map((r, i) => (
              <RecordCard key={`${r.doc}-${r.version}-${i}`} r={r} onOpen={() => nav.navigate("Legal", { doc: r.doc })} />
            ))}
            <Text style={styles.footer}>
              Records are kept on this device and are never removed — a superseded agreement stays
              listed alongside the version that replaced it.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: { marginBottom: spacing(3), borderRadius: radius.md, gap: spacing(2) },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(2) },
  title: { color: colors.text, fontSize: font.h3, fontWeight: weight.semibold, flexShrink: 1 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing(2), paddingVertical: 3, borderRadius: radius.pill },
  pillSigned: { backgroundColor: colors.positive + "1A" },
  pillUnsigned: { backgroundColor: colors.warning + "1A" },
  pillText: { fontSize: font.tiny, fontWeight: weight.bold, letterSpacing: tracking.wide },
  field: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(4) },
  fieldLabel: { color: colors.textMuted, fontSize: font.small },
  fieldValue: { color: colors.text, fontSize: font.small, fontWeight: weight.medium, flexShrink: 1, textAlign: "right" },
  copyRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), flexShrink: 1 },
  note: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(1) },
  signCard: { marginBottom: spacing(4), borderRadius: radius.md, gap: spacing(3) },
  signText: { color: colors.text, fontSize: font.small },
  footer: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(2) },
});
