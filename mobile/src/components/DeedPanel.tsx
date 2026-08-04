/**
 * The Property Deed, rendered as the agreement it is rather than a row of anonymous trait chips.
 *
 * Blocks in the order a holder actually asks the questions: what may I do with this, who holds it
 * and under what law, what does it cost to resell, and who issued it when.
 *
 * Two rules shape the whole component.
 *
 * **A right the deed never mentions is NOT shown as denied.** Unstated rights are omitted entirely,
 * because rendering a cross next to "Commercial rights" would have the app inventing a restriction
 * the creator never wrote.
 *
 * **Rights the app acts on are shown apart from rights that are only promises.** They used to render
 * identically, which meant "Resale allowed: No" — which turns a button off — looked exactly like
 * "Printing rights: No", which nothing anywhere reads. Both are real terms of the agreement; only
 * one has a mechanism, and a member deciding what they may safely do needs to know which is which.
 */
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "./Card";
import { ACTED_ON_RIGHTS, RIGHT_LABEL, RIGHT_ORDER, type Deed, type RightKey } from "../property/deed";
import type { Amendability } from "../property/onchainDeed";
import { copyPolicy, describeCopy } from "../property/keyCopy/policy";
import { colors, font, leading, radius, spacing, tracking, weight } from "../theme";

/** Two decimals, trailing zeros dropped — so 0.11% stays 0.11% and 10% doesn't read as "10.00%". */
const pct = (bps: number): string => `${Number((bps / 100).toFixed(2))}%`;

