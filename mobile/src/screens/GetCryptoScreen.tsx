/**
 * "I have no crypto" — answered, without the app ever being part of the answer.
 *
 * Until now the wallet's response to an empty balance was "Send crypto to one of your addresses
 * (tap Receive) to get started", which is only useful to someone who already has crypto. For
 * everyone else it names the final step of a process nobody has described: what to buy, where, how
 * it reaches this app, and which of the four networks in the exchange's dropdown is the one that
 * doesn't lose the money.
 *
 * This screen describes that process and hands off. It sells nothing, embeds no checkout, holds no
 * key to any provider and takes no fee. `onramp/paths.ts` holds every decision and every word of
 * the disclosure, with tests over both — see the note there for why the boundary is expressed as
 * data rather than as a paragraph.
 *
 * ## What the screen itself is responsible for
 *
 * Two things the pure module can't do: copying the address (the first step of every route, and
 * pointless as an instruction if the address isn't right there), and opening a link in the
 * platform's own browser rather than an in-app view — `openContentUrl` gives a custom tab with the
 * provider's real address bar showing, so nobody can mistake their site for ours. Deliberately NOT
 * the bridged Browser tab: that one injects a wallet provider, and a page that can talk to the
 * wallet is exactly what a purchase page must not be.
 */
import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "../components/ScreenHeader";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { IconChip } from "../components/IconChip";
import { ChainSwitcher } from "../components/ChainSwitcher";
import { HelpTip } from "../components/HelpTip";
import { useWallet, useWalletStatus } from "../wallet/WalletContext";
import { IS_MAINNET } from "../solana/connection";
import { openContentUrl } from "../access/openContent";
import {
  FACILITATION,
  PROVIDERS,
  buySteps,
  fundingPaths,
  type FundingContext,
  type ProviderKind,
} from "../onramp/paths";
import { haptics } from "../ui/haptics";
import { colors, font, leading, radius, spacing, weight } from "../theme";
import type { RootNav } from "../navigation";

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

/** One numbered step, or — when it's the wrong-network warning — a bordered caution instead. */
function Step({ n, title, detail, warn }: { n: number; title: string; detail: string; warn?: boolean }) {
  if (warn) {
    return (
      <View style={styles.warnBox}>
        <Ionicons name="alert-circle" size={18} color={colors.negative} style={{ marginTop: 1 }} />
        <View style={styles.stepText}>
          <Text style={styles.warnTitle}>{title}</Text>
          <Text style={styles.warnDetail}>{detail}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={styles.stepText}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDetail}>{detail}</Text>
      </View>
    </View>
  );
}

