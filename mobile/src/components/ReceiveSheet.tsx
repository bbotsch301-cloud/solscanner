/**
 * A QR + copyable address, as a sheet — so "how do I get paid in this token?" is answerable from
 * wherever you're looking at the token, instead of backing out to the Receive screen and hoping
 * the right network is selected.
 *
 * The address is the wallet's address for the chain, not a per-token one: on both Solana and EVM
 * you receive every asset at the same address. The token name is only context.
 */
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { Button } from "./Button";
import { haptics } from "../ui/haptics";
import { colors, font, radius, spacing } from "../theme";

export function ReceiveSheet({
  visible,
  onClose,
  address,
  chainName,
  symbol,
}: {
  visible: boolean;
  onClose: () => void;
  address: string;
  chainName: string;
  /** The token being viewed — shown only to reassure that this address accepts it. */
  symbol?: string;
}) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    haptics.tap();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal visible={visible} onRequestClose={onClose} animationType="slide" transparent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallow taps on the card so only the backdrop dismisses. */}
        <Pressable style={[styles.card, { paddingBottom: insets.bottom + spacing(6) }]} onPress={() => {}}>
          <View style={styles.grabber} />

          <View style={styles.head}>
            <Text style={styles.title}>Receive {symbol ?? ""}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.qrCard}>
            {address ? <QRCode value={address} size={188} backgroundColor="#fff" color="#0B0B0F" /> : null}
          </View>

          <Pressable onPress={copy} style={styles.addrCard}>
            <Text style={styles.address} numberOfLines={2}>{address}</Text>
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={18}
              color={copied ? colors.positive : colors.textMuted}
            />
          </Pressable>

          <Button
            label={copied ? "Copied" : "Copy address"}
            icon={copied ? "checkmark" : "copy-outline"}
            onPress={copy}
            style={styles.copyBtn}
          />

          <Text style={styles.hint}>
            Only send {chainName} assets to this address. Anything from another network is lost.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  card: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
    alignItems: "center",
    gap: spacing(4),
  },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.cardBorder },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  qrCard: { backgroundColor: "#fff", padding: spacing(4), borderRadius: radius.md },
  addrCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    width: "100%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
  },
  address: { flex: 1, color: colors.text, fontSize: font.small, fontWeight: "600" },
  copyBtn: { width: "100%" },
  hint: { color: colors.textMuted, fontSize: font.small, textAlign: "center", lineHeight: 19 },
});