const date = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Rights({ deed, keys }: { deed: Deed; keys: RightKey[] }) {
  return (
    <View style={styles.rights}>
      {keys.map((r) => {
        const granted = deed.rights[r] === true;
        return (
          <View key={r} style={styles.rightRow}>
            <Ionicons
              name={granted ? "checkmark-circle" : "close-circle"}
              size={16}
              color={granted ? colors.positive : colors.negative}
            />
            <Text style={[styles.rightLabel, !granted && styles.rightDenied]}>{RIGHT_LABEL[r]}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function DeedPanel({
  deed,
  owner,
  amendability = "unknown",
}: {
  deed: Deed;
  owner?: string;
  /** Whether the issuer can still rewrite this deed. Defaults to saying nothing. */
  amendability?: Amendability;
}) {
  // Only rights the deed actually states — see the note at the top of this file.
  const stated = RIGHT_ORDER.filter((r) => deed.rights[r] !== undefined);
  // The offline tier this deed selects. Null for stream-only, which the panel stays quiet about.
  const policy = copyPolicy(deed);
  const copy = policy.kind === "stream-only" ? null : policy;
  const actedOn = stated.filter((r) => ACTED_ON_RIGHTS.has(r));
  const agreedOnly = stated.filter((r) => !ACTED_ON_RIGHTS.has(r));

  const economics: { label: string; value: string }[] = [];
  if (deed.creatorRoyaltyBps != null)
    economics.push({ label: "Creator royalty", value: pct(deed.creatorRoyaltyBps) });
  if (deed.treasuryAssessmentBps != null)
    economics.push({ label: "Treasury assessment", value: pct(deed.treasuryAssessmentBps) });
  if (deed.royaltyModel && deed.creatorRoyaltyBps == null)
    economics.push({ label: "Royalty model", value: deed.royaltyModel });

  // Who holds legal title, under what law, and where a dispute would be heard. A deed that says
  // none of this renders nothing rather than implying a structure that isn't there.
  const trust: { label: string; value: string }[] = [];
  if (deed.holdingTrust) trust.push({ label: "Held in trust by", value: deed.holdingTrust });
  if (deed.trustee) trust.push({ label: "Trustee", value: deed.trustee });
  if (deed.governingLaw) trust.push({ label: "Governing law", value: deed.governingLaw });
  if (deed.venue) trust.push({ label: "Venue", value: deed.venue });
  if (deed.trustVersion) trust.push({ label: "Trust version", value: deed.trustVersion });

  const footer: { label: string; value: string }[] = [];
  if (owner) footer.push({ label: "Owner", value: owner });
  if (deed.creator) footer.push({ label: "Creator", value: deed.creator });
  if (deed.license) footer.push({ label: "License", value: deed.license });
  if (deed.issuedAt != null) footer.push({ label: "Issued", value: date(deed.issuedAt) });
  if (deed.expiresAt === null) footer.push({ label: "Expires", value: "Never" });
  else if (deed.expiresAt != null) footer.push({ label: "Expires", value: date(deed.expiresAt) });
  if (deed.agreementVersion) footer.push({ label: "Agreement version", value: deed.agreementVersion });

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="ribbon-outline" size={16} color={colors.primary} />
        <Text style={styles.title}>Property Deed</Text>
      </View>

      {actedOn.length > 0 && (
        <>
          <Text style={styles.groupTitle}>The app follows these</Text>
          <Rights deed={deed} keys={actedOn} />
        </>
      )}

      {agreedOnly.length > 0 && (
        <>
          <Text style={styles.groupTitle}>Agreed with the creator</Text>
          <Rights deed={deed} keys={agreedOnly} />
          {/* Say what's actually true. These terms are real — they're just not ones any software
              here can act on, and rendering them identically to the ones it does act on quietly
              implies a mechanism that doesn't exist. */}
          <Text style={styles.groupNote}>Terms between you and the creator. Nothing here enforces them.</Text>
        </>
      )}

      {trust.length > 0 && (
        <View style={styles.block}>
          {trust.map((t) => (
            <Row key={t.label} label={t.label} value={t.value} />
          ))}
          {deed.interestFollowsKey === true && (
            <Text style={styles.groupNote}>
              The trust states that beneficial interest follows the key, so whoever holds this key
              holds the interest.
            </Text>
          )}
        </View>
      )}

      {economics.length > 0 && (
        <View style={styles.block}>
          {economics.map((e) => (
            <Row key={e.label} label={e.label} value={e.value} />
          ))}
          {deed.royaltyOutOfRange && (
            // Stated, but outside the platform's 0-25% limit. Show the number and say so rather
            // than clamping it silently — a deed that breaks the rules is worth knowing about.
            <Text style={styles.flag}>
              This royalty is above the 25% platform limit. Shown as the deed states it.
            </Text>
          )}
        </View>
      )}

      {footer.length > 0 && (
        <View style={styles.block}>
          {footer.map((f) => (
            <Row key={f.label} label={f.label} value={f.value} />
          ))}
        </View>
      )}

      {/* Whether these terms can still be rewritten. Read from the mint account — specifically from
          whether a metadata update authority still exists — rather than from any trait claiming it,
          because a trait saying "Terms Final" is written by the same authority that could take it
          back. `unknown` renders nothing: an ordinary Metaplex NFT has told us neither thing. */}
      {amendability === "final" && (
        <View style={styles.permanence}>
          <Ionicons name="lock-closed" size={14} color={colors.positive} />
          <Text style={styles.permanenceText}>
            These terms are final. The issuer gave up the ability to change them, so this deed reads
            the same forever.
          </Text>
        </View>
      )}
      {amendability === "amendable" && (
        <View style={styles.permanence}>
          <Ionicons name="create-outline" size={14} color={colors.textMuted} />
          <Text style={styles.permanenceText}>
            The issuer can still amend these terms. If they do, this wallet will show you what
            changed.
          </Text>
        </View>
      )}

      {/* What the deed permits this device to keep, in the words a member can act on. "Kept while
          you hold this key" is true of the ephemeral tier; "yours forever" would be a promise the
          deed never made. Nothing is shown for stream-only unless the member asked to download —
          the panel is not the place to explain an absence. */}
      {copy && (
        <View style={styles.permanence}>
          <Ionicons
            name={copy.kind === "retained" ? "download" : "cloud-download-outline"}
            size={14}
            color={copy.kind === "retained" ? colors.positive : colors.textMuted}
          />
          <Text style={styles.permanenceText}>{describeCopy(copy)}</Text>
        </View>
      )}

      <Text style={styles.provenance}>Read from this asset&apos;s on-chain metadata.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing(4), borderRadius: radius.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  title: {
    color: colors.primary,
    fontSize: font.tiny,
    fontWeight: weight.bold,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
  },
  groupTitle: {
    color: colors.textMuted,
    fontSize: font.tiny,
    fontWeight: weight.bold,
    letterSpacing: tracking.wider,
    textTransform: "uppercase",
    marginTop: spacing(3),
  },
  groupNote: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(2) },
  permanence: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing(2),
    marginTop: spacing(3),
  },
  permanenceText: {
    color: colors.textMuted,
    fontSize: font.tiny,
    flex: 1,
    lineHeight: font.tiny * leading.relaxed,
  },
  rights: { marginTop: spacing(2), gap: spacing(2) },
  rightRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  rightLabel: { color: colors.text, fontSize: font.body },
  rightDenied: { color: colors.textMuted },
  block: {
    marginTop: spacing(3),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    gap: spacing(2),
  },
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing(4) },
  rowLabel: { color: colors.textMuted, fontSize: font.small },
  rowValue: { color: colors.text, fontSize: font.small, fontWeight: weight.medium, flexShrink: 1, textAlign: "right" },
  flag: { color: colors.warning, fontSize: font.tiny, marginTop: spacing(1) },
  provenance: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(3) },
});
