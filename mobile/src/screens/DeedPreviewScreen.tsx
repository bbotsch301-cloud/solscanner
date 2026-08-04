/**
 * A worked example of a Property Deed, rendered by the real `DeedPanel` from the real `parseDeed`.
 *
 * Development only. It exists because the deed work is invisible without an asset carrying the
 * right metadata: a wallet holding no deed-bearing property shows nothing, which looks identical to
 * the feature being broken. This puts a full deed on screen with nothing to mint and no devnet
 * detour, so the rendering can actually be reviewed.
 *
 * The sample is `fixtures/sample-property-deed.json` — the same file an issuer would work from, so
 * this screen also proves those trait names parse. Nothing here is a real asset, and the screen says
 * so on it.
 *
 * It also covers the states that would otherwise need a devnet mint and a creator willing to rewrite
 * a deed to see: terms final versus amendable, and the amendment banner. Those are read from the
 * chain in the real screen, so this is the only place they can be reviewed at all.
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../components/ScreenHeader";
import { DeedPanel } from "../components/DeedPanel";
import { DeedChangeBanner } from "../components/DeedChangeBanner";
import { parseDeed, propertyStatus } from "../property/deed";
import { deedChanges } from "../property/deedDiff";
import type { Collectible } from "../solana/collectibles";
import { colors, font, spacing } from "../theme";
import sample from "../../fixtures/sample-property-deed.json";

/** The fixture as the app would see it after DAS mapping: `trait_type` becomes `trait`. */
const item: Collectible = {
  mint: "SampleDeedPreview1111111111111111111111111",
  name: sample.name,
  description: sample.description,
  collectionVerified: false,
  kind: "book",
  attributes: sample.attributes.map((a) => ({ trait: a.trait_type, value: a.value })),
  compressed: false,
  transferable: true,
  likelySpam: false,
};

// Derived once, at module scope: the sample is a constant, so parsing it during render would be
// both wasted work and an impure call in a component body.
const deed = parseDeed(item);
const status = propertyStatus(deed, Date.now());

/**
 * The same deed after the issuer amended it — the case the wallet exists to make visible.
 *
 * Three kinds of change on purpose, because they read differently and all three have to look right:
 * a right withdrawn (the one the app acts on), a figure raised, and a term that was stated becoming
 * unstated. The version is bumped here; `unbumped` below is the same amendment without that
 * courtesy, which is the case a member could never detect for themselves.
 */
const amended = item.attributes!.flatMap((a) => {
  if (a.trait === "Resale Allowed") return [{ ...a, value: "No" }];
  if (a.trait === "Creator Royalty") return [{ ...a, value: "20%" }];
  if (a.trait === "Vault Storage") return []; // stated before, silent now
  if (a.trait === "Agreement Version") return [{ ...a, value: "1.1" }];
  return [a];
});
const unbumped = amended.map((a) => (a.trait === "Agreement Version" ? { ...a, value: "1.0" } : a));

const delta = deedChanges(item.attributes!, amended);
const deltaUnbumped = deedChanges(item.attributes!, unbumped);

export function DeedPreviewScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Deed preview" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.note}>
          A sample, not an asset you own. It renders through the same parser and the same panel a real
          Property uses, so what you see here is what a member sees there.
        </Text>

        <Text style={styles.meta}>
          {item.name} · status: {status}
        </Text>

        {deed ? (
          <DeedPanel deed={deed} owner="you" amendability="amendable" />
        ) : (
          <Text style={styles.note}>The sample parsed to no deed — that is a bug in the fixture.</Text>
        )}

        <Text style={styles.note}>
          Note what is absent as much as what is present. This sample says nothing about updates, so
          &ldquo;Updates included&rdquo; does not appear at all — not as a cross. A deed that is
          silent has not refused, and drawing a cross would invent a restriction the creator never
          wrote.
        </Text>

        <Text style={styles.meta}>The same deed, with the terms locked</Text>
        {deed && <DeedPanel deed={deed} owner="you" amendability="final" />}
        <Text style={styles.note}>
          The difference between these two panels is the last line, and it is the most important line
          on either. It is read from whether the mint still has a metadata update authority — never
          from a trait claiming it, because a trait saying the terms are final is written by the very
          authority that could write it back.
        </Text>

        <Text style={styles.meta}>After an amendment</Text>
        <DeedChangeBanner delta={delta} onAcknowledge={() => {}} />
        <Text style={styles.note}>
          A right withdrawn, a royalty raised, and a term that was stated going silent. The new terms
          are what apply — they are what the chain says — so the banner reports the change rather than
          disputing it.
        </Text>

        <Text style={styles.meta}>The same amendment, with the version left alone</Text>
        <DeedChangeBanner delta={deltaUnbumped} onAcknowledge={() => {}} />
        <Text style={styles.note}>
          This is the case the record exists for. With no version bump there is nothing in the deed
          itself marking that anything moved, so the only evidence is what the wallet remembered.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  note: { color: colors.textMuted, fontSize: font.small, marginTop: spacing(4), lineHeight: 20 },
  meta: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(4) },
});
