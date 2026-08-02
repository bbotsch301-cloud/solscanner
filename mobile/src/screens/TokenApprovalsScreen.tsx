import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useWallet } from "../wallet/WalletContext";
import { ethCall } from "../evm/rpc";
import { erc20AllowanceData } from "../evm/tx";
import { resolveEvmToken } from "../evm/tokenList";
import { listApprovals } from "../safety/approvals";
import { humanizeError } from "../solana/errors";
import { ScreenHeader } from "../components/ScreenHeader";
import { EmptyState } from "../components/EmptyState";
import { colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

// Anything above this is effectively an unbounded ("infinite") allowance — real token
// amounts never approach 2^200, so a value this large means "unlimited".
const UNLIMITED = 1n << 200n;

interface Row {
  token: string;
  spender: string;
  symbol: string;
  decimals: number;
  allowance: bigint;
}

function formatAllowance(allowance: bigint, decimals: number): string {
  if (allowance > UNLIMITED) return "Unlimited";
  const v = Number(allowance) / 10 ** decimals;
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function TokenApprovalsScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const { activeChain, evmAddress, revokeApproval } = useWallet();
  const isEvm = activeChain.kind === "evm";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isEvm || !evmAddress || !activeChain.evmChainId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const refs = listApprovals(activeChain.evmChainId);
    const results = await Promise.all(
      refs.map(async (r) => {
        try {
          const hex = await ethCall(activeChain, r.token, erc20AllowanceData(evmAddress, r.spender));
          const allowance = BigInt(hex === "0x" || !hex ? "0x0" : hex);
          if (allowance <= 0n) return null; // already revoked / consumed
          const meta = await resolveEvmToken(activeChain, r.token);
          return {
            token: r.token,
            spender: r.spender,
            symbol: meta?.symbol ?? `${r.token.slice(0, 6)}…`,
            decimals: meta?.decimals ?? 18,
            allowance,
          } as Row;
        } catch {
          return null; // RPC hiccup — skip this row rather than block the list
        }
      })
    );
    setRows(results.filter((r): r is Row => r !== null));
    setLoading(false);
  }, [isEvm, evmAddress, activeChain]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const confirmRevoke = (row: Row) => {
    Alert.alert(
      "Revoke approval?",
      `Remove ${row.symbol}'s spending allowance for ${shortAddress(row.spender, 6, 6)} on ${activeChain.name}. This sends a transaction and costs a small network fee.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Revoke", style: "destructive", onPress: () => doRevoke(row) },
      ]
    );
  };

  const doRevoke = async (row: Row) => {
    const id = `${row.token}:${row.spender}`;
    setRevoking(id);
    try {
      await revokeApproval(row.token, row.spender);
      // The tx is broadcast; the on-chain allowance clears once it mines. Drop the row now
      // so the UI reflects intent, and pull-to-refresh will re-check the live value.
      setRows((rs) => rs.filter((r) => `${r.token}:${r.spender}` !== id));
      Alert.alert("Revoke submitted", "The allowance will read zero once the transaction confirms.");
    } catch (e) {
      Alert.alert("Couldn't revoke", humanizeError(e, { action: "send", native: activeChain.symbol }));
    } finally {
      setRevoking(null);
    }
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Token approvals" size="modal" onClose={() => nav.goBack()} paddingHorizontal={0} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing(6) }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.intro}>
          Allowances let a contract move a token on your behalf. Revoke any you no longer use.
          This lists approvals made in this app on this device.
        </Text>

        {!isEvm ? (
          <EmptyState
            icon="swap-horizontal"
            title="EVM networks only"
            subtitle="Token approvals apply to Ethereum and BNB Smart Chain. Switch to an EVM network to view them."
          />
        ) : loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="shield-checkmark-outline"
            color={colors.positive}
            title="No active approvals"
            subtitle={`Nothing to revoke on ${activeChain.name}.`}
          />
        ) : (
          rows.map((row) => {
            const id = `${row.token}:${row.spender}`;
            const busy = revoking === id;
            return (
              <View key={id} style={styles.card}>
                <View style={styles.cardMain}>
                  <Text style={styles.tokenSym}>{row.symbol}</Text>
                  <Text style={styles.amount}>
                    Allowance: <Text style={styles.amountVal}>{formatAllowance(row.allowance, row.decimals)}</Text>
                  </Text>
                  <Pressable
                    onPress={() => Linking.openURL(activeChain.explorerAddr(row.spender))}
                    hitSlop={6}
                    style={styles.spenderRow}
                  >
                    <Text style={styles.spender}>Spender {shortAddress(row.spender, 6, 6)}</Text>
                    <Ionicons name="open-outline" size={13} color={colors.textMuted} />
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => confirmRevoke(row)}
                  disabled={busy}
                  style={[styles.revokeBtn, busy && { opacity: 0.6 }]}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.negative} size="small" />
                  ) : (
                    <Text style={styles.revokeText}>Revoke</Text>
                  )}
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing(4) },
  intro: { color: colors.textMuted, fontSize: font.small, lineHeight: 19, marginBottom: spacing(4) },
  empty: {
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(6),
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    marginBottom: spacing(3),
  },
  cardMain: { flex: 1, gap: 4 },
  tokenSym: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  amount: { color: colors.textMuted, fontSize: font.small },
  amountVal: { color: colors.text, fontWeight: "700" },
  spenderRow: { flexDirection: "row", alignItems: "center", gap: spacing(1), marginTop: 2 },
  spender: { color: colors.textMuted, fontSize: font.small },
  revokeBtn: {
    borderWidth: 1,
    borderColor: colors.negative,
    borderRadius: radius.pill,
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(4),
    minWidth: 84,
    alignItems: "center",
  },
  revokeText: { color: colors.negative, fontSize: font.small, fontWeight: "800" },
});