export function GetCryptoScreen() {
  const nav = useNavigation<RootNav>();
  const { activeChain, activeAddress, airdrop } = useWallet();
  // Volatile status lives in its own context so a refresh doesn't re-render every `useWallet()`
  // consumer — same split HomeScreen uses for the faucet's own busy/error.
  const { busy, error } = useWalletStatus();
  const [copied, setCopied] = useState(false);
  /** Null until asked — there is no default and no recommended route. */
  const [via, setVia] = useState<ProviderKind | null>(null);

  const ctx: FundingContext = {
    chainId: activeChain.id,
    chainName: activeChain.name,
    symbol: activeChain.symbol,
    testNetwork: activeChain.kind === "solana" && !IS_MAINNET,
  };
  const paths = fundingPaths(ctx);
  const showBuy = paths.some((p) => p.id === "buy");
  const showFaucet = paths.some((p) => p.id === "faucet");

  const copy = async () => {
    if (!activeAddress) return;
    await Clipboard.setStringAsync(activeAddress);
    haptics.tap();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const open = async (url: string) => {
    const r = await openContentUrl(url);
    // `openContentUrl` refuses anything non-https or blocklisted, and falls back to the system
    // browser when no custom-tab provider exists. Only a genuinely dead link reaches here.
    if (r !== "opened") Linking.openURL(url).catch(() => {});
  };

  /**
   * The steps, numbered.
   *
   * The wrong-network caution isn't a step — it's a warning about the step above it — so it doesn't
   * take a number and the count skips it. Computed here rather than by ticking a counter inside the
   * render callback: that reads as harmless and is neither pure nor allowed.
   */
  const steps = (via ? buySteps(ctx, via) : []).map((s, i, all) => ({
    ...s,
    n: s.warn ? 0 : all.slice(0, i + 1).filter((x) => !x.warn).length,
  }));

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Get crypto"
        size="modal"
        onClose={() => nav.goBack()}
        paddingHorizontal={0}
        right={<HelpTip topic="gettingCrypto" size={22} />}
      />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Said before anything is tapped, not buried under the steps. */}
        <Card style={styles.notice} padding={spacing(4)}>
          <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text style={styles.noticeText}>{FACILITATION.short}</Text>
        </Card>

        {/* Which chain is being funded. The address, the coin and the network to withdraw over all
            change with it, so this can't be assumed — same reason Receive carries it. */}
        <View style={styles.switcher}>
          <ChainSwitcher />
        </View>

        {paths.map((p) => (
          <View key={p.id} style={styles.pathHead}>
            <View style={styles.pathTitleRow}>
              <Text style={styles.pathTitle}>{p.title}</Text>
              {!p.thirdParty && (
                <View style={styles.badge}>
                  <Ionicons name="shield-checkmark" size={11} color={colors.positive} />
                  <Text style={styles.badgeText}>No one else involved</Text>
                </View>
              )}
            </View>
            <Text style={styles.pathBlurb}>{p.blurb}</Text>

            {p.id === "receive" && (
              <Button
                label="Show my address"
                icon="qr-code-outline"
                variant="secondary"
                onPress={() => nav.navigate("Receive")}
                style={styles.pathBtn}
              />
            )}

            {p.id === "faucet" && (
              <>
                <Button
                  label={busy ? "Requesting…" : "Get test SOL"}
                  icon="water"
                  loading={busy}
                  onPress={airdrop}
                  style={styles.pathBtn}
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </>
            )}
          </View>
        ))}

        {showFaucet && (
          <Text style={styles.footnote}>
            Buying isn’t offered here because this is the test network — these coins are printed on
            request and can’t be bought. Switch to the real network in Settings when you’re ready.
          </Text>
        )}

        {showBuy && (
          <>
            {/* Step one of every route, so the thing it asks you to copy is right here. */}
            <Text style={styles.sectionTitle}>Your {activeChain.name} address</Text>
            <Pressable onPress={copy} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
              <Card style={styles.addrCard} padding={spacing(4)}>
                <Text style={styles.address} numberOfLines={2}>
                  {activeAddress}
                </Text>
                <Ionicons
                  name={copied ? "checkmark" : "copy-outline"}
                  size={18}
                  color={copied ? colors.positive : colors.textMuted}
                />
              </Card>
            </Pressable>
            <Text style={styles.addrHint}>
              This is where the coins land. It’s safe to share — it can receive, it can’t spend.
            </Text>

            <Text style={styles.sectionTitle}>How do you want to buy?</Text>
            {/* No default and no "recommended". The two are different purchases with different
                trade-offs, and picking for someone is the beginning of steering. */}
            <View style={styles.choices}>
              <Choice
                icon="business-outline"
                title="Through an exchange"
                blurb="An account you keep. Usually cheaper, more steps — you buy, then withdraw to your address yourself."
                selected={via === "exchange"}
                onPress={() => setVia("exchange")}
              />
              <Choice
                icon="card-outline"
                title="Card, one purchase"
                blurb="Sends straight to your address. Fewer steps, usually a worse rate, and the address is typed once."
                selected={via === "onramp"}
                onPress={() => setVia("onramp")}
              />
            </View>

            {via && (
              <>
                <View style={styles.steps}>
                  {steps.map((s) => (
                    <Step key={s.title} n={s.n} title={s.title} detail={s.detail} warn={s.warn} />
                  ))}
                </View>

                <Text style={styles.sectionTitle}>
                  {via === "exchange" ? "Exchanges" : "Card services"}
                </Text>
                <Text style={styles.listNote}>
                  Listed alphabetically. These aren’t recommendations and aren’t the only ones —
                  we’ve no relationship with any of them and receive nothing if you use one. Which
                  will serve you depends on your country.
                </Text>
                <Card style={styles.providers} padding={0}>
                  {PROVIDERS.filter((p) => p.kind === via).map((p, i) => (
                    <View key={p.name}>
                      {i > 0 && <View style={styles.divider} />}
                      <Pressable
                        onPress={() => open(p.url)}
                        style={({ pressed }) => [styles.providerRow, pressed && { opacity: 0.6 }]}
                      >
                        <Text style={styles.providerName}>{p.name}</Text>
                        <Text style={styles.providerHost}>{p.url.replace(/^https:\/\/|\/$/g, "")}</Text>
                        <Ionicons name="open-outline" size={16} color={colors.textFaint} />
                      </Pressable>
                    </View>
                  ))}
                </Card>
              </>
            )}
          </>
        )}

        <View style={styles.fullNotice}>
          <View style={styles.fullNoticeHead}>
            <IconChip icon="hand-left-outline" color={colors.textMuted} size={28} />
            <Text style={styles.fullNoticeTitle}>What XGO does and doesn’t do</Text>
          </View>
          {FACILITATION.full.map((line) => (
            <Text key={line} style={styles.fullNoticeText}>
              {line}
            </Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function Choice({
  icon,
  title,
  blurb,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  blurb: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.8 }, styles.choiceWrap]}>
      <Card style={[styles.choice, selected && styles.choiceOn]} padding={spacing(3.5)}>
        <IconChip icon={icon} color={selected ? colors.primary : colors.textMuted} size={32} />
        <Text style={[styles.choiceTitle, selected && { color: colors.primary }]}>{title}</Text>
        <Text style={styles.choiceBlurb}>{blurb}</Text>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  body: { paddingBottom: spacing(10), gap: spacing(1) },
  notice: { flexDirection: "row", gap: spacing(3), alignItems: "flex-start" },
  noticeText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: font.small,
    lineHeight: font.small * leading.relaxed,
  },
  switcher: { marginTop: spacing(4) },
  pathHead: { marginTop: spacing(5), gap: spacing(2) },
  pathTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), flexWrap: "wrap" },
  pathTitle: { color: colors.text, fontSize: font.h3, fontWeight: weight.bold },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1),
    backgroundColor: colors.positive + "1A",
    borderColor: colors.positive + "44",
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2),
    paddingVertical: 2,
  },
  badgeText: { color: colors.positive, fontSize: font.tiny, fontWeight: weight.semibold },
  pathBlurb: { color: colors.textMuted, fontSize: font.small, lineHeight: font.small * leading.relaxed },
  pathBtn: { marginTop: spacing(2) },
  error: { color: colors.negative, fontSize: font.small, marginTop: spacing(2) },
  footnote: {
    color: colors.textFaint,
    fontSize: font.small,
    lineHeight: font.small * leading.relaxed,
    marginTop: spacing(5),
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: weight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(7),
    marginBottom: spacing(2),
  },
  addrCard: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  address: {
    flex: 1,
    color: colors.text,
    fontSize: font.small,
    fontFamily: MONO,
    lineHeight: font.small * leading.relaxed,
  },
  addrHint: { color: colors.textFaint, fontSize: font.tiny, marginTop: spacing(2) },
  choices: { flexDirection: "row", gap: spacing(3) },
  choiceWrap: { flex: 1 },
  choice: { gap: spacing(2), height: "100%" },
  choiceOn: { borderColor: colors.primary },
  choiceTitle: { color: colors.text, fontSize: font.small, fontWeight: weight.bold },
  choiceBlurb: { color: colors.textFaint, fontSize: font.tiny, lineHeight: font.tiny * leading.relaxed },
  steps: { marginTop: spacing(6), gap: spacing(4) },
  step: { flexDirection: "row", gap: spacing(3) },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.primary + "22",
    borderWidth: 1,
    borderColor: colors.primary + "44",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { color: colors.primary, fontSize: font.tiny, fontWeight: weight.bold },
  stepText: { flex: 1, gap: spacing(1) },
  stepTitle: { color: colors.text, fontSize: font.body, fontWeight: weight.semibold },
  stepDetail: { color: colors.textMuted, fontSize: font.small, lineHeight: font.small * leading.relaxed },
  warnBox: {
    flexDirection: "row",
    gap: spacing(3),
    borderWidth: 1,
    borderColor: colors.negative + "55",
    backgroundColor: colors.negative + "14",
    borderRadius: radius.md,
    padding: spacing(3.5),
  },
  warnTitle: { color: colors.negative, fontSize: font.body, fontWeight: weight.bold },
  warnDetail: { color: colors.negative, fontSize: font.small, lineHeight: font.small * leading.relaxed },
  listNote: {
    color: colors.textFaint,
    fontSize: font.tiny,
    lineHeight: font.tiny * leading.relaxed,
    marginBottom: spacing(3),
  },
  providers: { overflow: "hidden" },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3.5),
  },
  providerName: { color: colors.text, fontSize: font.body, fontWeight: weight.semibold },
  providerHost: { flex: 1, color: colors.textFaint, fontSize: font.tiny, textAlign: "right" },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  fullNotice: { marginTop: spacing(8), gap: spacing(3) },
  fullNoticeHead: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  fullNoticeTitle: { color: colors.text, fontSize: font.body, fontWeight: weight.bold },
  fullNoticeText: {
    color: colors.textFaint,
    fontSize: font.tiny,
    lineHeight: font.tiny * leading.relaxed,
  },
});
