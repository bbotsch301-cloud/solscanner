import "@walletconnect/react-native-compat"; // MUST be first — installs RN polyfills
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LogBox, Platform, StyleSheet, UIManager, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Font from "expo-font";
import { EcosystemScreen } from "./src/screens/EcosystemScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { PropertyScreen } from "./src/screens/PropertyScreen";
import { MoreScreen } from "./src/screens/MoreScreen";
import { GovernScreen } from "./src/screens/GovernScreen";
import { ActivityScreen } from "./src/screens/ActivityScreen";
import { TransactionDetailScreen } from "./src/screens/TransactionDetailScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { SendScreen } from "./src/screens/SendScreen";
import { ReceiveScreen } from "./src/screens/ReceiveScreen";
import { SwapScreen } from "./src/screens/SwapScreen";
import { TokenDetailScreen } from "./src/screens/TokenDetailScreen";
import { BackupScreen } from "./src/screens/BackupScreen";
import { WalletsScreen } from "./src/screens/WalletsScreen";
import { TreasuryMultisigScreen } from "./src/screens/TreasuryMultisigScreen";
import { CreateSquadScreen } from "./src/screens/CreateSquadScreen";
import { ManageSignersScreen } from "./src/screens/ManageSignersScreen";
import { ProposeTransferScreen } from "./src/screens/ProposeTransferScreen";
import { ConnectMultisigScreen } from "./src/screens/ConnectMultisigScreen";
import { MultisigScreen } from "./src/screens/MultisigScreen";
import { MultisigWalletScreen } from "./src/screens/MultisigWalletScreen";
import { CreateWallet } from "./src/screens/CreateWallet";
import { ImportWallet } from "./src/screens/ImportWallet";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { PinUnlockScreen } from "./src/screens/PinUnlockScreen";
import { SetupPinPrompt } from "./src/screens/SetupPinPrompt";
import { LockScreen } from "./src/screens/LockScreen";
import { Fade } from "./src/components/Fade";
import { KeySplash } from "./src/components/KeySplash";
import { PrivacyCover } from "./src/components/PrivacyCover";
import { AuthProvider, useAuth } from "./src/auth";
import { WalletProvider, useWallet } from "./src/wallet/WalletContext";
import { WalletConnectProvider } from "./src/walletconnect/WalletConnectContext";
import { WalletConnectScreen } from "./src/screens/WalletConnectScreen";
import { TokenApprovalsScreen } from "./src/screens/TokenApprovalsScreen";
import { CollectibleDetailScreen } from "./src/screens/CollectibleDetailScreen";
import { ContactsScreen } from "./src/screens/ContactsScreen";
import { LegalScreen } from "./src/screens/LegalScreen";
import { LegalAcceptScreen } from "./src/screens/LegalAcceptScreen";
import { AgreementsScreen } from "./src/screens/AgreementsScreen";
import { AssociationScreen } from "./src/screens/AssociationScreen";
import { VaultScreen } from "./src/screens/VaultScreen";
import { BrowserScreen } from "./src/browser/BrowserScreen";
import { loadBrowserData } from "./src/browser/dapps";
import { loadConnections } from "./src/browser/connections";
import { loadNetworkPref, loadRpcPref } from "./src/solana/connection";
import { loadSecurityPref, getAcceptedLegalVersion, setAcceptedLegalVersion } from "./src/security/prefs";
import { recordAcceptance } from "./src/agreements/record";
import { LEGAL_VERSION } from "./src/legal/content";
import { loadMultisigPref } from "./src/config/multisig";
import { loadBlocklist } from "./src/safety/blocklist";
import { loadRecipients } from "./src/safety/recipients";
import { loadApprovals } from "./src/safety/approvals";
import { loadContacts } from "./src/contacts/contacts";
import { loadPubAddresses } from "./src/wallet/pubAddresses";
import { preloadTokenMetaCache } from "./src/solana/tokens";
import { loadWalletSnapshots } from "./src/wallet/snapshotCache";
import { preloadPriceCache } from "./src/solana/prices";
import { preloadScreenCaches } from "./src/cache/screens";
import { loadCollectiblePrefs, loadCollectibleSnapshots } from "./src/solana/collectibles";
import { loadLastFeeAttempt } from "./src/solana/feeDiagnostics";
import { loadParsedTxCache } from "./src/solana/txParse";
import { haptics } from "./src/ui/haptics";
import { configureNotifications, onNotificationTap } from "./src/ui/notifications";
import { navigationRef, navigate } from "./src/navigationRef";
import { BackupPrompt } from "./src/screens/BackupPrompt";
import type { RootStackParamList } from "./src/navigation";
import { colors, elevation } from "./src/theme";

