/**
 * Property — the digital property this wallet owns: books, courses, software, music, art, plus the
 * credentials that say what the member IS rather than what they hold. Each carries a deed, which is
 * what makes it property rather than a file someone lets you use.
 *
 * The grid (and the property/credentials split) lives in PropertyGallery; this screen supplies the
 * header, the chain guard, and pull-to-refresh.
 */
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { PropertyGallery } from "../components/PropertyGallery";
import { EmptyState } from "../components/EmptyState";
import { ScreenHeader } from "../components/ScreenHeader";
import { useWallet } from "../wallet/WalletContext";
import { colors, spacing } from "../theme";

export function PropertyScreen() {
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
      <ScreenHeader title="Property" subtitle="What you own, and what you hold" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {!isSolana || !activeAddress ? (
          <EmptyState
            icon="images-outline"
            title="Switch to Solana"
            subtitle="Your property is read from your Solana wallet. Switch the network on the Wallet tab to see it."
          />
        ) : (
          // key per address: the gallery seeds itself from the persisted snapshot on mount.
          <PropertyGallery key={activeAddress} owner={activeAddress} refreshKey={refreshKey} title={null} />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing(4), paddingTop: spacing(2), paddingBottom: spacing(10) },
});
