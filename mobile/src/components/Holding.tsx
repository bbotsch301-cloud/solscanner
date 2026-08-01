/** A single treasury holding row — on-chain token (TokenAvatar) or off-chain asset (AssetLogo). */
import { StyleSheet, Text, View } from "react-native";
import { TokenAvatar } from "./TokenAvatar";
import { AssetLogo, type AssetIcon } from "./AssetLogo";
import { compact, colors, font, spacing, usd } from "../theme";

export function Holding({
  symbol,
  name,
  amount,
  usdValue,
  pct,
  logoURI,
  color,
  offchainDetail,
  subtitle,
  icon,
}: {
  symbol: string;
  name: string;
  amount?: number;
  usdValue?: number;
  pct?: number;
  logoURI?: string;
  color: string;
  /** When set, this is an off-chain asset — show this detail + an "off-chain" tag. */
  offchainDetail?: string;
  /** Plain subtitle override (no tag), e.g. the "Other holdings" count. */
  subtitle?: string;
  /** Built-in SVG coin logo for off-chain assets (silver / dinar). */
  icon?: AssetIcon;
}) {
  return (
    <View style={styles.row}>
      {icon ? <AssetLogo icon={icon} /> : <TokenAvatar symbol={symbol} color={color} logoURI={logoURI} />}
      <View style={styles.mid}>
        <Text style={styles.symbol}>{name}</Text>
        <Text style={styles.sub}>
          {offchainDetail != null
            ? `${offchainDetail} · off-chain`
            : subtitle != null
              ? subtitle
              : `${compact(amount ?? 0)} ${symbol}`}
        </Text>
      </View>
      <View style={styles.rightCol}>
        {usdValue != null && <Text style={styles.value}>{usd(usdValue)}</Text>}
        {pct != null && <Text style={styles.pct}>{pct.toFixed(1)}%</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  mid: { flex: 1, gap: 2 },
  symbol: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  rightCol: { alignItems: "flex-end" },
  value: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  pct: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", marginTop: 2 },
});
