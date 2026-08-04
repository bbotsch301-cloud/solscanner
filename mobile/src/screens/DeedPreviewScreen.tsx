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
 */
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScreenHeader } from "../components/ScreenHeader";
import { DeedPanel } from "../components/DeedPanel";
import { parseDeed, propertyStatus } from "../property/deed";
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
          <DeedPanel deed={deed} owner="you" />
        ) : (
          <Text style={styles.note}>The sample parsed to no deed — that is a bug in the fixture.</Text>
        )}

        <Text style={styles.note}>
          Note what is absent as much as what is present. This sample says nothing about updates, so
          &ldquo;Updates included&rdquo; does not appear at all — not as a cross. A deed that is
          silent has not refused, and drawing a cross would invent a restriction the creator never
          wrote.
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
