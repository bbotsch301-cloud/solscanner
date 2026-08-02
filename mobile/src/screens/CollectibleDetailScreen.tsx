/**
 * One Collection item: full artwork, what it is, and its actions — Open its content, Send
 * (standard NFTs only), View on Solscan, Archive (done with it, still yours) and Mark as spam
 * (junk). The item is read from the collectibles snapshot, so this screen needs no loading state.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PublicKey } from "@solana/web3.js";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "../components/ScreenHeader";
import { Artwork } from "../components/Artwork";
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
import { requestBrowserUrl } from "../browser/openRequest";
import { resolveAccess, accessVerb } from "../access/resolve";
import { openContentUrl } from "../access/openContent";
import { attemptGatedUrl } from "../access/vault";
import { navigationRef } from "../navigationRef";
import { useWallet } from "../wallet/WalletContext";
import { solscanAccount } from "../solana/connection";
import { humanizeError } from "../solana/errors";
import { haptics } from "../ui/haptics";
import { colors, font, leading, radius, shortAddress, spacing, weight } from "../theme";
import type { RootNav, RootStackParamList } from "../navigation";

const KIND_LABEL: Record<Collectible["kind"], string> = {
  ticket: "Ticket",
  membership: "Membership",
  book: "Book",
  portal: "Portal",
  file: "File",
  art: "Collectible",
};

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

  const item = cached ?? fetched ?? undefined;
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

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Collection" size="modal" onClose={() => nav.goBack()} />
        <Text style={styles.missing}>
          {resolving ? "Loading…" : "This item is no longer in your collection."}
        </Text>
      </View>
    );
  }

  const access = resolveAccess(item);

  const openContent = async () => {
    if (!access) return;
    haptics.tap();
    // A portal may need to talk to the wallet, so it keeps the bridged in-app browser. Everything
    // else goes to a custom tab, which is a real browser engine and can actually display files.
    if (access.route === "browser") {
      requestBrowserUrl(access.url);
      nav.goBack();
      if (navigationRef.isReady())
        navigationRef.navigate({ name: "Tabs", params: { screen: "Browser" } } as never);
      return;
    }
    // If the vault is configured and publishes this asset, prove ownership and open the
    // short-lived link it hands back. Unconfigured (today) → null → the public link below.
    let url = access.url;
    if (keypair && owner) {
      setUnlocking(true);
      try {
        url = (await attemptGatedUrl(item, owner, keypair)) ?? access.url;
      } catch (e) {
        // A refusal is real information — don't quietly open the public link instead.
        Alert.alert("Locked", e instanceof Error ? e.message : "This pass didn't unlock the content.");
        return;
      } finally {
        setUnlocking(false);
      }
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
      <ScreenHeader title={KIND_LABEL[item.kind]} size="modal" onClose={() => nav.goBack()} />
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
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

        {item.attributes && item.attributes.length > 0 && (
          <View style={styles.attrs}>
            {item.attributes.map((a, i) => (
              <View key={i} style={styles.attrChip}>
                <Text style={styles.attrTrait}>{a.trait}</Text>
                <Text style={styles.attrValue}>{a.value}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          {access && (
            <Button
              label={unlocking ? "Unlocking…" : accessVerb(item.kind)}
              icon="open-outline"
              onPress={openContent}
              disabled={unlocking}
            />
          )}
          {item.transferable ? (
            <Button label="Send" variant="secondary" icon="arrow-up" onPress={() => setSendOpen(true)} />
          ) : (
            <Text style={styles.noSend}>
              This item can’t be sent from the app{item.compressed ? " (compressed asset)" : ""}.
            </Text>
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
            label={archivedNow ? "Restore to Collection" : "Archive"}
            variant="secondary"
            icon={archivedNow ? "arrow-undo-outline" : "archive-outline"}
            onPress={() => {
              setArchived(mint, !archivedNow);
              setArchivedOverride(!archivedNow);
              haptics.tap();
            }}
          />
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