// Dev-only: our RPC layer already retries 429s quietly, but hide the LogBox bar in case any
// other path logs one — it's transient and self-healing, not an actionable error.
if (__DEV__) LogBox.ignoreLogs(["Server responded with"]);

// Enable LayoutAnimation on Android (iOS has it on by default) so expand/collapse animates.
if (Platform.OS === "android") UIManager.setLayoutAnimationEnabledExperimental?.(true);

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

// Filled icon when the tab is focused, outline when it isn't — the active tab reads at a glance.
const TAB_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Wallet: "wallet",
  Swap: "swap-horizontal",
  Property: "library",
  Ecosystem: "planet",
  More: "ellipsis-horizontal",
};
const TAB_ICON_OUTLINE: Record<string, keyof typeof Ionicons.glyphMap> = {
  Wallet: "wallet-outline",
  Swap: "swap-horizontal-outline",
  Property: "library-outline",
  Ecosystem: "planet-outline",
  More: "ellipsis-horizontal-outline",
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.cardBorder,
          height: 88,
          paddingTop: 8,
          ...elevation(2),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarIcon: ({ color, size, focused }) => (
          // A slim gold indicator caps the active tab, above its (filled) icon.
          <View style={{ alignItems: "center", justifyContent: "center", gap: 5 }}>
            <View
              style={{
                height: 3,
                width: 18,
                borderRadius: 2,
                backgroundColor: focused ? colors.primary : "transparent",
              }}
            />
            <Ionicons name={focused ? TAB_ICON[route.name] : TAB_ICON_OUTLINE[route.name]} size={size} color={color} />
          </View>
        ),
      })}
      screenListeners={{ tabPress: () => haptics.select() }}
    >
      {/* Wallet leads: it's the only tab that answers "what do I have and what can I do with it",
          and it's where every session actually starts. Property earns a tab because the digital
          property is the product, not a submenu. Ecosystem keeps its place — the treasury being
          visible is the point of it — but no longer claims to be "Home". The Browser moved to
          More; it's a power-user surface and was the weakest of the five. */}
      <Tab.Screen name="Wallet" component={HomeScreen} />
      <Tab.Screen name="Swap">
        {() => <SwapScreen asTab />}
      </Tab.Screen>
      <Tab.Screen name="Property" component={PropertyScreen} />
      <Tab.Screen name="Ecosystem" component={EcosystemScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    primary: colors.primary,
    text: colors.text,
    border: colors.cardBorder,
  },
};

/** The key's entrance runs ~940ms, but a warm start finishes loading in a fraction of that. Hold
 *  the boot splash long enough for the turn to land — the whole animation lives on ONE instance so
 *  it can't be interrupted and restarted partway. */
const SPLASH_MIN_MS = 1250;

function Splash({ animate = true }: { animate?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
      <KeySplash animate={animate} />
    </View>
  );
}

/** Wraps the app so any touch resets the inactivity auto-lock clock, without swallowing it. */
function ActivityWrap({ children }: { children: ReactNode }) {
  const { bumpActivity } = useWallet();
  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        bumpActivity();
        return false; // observe the touch; let children handle it
      }}
    >
      {children}
    </View>
  );
}

