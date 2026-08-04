/**
 * Keys — everything this wallet holds that isn't money.
 *
 * Two kinds, and the distinction is the whole point. **Credentials** say what the member IS:
 * membership, office, certification, belonging to a community. **Property** is what they own:
 * books, courses, software, music, art. Same token underneath, carrying a deed either way, but a
 * member's ordination and their audiobook are not the same kind of fact and are not filed together.
 *
 * Named for what the canonical model calls them rather than for their file type. This screen was
 * "Property", which described half of what it showed.
 *
 * The grid and the split live in PropertyGallery; this screen supplies the header, the chain guard,
 * and pull-to-refresh.
 */
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { PropertyGallery } from "../components/PropertyGallery";
import { EmptyState } from "../components/EmptyState";
import { ScreenHeader } from "../components/ScreenHeader";
import { useWallet } from "../wallet/WalletContext";
import { colors, spacing } from "../theme";

export function KeysScreen() {
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
      <ScreenHeader title="Keys" subtitle="Who you are, and what you own" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {!isSolana || !activeAddress ? (
          <EmptyState
            icon="images-outline"
            title="Switch to Solana"
            subtitle="Your keys are read from your Solana wallet. Switch the network on the Wallet tab to see them."
          />
        ) : (
          // key per address: the gallery seeds itself from the persisted snapshot on mount.
          <PropertyGallery key={activeAddress} owner={activeAddress} refreshKey={refreshKey} title={null} showStanding />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(4), paddingTop: spacing(2), paddingBottom: spacing(10) },
});
