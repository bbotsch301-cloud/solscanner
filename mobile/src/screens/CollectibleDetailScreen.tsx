/**
 * One piece of Property: full artwork, what it is, and its actions — Open its content, Send, View on
 * Solscan, Archive (done with it, still yours) and Mark as spam (junk). The item is read from the
 * collectibles snapshot, so the screen paints immediately and needs no loading state.
 *
 * Three things are then asked of the chain, after that first paint, because the snapshot cannot
 * answer them: the deed as the mint account actually holds it, whether the token program will accept
 * a transfer at all, and whether the terms have been rewritten since the member last read them.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PublicKey } from "@solana/web3.js";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "../components/ScreenHeader";
import { Artwork } from "../components/Artwork";
import { DeedPanel } from "../components/DeedPanel";
import { DeedChangeBanner } from "../components/DeedChangeBanner";
import { Button } from "../components/Button";
import { ContactPicker } from "../components/ContactPicker";
import {
  cachedCollectibles,
  fetchCollectible,
  isHiddenItem,
  removeCollectible,
  isArchived,
  setArchived,
  setHidden,
  type Collectible,
} from "../solana/collectibles";
import { HoldToConfirm } from "../components/HoldToConfirm";
import { burnCollectible, burnPreflight, type BurnPlan } from "../solana/burn";
import { sendPreflight, type SendPlan } from "../solana/sendable";
import { requestBrowserUrl } from "../browser/openRequest";
import { resolveAccess, accessVerb } from "../access/resolve";
import { KINDS } from "../property/kinds";
import { parseDeed, propertyStatus, deedAllowsTransfer } from "../property/deed";
import { withOnChainDeed, type Amendability } from "../property/onchainDeed";
import { loadSeenDeed, recordSeenDeed } from "../property/deedHistory";
import { deedChanges, type DeedDelta } from "../property/deedDiff";
import { openContentUrl } from "../access/openContent";
import { attemptGatedGrant } from "../access/vault";
import { keepCopyIfPermitted } from "../property/keyCopy";
import { vaultConfigured } from "../config/vault";
import { navigationRef } from "../navigationRef";
import { useWallet } from "../wallet/WalletContext";
import { solscanAccount } from "../solana/connection";
import { humanizeError } from "../solana/errors";
import { haptics } from "../ui/haptics";
import { colors, font, leading, radius, shortAddress, spacing, weight } from "../theme";
import type { RootNav, RootStackParamList } from "../navigation";

/**
 * Whether this opens in the in-app player rather than a browser tab.
 *
 * Kind first, mime second, and both are needed: a course is a course whatever file it carries, and a
 * `file` key with an mp4 in it is still something to watch. A vault-backed key has no mime until the
 * grant arrives, which is why kind has to be able to answer on its own.
 */
function isPlayable(item: Collectible, mime: string | undefined): boolean {
  if (item.kind === "music" || item.kind === "course") return true;
  return !!mime && (mime.startsWith("video/") || mime.startsWith("audio/"));
}


