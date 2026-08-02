/**
 * Purchases — everything the wallet owns that isn't a fungible token: access passes, tickets,
 * memberships, books, art. Reached from the More tab. The grid itself lives in CollectionGallery;
 * this screen just supplies the header, the chain guard, and pull-to-refresh.
 */
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { CollectionGallery } from "../components/CollectionGallery";
import { EmptyState } from "../components/EmptyState";
import { ScreenHeader } from "../components/ScreenHeader";
import { useWallet } from "../wallet/WalletContext";
import { colors, spacing } from "../theme";

export function PurchasesScreen() {
  const { activeChain, activeAddress } = useWallet();
  const isSolana = activeChain.kind === "solana";
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1); // the gallery refetches off this key
    // The gallery owns the fetch, so just release the spinner after a beat.
    setTimeout(() => setRefreshing(false), 700);
  }, []);

  return (
    <View style={styles.screen}>
      {/* A tab root — no back affordance, nothing to pop to. */}
      <ScreenHeader title="Purchases" subtitle="Passes, tickets, and collectibles you own" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {!isSolana || !activeAddress ? (
          <EmptyState
            icon="images-outline"
            title="Switch to Solana"
            subtitle="Purchases are read from your Solana wallet. Switch the network on the Wallet tab to see them."
          />
        ) : (
          // key per address: the gallery seeds itself from the persisted snapshot on mount.
          <CollectionGallery key={activeAddress} owner={activeAddress} refreshKey={refreshKey} title={null} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(4), paddingTop: spacing(2), paddingBottom: spacing(10) },
});