function Root() {
  const { initializing, hasWallet, pinEnabled, locked, needsBackup, markBackedUp, shouldPromptPin } =
    useWallet();
  const { unlocked } = useAuth();
  // One-time legal acceptance, before anything else. Re-shows if LEGAL_VERSION is bumped.
  const [legalOk, setLegalOk] = useState(getAcceptedLegalVersion() >= LEGAL_VERSION);

  // Static: the entrance already played on the boot splash above this one. Re-animating here
  // would restart the turn from inverted the moment the providers mount.
  if (initializing) return <><StatusBar style="light" /><Splash animate={false} /></>;
  if (!legalOk)
    return (
      <>
        <StatusBar style="light" />
        <Fade>
          <LegalAcceptScreen
            // A member who accepted an earlier version is not seeing this for the first time, and
            // "Welcome to XGO" would be both wrong and evasive about why they're being asked again.
            returning={getAcceptedLegalVersion() > 0}
            onAccept={() => {
              void setAcceptedLegalVersion(LEGAL_VERSION);
              // A record of WHAT was agreed and WHEN, alongside the gate's version flag. This runs
              // before any wallet exists, so it starts unsigned; More → Agreements signs it once
              // there's a key. Fire-and-forget on purpose — the record is evidence, and a member
              // who has agreed must get into the app whether or not it could be written.
              //
              // All three documents: they share LEGAL_VERSION, so recording only two left the third
              // versioned, accepted in practice, and unrecorded.
              void recordAcceptance(["terms", "privacy", "security"], null, null);
              setLegalOk(true);
            }}
          />
        </Fade>
      </>
    );
  if (!hasWallet) return <><StatusBar style="light" /><Fade><OnboardingScreen /></Fade></>;

  // Setup gates for a brand-new wallet. These replace the whole app rather than overlaying it,
  // so the lock still has to win over them — there's no in-progress transaction to preserve on a
  // wallet that hasn't been backed up yet, and neither prompt may be reachable while locked.
  if (needsBackup || shouldPromptPin) {
    if (locked) return <><StatusBar style="light" /><Fade><PinUnlockScreen /></Fade></>;
    if (!pinEnabled && !unlocked) return <><StatusBar style="light" /><Fade><LockScreen /></Fade></>;
    // New wallets must be backed up before entering the app.
    if (needsBackup) return <><StatusBar style="light" /><Fade><BackupPrompt onDone={markBackedUp} /></Fade></>;
    // Offer the PIN once, after setup (skippable). PIN is the primary lock.
    return <><StatusBar style="light" /><Fade><SetupPinPrompt /></Fade></>;
  }

  // The lock renders as an OVERLAY over the navigator rather than replacing it. Replacing it
  // unmounted every screen, so a lock mid-Send discarded the half-filled form and dropped the
  // user back at the tab root on unlock. As an overlay the navigator stays mounted, and
  // unlocking returns to the exact screen with its state intact. A PIN (which encrypts the
  // seeds) gates ahead of the biometric lock; when set, it replaces the biometric lock so the
  // user isn't gated twice.
  const lockOverlay = locked ? <PinUnlockScreen /> : !pinEnabled && !unlocked ? <LockScreen /> : null;

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        {/* Card/push screens (slide in from the right, matching their back chevrons). */}
        <Stack.Screen name="CreateWallet">
          {({ navigation }) => {
            // After create/import the Root gate may swap the whole navigator (e.g. to the
            // backup prompt), so only go back if there's still something to go back to.
            const back = () => navigation.canGoBack() && navigation.goBack();
            return <CreateWallet onDone={back} onCancel={back} />;
          }}
        </Stack.Screen>
        <Stack.Screen name="ImportWallet">
          {({ navigation }) => {
            const back = () => navigation.canGoBack() && navigation.goBack();
            return <ImportWallet onDone={back} onCancel={back} />;
          }}
        </Stack.Screen>
        <Stack.Group screenOptions={{ presentation: "modal", animation: "slide_from_bottom" }}>
          <Stack.Screen name="Send" component={SendScreen} />
          <Stack.Screen name="Receive" component={ReceiveScreen} />
          <Stack.Screen name="Swap" component={SwapScreen} />
          <Stack.Screen name="TokenDetail" component={TokenDetailScreen} />
          <Stack.Screen name="Backup" component={BackupScreen} />
          <Stack.Screen name="Wallets" component={WalletsScreen} />
          <Stack.Screen name="Multisig" component={MultisigScreen} />
          <Stack.Screen name="MultisigWallet" component={MultisigWalletScreen} />
          <Stack.Screen name="TreasuryMultisig" component={TreasuryMultisigScreen} />
          <Stack.Screen name="CreateSquad" component={CreateSquadScreen} />
          <Stack.Screen name="ConnectMultisig" component={ConnectMultisigScreen} />
          <Stack.Screen name="ManageSigners" component={ManageSignersScreen} />
          <Stack.Screen name="ProposeTransfer" component={ProposeTransferScreen} />
          <Stack.Screen name="Browser" component={BrowserScreen} />
          <Stack.Screen name="Activity" component={ActivityScreen} />
          <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
          <Stack.Screen name="Govern" component={GovernScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="WalletConnect" component={WalletConnectScreen} />
          <Stack.Screen name="TokenApprovals" component={TokenApprovalsScreen} />
          <Stack.Screen name="Contacts" component={ContactsScreen} />
          <Stack.Screen name="Collectible" component={CollectibleDetailScreen} />
          <Stack.Screen name="Agreements" component={AgreementsScreen} />
          <Stack.Screen name="Association" component={AssociationScreen} />
          <Stack.Screen name="Vault" component={VaultScreen} />
          <Stack.Screen name="Legal" component={LegalScreen} />
        </Stack.Group>
      </Stack.Navigator>
      {/* Opaque and above the navigator: nothing behind it is visible or touchable. */}
      {lockOverlay && (
        <View style={styles.lockOverlay}>
          <Fade>{lockOverlay}</Fade>
        </View>
      )}
      {/* Covers everything (including the lock) while the app isn't frontmost, so the
          app-switcher snapshot never contains balances or addresses. */}
      <PrivacyCover />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  lockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.bg, zIndex: 100 },
});