export function CollectibleDetailScreen() {
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "Collectible">>();
  const insets = useSafeAreaInsets();
  const { activeAddress, solanaAddress, sendToken, keypair } = useWallet();
  const owner = solanaAddress ?? activeAddress;
  const mint = route.params.mint;

  const cached = useMemo(
    () => (owner ? cachedCollectibles(owner)?.find((c) => c.mint === mint) : undefined),
    [owner, mint]
  );
  // The snapshot usually has it (the gallery just fetched); resolve it directly when it doesn't —
  // a deep link, a cleared cache, or an item received since the last refresh.
  const [fetched, setFetched] = useState<Collectible | null>(null);
  const [resolving, setResolving] = useState(!cached);
  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    void (async () => {
      const found = await fetchCollectible(mint);
      if (!cancelled) {
        setFetched(found);
        setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cached, mint]);

  const indexed = cached ?? fetched ?? undefined;

  // The deed, read from the mint account rather than from the indexer's summary of it. One RPC call
  // for the one asset on screen (which is why this isn't done in the gallery), and it resolves after
  // first paint — so the screen renders immediately from the snapshot and the terms firm up a moment
  // later, rather than the whole item waiting on the chain.
  const [onChain, setOnChain] = useState<Collectible | null>(null);
  const [amendability, setAmendability] = useState<Amendability>("unknown");
  // Has this deed been rewritten since the member last read it? The issuer keeps the authority to
  // do that, so §18's safeguard is that the change is visible rather than impossible — which needs
  // the wallet to remember. Resolved in the same effect below, once the terms have settled.
  const [delta, setDelta] = useState<DeedDelta | null>(null);
  useEffect(() => {
    if (!indexed) return;
    let cancelled = false;
    void (async () => {
      const enriched = await withOnChainDeed(indexed);
      if (cancelled) return;
      setAmendability(enriched.amendability);
      // Only re-render the item when the chain actually added something; withOnChainDeed hands back
      // the same object when it didn't, which is every asset that carries no deed.
      if (enriched.item !== indexed) setOnChain(enriched.item);

      // Only now — with the terms settled — compare them against what the member last read. This
      // sequencing is load-bearing: comparing the indexer's traits first and the merged ones a
      // moment later would diff the deed against itself and report every first view as an
      // amendment, which is the exact failure this is meant to prevent.
      const traits = enriched.item.attributes;
      if (!traits?.length) return;
      const previous = await loadSeenDeed(indexed.mint);
      if (cancelled) return;
      // First sight is a baseline, not a change. A diff against nothing is not an amendment, and
      // greeting someone with "these terms changed" the first time they open something is false.
      if (!previous) {
        void recordSeenDeed(indexed.mint, traits, Date.now());
        return;
      }
      const d = deedChanges(previous, traits);
      if (d.changes.length > 0) setDelta(d);
      else void recordSeenDeed(indexed.mint, traits, Date.now());
    })();
    return () => {
      cancelled = true;
    };
  }, [indexed]);

  const item = onChain ?? indexed;

  // Can this actually be sent? `item.transferable` is the indexer's word for "not compressed, not
  // programmable" — it says nothing about a Token-2022 NonTransferable mint, which the token program
  // itself refuses. Asked of the chain, once, rather than discovered by a failed transaction.
  const [sendPlan, setSendPlan] = useState<SendPlan | null>(null);
  useEffect(() => {
    if (!indexed || !owner) return;
    let cancelled = false;
    void (async () => {
      const plan = await sendPreflight(indexed, owner);
      if (!cancelled) setSendPlan(plan);
    })();
    return () => {
      cancelled = true;
    };
  }, [indexed, owner]);

  /** Acknowledge an amendment: the terms on screen become the ones compared against next time. */
  const acceptDelta = () => {
    const traits = (onChain ?? indexed)?.attributes;
    if (indexed && traits) void recordSeenDeed(indexed.mint, traits, Date.now());
    setDelta(null);
    haptics.tap();
  };

  // Derived from the item (so a freshly-fetched one is right too), with the user's tap taking over.
  const [override, setOverride] = useState<boolean | null>(null);
  const hiddenNow = override ?? (item ? isHiddenItem(item) : false);
  const [archivedOverride, setArchivedOverride] = useState<boolean | null>(null);
  const archivedNow = archivedOverride ?? isArchived(mint);
  const [sendOpen, setSendOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [burnOpen, setBurnOpen] = useState(false);
  const [burning, setBurning] = useState(false);
  const [burnPlan, setBurnPlan] = useState<BurnPlan | null>(null);
  // Sampled once at mount rather than during render (reading the clock mid-render isn't allowed,
  // and a term measured in days doesn't need to tick).
  const [now] = useState(() => Date.now());

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Property" size="modal" onClose={() => nav.goBack()} />
        <Text style={styles.missing}>
          {resolving ? "Loading…" : "This item is no longer in your wallet."}
        </Text>
      </View>
    );
  }

  const access = resolveAccess(item);

  // The deed: the agreement this property carries, read from its own metadata. `null` for anything
  // issued without one (ordinary art, third-party NFTs), which is why the panel is conditional.
  const deed = parseDeed(item);
  const status = propertyStatus(deed, now);
  // Two different questions, and the app used to only ask the first:
  //   `sendPlan`           — will the TOKEN PROGRAM accept a transfer, asked of the chain
  //   `deedAllowsTransfer` — does the AGREEMENT allow one
  // Send needs both. A silent deed states no restriction, so it doesn't withhold anything.
  const deedTransfer = deedAllowsTransfer(deed);
  // The chain's refusal outranks the deed's, because they are different kinds of statement: a
  // NonTransferable mint CANNOT move, and telling someone "its deed doesn't permit transfer" would
  // imply it otherwise could. "unreadable" is the exception — not being able to check is not a fact
  // about the token, so a deed that does say no is the better thing to report.
  const chainRefusal = sendPlan?.blocked && sendPlan.blocked !== "unreadable" ? sendPlan : null;
  const canSend = sendPlan?.blocked === null && deedTransfer !== false;

  // A key issued by the platform carries no on-chain URL — the deed is in the mint account and the
  // content is server-held. `resolveAccess` therefore returns null for it, and before this the
  // screen simply had no Open button, which made the whole publish/access path unreachable for
  // exactly the assets it was built for. A deed is the evidence that something is behind this; the
  // vault answers definitively when the member reaches for it, at the cost of one HTTP call and no
  // signature (access/vault.ts asks for the challenge before it asks for biometrics).
  const vaultMayHave = !access && !!deed && vaultConfigured() && !!keypair;

  const openBurn = async () => {
    if (!owner) return;
    haptics.tap();
    setBurnPlan(null);
    setBurnOpen(true);
    setBurnPlan(await burnPreflight(item, owner));
  };

  const doBurn = async () => {
    if (!keypair || !owner) return;
    setBurning(true);
    try {
      const { reclaimedSol } = await burnCollectible(keypair, item);
      haptics.success();
      // Gone from the chain — drop it locally too so the gallery doesn't show a ghost.
      removeCollectible(owner, item.mint);
      setBurnOpen(false);
      Alert.alert(
        "Burned",
        `"${item.name}" is gone for good.` +
          (reclaimedSol > 0 ? `\n\n${reclaimedSol.toFixed(5)} SOL of rent has been returned to your wallet.` : ""),
        [{ text: "Done", onPress: () => nav.goBack() }]
      );
    } catch (e) {
      haptics.error();
      Alert.alert("Burn failed", humanizeError(e, { action: "send", symbol: item.name, native: "SOL" }));
    } finally {
      setBurning(false);
    }
  };

  const openContent = async () => {
    if (!access && !vaultMayHave) return;
    haptics.tap();
    // Media plays inside the app, because the app is the only thing that can remember where you got
    // to. A custom tab is an OS surface: it cannot report a position, cannot be resumed, and takes
    // the whole grant with it when the system reclaims it. For a two-hour course that is the
    // difference between a library and a list of links.
    if (isPlayable(item, access?.mime)) {
      nav.navigate("Player", { mint: item.mint });
      return;
    }
    // A portal may need to talk to the wallet, so it keeps the bridged in-app browser. Everything
    // else goes to a custom tab, which is a real browser engine and can actually display files.
    if (access?.route === "browser") {
      requestBrowserUrl(access.url);
      nav.goBack();
      if (navigationRef.isReady()) navigationRef.navigate("Browser" as never);
      return;
    }
    // If the vault is configured and publishes this asset, prove ownership and open the
    // short-lived link it hands back. Unconfigured → null → the public link below, if there is one.
    let url: string | null = access?.url ?? null;
    if (keypair && owner) {
      setUnlocking(true);
      try {
        const grant = await attemptGatedGrant(item, owner, keypair);
        url = grant?.viewerUrl ?? grant?.url ?? url;
        // Keep a copy where the deed permits one. Fire-and-forget: the member is opening something
        // now and should not wait on a download to do it, and a copy that fails to save costs
        // nothing but the next open being online again.
        if (grant?.url) void keepCopyIfPermitted(item, owner, grant.url, deed, grant.mime);
      } catch (e) {
        // A refusal is real information — don't quietly open the public link instead.
        Alert.alert("Locked", e instanceof Error ? e.message : "This pass didn't unlock the content.");
        return;
      } finally {
        setUnlocking(false);
      }
    }

    // A key whose content is server-held and hasn't been published yet. That's a real answer and a
    // recoverable one — the creator publishes and it appears — so it's said rather than left as a
    // button that does nothing.
    if (!url) {
      Alert.alert(
        "Nothing published yet",
        `"${item.name}" is yours, but its content hasn't been published to the vault yet. It'll open here once the creator publishes it.`
      );
      return;
    }

    const r = await openContentUrl(url);
    if (r === "blocked")
      Alert.alert("Blocked", "This link is on the phishing blocklist, so it wasn't opened.");
    else if (r !== "opened") Alert.alert("Couldn't open", "This item's link could not be opened.");
  };

  const validRecipient = (() => {
    try {
      return recipient.trim().length > 0 && !!new PublicKey(recipient.trim());
    } catch {
      return false;
    }
  })();

  const doSend = () => {
    const to = recipient.trim();
    Alert.alert(
      "Send this item?",
      `Send "${item.name}" to:\n\n${to}\n\nDouble-check every character — sends can’t be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          style: "default",
          onPress: async () => {
            setSending(true);
            try {
              await sendToken(item.mint, to, 1, 0);
              haptics.success();
              setSendOpen(false);
              // Drop it locally so it leaves the gallery at once (the chain lags a moment).
              if (owner) removeCollectible(owner, item.mint);
              Alert.alert("Sent", `"${item.name}" was sent to ${shortAddress(to, 6, 6)}.`, [
                { text: "Done", onPress: () => nav.goBack() },
              ]);
            } catch (e) {
              haptics.error();
              Alert.alert("Send failed", humanizeError(e, { action: "send", symbol: item.name, native: "SOL" }));
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title={KINDS[item.kind].title} size="modal" onClose={() => nav.goBack()} />
      <ScrollView contentContainerStyle={{ padding: spacing(4), paddingBottom: insets.bottom + spacing(8) }} showsVerticalScrollIndicator={false}>
        <Artwork uri={item.image} name={item.name} radius={radius.lg} />

        <Text style={styles.name}>{item.name}</Text>
        {item.collection && (
          <View style={styles.collectionRow}>
            {item.collectionVerified && <Ionicons name="checkmark-circle" size={15} color={colors.primary} />}
            <Text style={styles.collection}>
              {item.collectionVerified ? "Verified collection" : "Collection"} · {shortAddress(item.collection, 4, 4)}
            </Text>
          </View>
        )}
        {status === "expired" && (
          <Text style={styles.statusExpired}>Expired · you still own it, but its term has ended</Text>
        )}
        {status === "expiring" && deed?.expiresAt != null && (
          <Text style={styles.statusExpiring}>
            Expires {new Date(deed.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </Text>
        )}
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

        {delta && <DeedChangeBanner delta={delta} onAcknowledge={acceptDelta} />}
        {deed && (
          <DeedPanel
            deed={deed}
            owner={owner ? shortAddress(owner, 4, 4) : undefined}
            amendability={amendability}
          />
        )}

        {/* Whatever the deed didn't claim. Splitting them this way means a trait is shown exactly
            once — in the deed if it's a deed term, here if it isn't — and never dropped. */}
        {(deed ? deed.extraTraits : (item.attributes ?? [])).length > 0 && (
          <View style={styles.attrs}>
            {(deed ? deed.extraTraits : (item.attributes ?? [])).map((a, i) => (
              <View key={i} style={styles.attrChip}>
                <Text style={styles.attrTrait}>{a.trait}</Text>
                <Text style={styles.attrValue}>{a.value}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          {(access || vaultMayHave) && (
            <Button
              label={unlocking ? "Unlocking…" : accessVerb(item.kind)}
              icon="open-outline"
              onPress={openContent}
              disabled={unlocking}
            />
          )}
          {chainRefusal ? (
            // A fact about the token, in the token program's words rather than the app's.
            <Text style={styles.noSend}>{chainRefusal.reason}</Text>
          ) : deedTransfer === false ? (
            // Careful with this sentence. The wallet CANNOT stop a transfer — a plain SPL NFT moves
            // with any other wallet or a CLI. Withholding Send states the agreement; only a
            // Token-2022 NonTransferable mint (or a rule set) enforces it. So say what's true.
            <Text style={styles.noSend}>Its deed doesn’t permit transfer, so Send is off here.</Text>
          ) : sendPlan?.blocked === "unreadable" ? (
            <Text style={styles.noSend}>{sendPlan.reason}</Text>
          ) : (
            // Rendered but disabled until the chain has answered, rather than appearing a moment
            // later — a Send button that materialises after the fact is one a member has already
            // decided isn't there.
            <Button
              label={canSend ? "Send" : "Checking…"}
              variant="secondary"
              icon="arrow-up"
              disabled={!canSend}
              onPress={() => setSendOpen(true)}
            />
          )}
          <Button
            label="View on Solscan"
            variant="secondary"
            icon="shield-checkmark-outline"
            onPress={() => Linking.openURL(solscanAccount(item.mint))}
          />
          {/* Archive is the everyday action — a used ticket or a past event, still yours, just
              out of the way. Marking something spam is a different (and rarer) judgement, so it
              sits below and only offers the direction that makes sense for the current state. */}
          <Button
            label={archivedNow ? "Restore to Property" : "Archive"}
            variant="secondary"
            icon={archivedNow ? "arrow-undo-outline" : "archive-outline"}
            onPress={() => {
              setArchived(mint, !archivedNow);
              setArchivedOverride(!archivedNow);
              haptics.tap();
            }}
          />
          {/* Burn is offered only on the spam bucket. It's irreversible, so it stays away from
              items the user has treated as real — archiving is the reversible option there. */}
          {hiddenNow && !item.compressed && (
            <Button label="Burn and reclaim rent" variant="danger" icon="flame-outline" onPress={openBurn} />
          )}
          <Button
            label={hiddenNow ? "Not spam — restore" : "Mark as spam"}
            variant="secondary"
            icon={hiddenNow ? "eye-outline" : "eye-off-outline"}
            onPress={() => {
              setHidden(mint, !hiddenNow);
              setOverride(!hiddenNow);
              haptics.tap();
            }}
          />
        </View>
      </ScrollView>

      {/* Burn confirmation. Irreversible, so it states plainly what will happen, what comes back,
          and requires a deliberate hold rather than a tap. */}
      <Modal visible={burnOpen} transparent animationType="slide" onRequestClose={() => !burning && setBurnOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => !burning && setBurnOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing(4) }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Burn “{item.name}”?</Text>
            {burnPlan === null ? (
              <Text style={styles.burnBody}>Checking this item…</Text>
            ) : burnPlan.blocked ? (
              <>
                <Text style={styles.burnBody}>{burnPlan.reason}</Text>
                <Button label="Close" variant="secondary" onPress={() => setBurnOpen(false)} />
              </>
            ) : (
              <>
                <Text style={styles.burnBody}>
                  This destroys the item permanently. It cannot be undone, and nobody — including
                  you — can recover it afterwards.
                </Text>
                <Text style={styles.burnReclaim}>
                  {burnPlan.reclaimSol.toFixed(5)} SOL of locked rent returns to your wallet.
                </Text>
                <HoldToConfirm
                  // Remount per open: the hold latches once it fires, so without this a failed
                  // burn would leave the button spent and un-retryable.
                  key={burnOpen ? "burn-open" : "burn-closed"}
                  label={burning ? "Burning…" : "Hold to burn"}
                  confirmedLabel="Burning…"
                  onConfirm={doBurn}
                  disabled={burning}
                />
                <Pressable onPress={() => !burning && setBurnOpen(false)} hitSlop={8} style={styles.burnCancel}>
                  <Text style={styles.burnCancelText}>Keep it</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Minimal send sheet — recipient + confirm; the transfer reuses the wallet's sendToken. */}
      <Modal visible={sendOpen} transparent animationType="slide" onRequestClose={() => setSendOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSendOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing(4) }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Send “{item.name}”</Text>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Recipient address</Text>
              <Pressable onPress={() => setPickerOpen(true)} hitSlop={8} style={styles.contactsBtn}>
                <Ionicons name="people" size={15} color={colors.primary} />
                <Text style={styles.contactsText}>Contacts</Text>
              </Pressable>
            </View>
            <TextInput
              value={recipient}
              onChangeText={setRecipient}
              placeholder="Solana address"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            {recipient.trim().length > 0 && !validRecipient && (
              <Text style={styles.warn}>That doesn’t look like a valid Solana address.</Text>
            )}
            <Button label="Send" onPress={doSend} disabled={!validRecipient} loading={sending} style={{ marginTop: spacing(4) }} />
          </Pressable>
        </Pressable>
      </Modal>
      <ContactPicker
        visible={pickerOpen}
        kind="solana"
        onClose={() => setPickerOpen(false)}
        onSelect={(addr) => setRecipient(addr)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  burnBody: { color: colors.textMuted, fontSize: font.body, lineHeight: font.body * leading.normal, marginBottom: spacing(3) },
  burnReclaim: { color: colors.positive, fontSize: font.small, fontWeight: weight.semibold, marginBottom: spacing(4) },
  burnCancel: { alignSelf: "center", paddingVertical: spacing(3) },
  burnCancelText: { color: colors.textMuted, fontSize: font.body, fontWeight: weight.semibold },
  missing: { color: colors.textMuted, fontSize: font.body, textAlign: "center", marginTop: spacing(10), paddingHorizontal: spacing(6) },
  name: { color: colors.text, fontSize: font.h2, fontWeight: weight.bold, marginTop: spacing(4) },
  collectionRow: { flexDirection: "row", alignItems: "center", gap: spacing(1.5), marginTop: spacing(1) },
  collection: { color: colors.textMuted, fontSize: font.small, fontWeight: weight.medium },
  desc: { color: colors.textMuted, fontSize: font.body, lineHeight: font.body * leading.relaxed, marginTop: spacing(3) },
  attrs: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2), marginTop: spacing(4) },
  attrChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    gap: 2,
  },
  attrTrait: { color: colors.textFaint, fontSize: font.tiny, fontWeight: weight.semibold, textTransform: "uppercase" },
  attrValue: { color: colors.text, fontSize: font.small, fontWeight: weight.semibold },
  actions: { marginTop: spacing(6), gap: spacing(3) },
  statusExpired: { color: colors.negative, fontSize: font.small, marginTop: spacing(1) },
  statusExpiring: { color: colors.warning, fontSize: font.small, marginTop: spacing(1) },
  noSend: { color: colors.textFaint, fontSize: font.small, textAlign: "center" },
  backdrop: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing(5),
    gap: spacing(2),
  },
  sheetTitle: { color: colors.text, fontSize: font.h3, fontWeight: weight.bold, marginBottom: spacing(2) },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: colors.textMuted, fontSize: font.small, fontWeight: weight.semibold },
  contactsBtn: { flexDirection: "row", alignItems: "center", gap: spacing(1) },
  contactsText: { color: colors.primary, fontSize: font.small, fontWeight: weight.bold },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    color: colors.text,
    fontSize: font.body,
    marginTop: spacing(2),
  },
  warn: { color: colors.warning, fontSize: font.small, marginTop: spacing(2) },
});
