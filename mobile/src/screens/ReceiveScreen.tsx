import * as Clipboard from "expo-clipboard";
import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import { ScreenHeader } from "../components/ScreenHeader";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { PressableScale } from "../components/PressableScale";
import { TokenAvatar } from "../components/TokenAvatar";
import { useWallet } from "../wallet/WalletContext";
import { CLUSTER } from "../solana/connection";
import { haptics } from "../ui/haptics";
import { colors, font, leading, radius, spacing, weight } from "../theme";
import type { RootNav } from "../navigation";

const MONO = Platform.OS === "ios" ? "Menlo" : "monospace";

export function ReceiveScreen() {
  const nav = useNavigation<RootNav>();
  const { activeChain, activeAddress } = useWallet();
  const address = activeAddress;
  const [copied, setCopied] = useState(false);
  const isSolana = activeChain.kind === "solana";
  const network = isSolana ? (CLUSTER === "devnet" ? "Devnet" : "Mainnet") : activeChain.name;

  const copy = async () => {
    if (!address) return;
    await Clipboard.setStringAsync(address);
    haptics.tap();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Receive" size="modal" onClose={() => nav.goBack()} paddingHorizontal={0} />

      <View style={styles.body}>
        <View style={styles.qrWrap}>
          <View style={styles.qrCard}>
            {address ? <QRCode value={address} size={196} backgroundColor="#fff" color="#0B0B0F" /> : null}
          </View>
          {/* The chain the address belongs to — a coin badge over the QR so it's unmistakable. */}
          <View style={styles.chainBadge}>
            <TokenAvatar symbol={activeChain.symbol} color={activeChain.color} size={40} logoURI={activeChain.logoURI} />
          </View>
        </View>

        <View style={styles.netPill}>
          <View style={styles.dot} />
          <Text style={styles.netText}>{network}</Text>
        </View>

        <Text style={styles.label}>Your {activeChain.name} address</Text>

        <PressableScale onPress={copy} haptic={null} style={styles.addrPress}>
          <Card style={styles.addrCard} padding={spacing(4)}>
            <Text style={styles.address} numberOfLines={2}>{address}</Text>
            <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={copied ? colors.positive : colors.textMuted} />
          </Card>
        </PressableScale>

        <Button
          label={copied ? "Copied" : "Copy address"}
          icon={copied ? "checkmark" : "copy-outline"}
          onPress={copy}
          style={styles.copyBtn}
        />

        <Text style={styles.hint}>
          {isSolana
            ? `Only send Solana (SPL) assets to this address on ${network}.`
            : `Only send ${activeChain.name} assets — ${activeChain.symbol} and its tokens — to this address. Sending assets from another chain will lose them.`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  body: { alignItems: "center", marginTop: spacing(6), gap: spacing(3) },
  qrWrap: { alignItems: "center", justifyContent: "center" },
  qrCard: { backgroundColor: "#fff", padding: spacing(5), borderRadius: radius.lg, minWidth: 236, minHeight: 236, alignItems: "center", justifyContent: "center" },
  chainBadge: {
    position: "absolute",
    bottom: -20,
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
  },
  netPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radius.pill,
    marginTop: spacing(6),
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  netText: { color: colors.textMuted, fontSize: font.tiny, fontWeight: weight.bold },
  label: { color: colors.text, fontSize: font.h3, fontWeight: weight.semibold, marginTop: spacing(1) },
  addrPress: { alignSelf: "stretch" },
  addrCard: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  address: { flex: 1, color: colors.text, fontSize: font.small, fontFamily: MONO, lineHeight: font.small * leading.relaxed },
  copyBtn: { alignSelf: "stretch", marginTop: spacing(1) },
  hint: { color: colors.textFaint, fontSize: font.small, textAlign: "center", marginTop: spacing(3), paddingHorizontal: spacing(4), lineHeight: font.small * leading.normal },
});