export default function App() {
  // Apply the saved network choice before anything uses the connection.
  const [ready, setReady] = useState(false);
  // Independent of loading: even a warm start keeps the splash up long enough to see the key land.
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    // The blocklist refresh is best-effort and must never delay startup on a slow network,
    // so it's fired alongside but the app doesn't block on its result (it fails open).
    loadBlocklist();
    configureNotifications();
    Promise.all([
      loadNetworkPref(),
      loadRpcPref(),
      loadSecurityPref(),
      loadMultisigPref(),
      loadRecipients(),
      loadApprovals(),
      loadContacts(),
      loadPubAddresses(),
      loadWalletSnapshots(),
      loadCollectiblePrefs(),
      loadLastFeeAttempt(),
      loadParsedTxCache(),
      loadCollectibleSnapshots(),
      loadBrowserData(),
      loadConnections(),
      // The icon font, awaited BEFORE anything renders. @expo/vector-icons loads it lazily on
      // first use, and the tab bar renders exactly once — so if the font wasn't ready by then its
      // glyphs stayed blank for the whole session while screen content, which re-renders
      // constantly, quietly recovered. That's why the tab icons came and went between launches.
      Font.loadAsync(Ionicons.font).catch(() => {}),
      preloadTokenMetaCache(),
      // Last-known prices and per-screen snapshots, so the first frame after the splash paints
      // real numbers instead of counting up from $0.00 while the network answers.
      preloadPriceCache(),
      preloadScreenCaches(),
    ]).finally(() => setReady(true));
  }, []);

  // Tapping a "Received" notification jumps to Activity.
  useEffect(() => onNotificationTap(() => navigate("Activity")), []);

  return (
    <SafeAreaProvider>
      {ready && minElapsed ? (
        <WalletProvider>
          <WalletConnectProvider>
            <AuthProvider>
              <ActivityWrap>
                <Root />
              </ActivityWrap>
            </AuthProvider>
          </WalletConnectProvider>
        </WalletProvider>
      ) : (
        <Splash />
      )}
    </SafeAreaProvider>
  );
}
