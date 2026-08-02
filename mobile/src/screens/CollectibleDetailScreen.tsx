/**
 * One Collection item: full artwork, what it is, and its actions — Open (its portal/link in the
 * in-app Browser), Send (standard NFTs only), View on Solscan, Hide. The item is read from the
 * collectibles snapshot (saved on every fetch), so this screen needs no loading state of its own.
 */
import { useMemo, useState } from "react";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PublicKey } from "@solana/web3.js";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "../components/ScreenHeader";
import { Artwork } from "../components/Artwork";
import { Button } from "../components/Button";
import { ContactPicker } from "../components/ContactPicker";
import { cachedCollectibles, isHiddenItem, setHidden, type Collectible } from "../solana/collectibles";
import { requestBrowserUrl } from "../browser/openRequest";
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
  const { activeAddress, solanaAddress, sendToken } = useWallet();
  const owner = solanaAddress ?? activeAddress;
  const mint = route.params.mint;

  const item = useMemo(
    () => (owner ? cachedCollectibles(owner)?.find((c) => c.mint === mint) : undefined),
    [owner, mint]
  );
  const [hiddenNow, setHiddenNow] = useState(() => (item ? isHiddenItem(item) : false));
  const [sendOpen, setSendOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);

  if (!item) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScreenHeader title="Collection" size="modal" onClose={() => nav.goBack()} />
        <Text style={styles.missing}>This item is no longer in your collection.</Text>
      </View>
    );
  }

  const openPortal = () => {
    if (!item.externalUrl) return;
    haptics.tap();
    requestBrowserUrl(item.externalUrl);
    nav.goBack();
    // Jump to the Browser tab; its focus listener consumes the queued URL.
    if (navigationRef.isReady())
      navigationRef.navigate({ name: "Tabs", params: { screen: "Browser" } } as never);
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
          {item.externalUrl && <Button label="Open" icon="open-outline" onPress={openPortal} />}
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
          <Button
            label={hiddenNow ? "Unhide from Collection" : "Hide from Collection"}
            variant="secondary"
            icon={hiddenNow ? "eye-outline" : "eye-off-outline"}
            onPress={() => {
              setHidden(mint, !hiddenNow);
              setHiddenNow(!hiddenNow);
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
