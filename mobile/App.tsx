import "@walletconnect/react-native-compat"; // MUST be first — installs RN polyfills
import { StatusBar } from "expo-status-bar";
import { useEffect, useState, type ReactNode } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Animated, Easing, LogBox, Platform, UIManager, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EcosystemScreen } from "./src/screens/EcosystemScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { MoreScreen } from "./src/screens/MoreScreen";
import { GovernScreen } from "./src/screens/GovernScreen";
import { ActivityScreen } from "./src/screens/ActivityScreen";
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
import { Crown } from "./src/components/Crown";
import { AuthProvider, useAuth } from "./src/auth";
import { WalletProvider, useWallet } from "./src/wallet/WalletContext";
import { WalletConnectProvider } from "./src/walletconnect/WalletConnectContext";
import { WalletConnectScreen } from "./src/screens/WalletConnectScreen";
import { TokenApprovalsScreen } from "./src/screens/TokenApprovalsScreen";
import { CollectibleDetailScreen } from "./src/screens/CollectibleDetailScreen";
import { ContactsScreen } from "./src/screens/ContactsScreen";
import { LegalScreen } from "./src/screens/LegalScreen";
import { LegalAcceptScreen } from "./src/screens/LegalAcceptScreen";
import { BrowserScreen } from "./src/browser/BrowserScreen";
import { loadBrowserData } from "./src/browser/dapps";
import { loadConnections } from "./src/browser/connections";
import { loadNetworkPref, loadRpcPref } from "./src/solana/connection";
import { loadSecurityPref, getAcceptedLegalVersion, setAcceptedLegalVersion } from "./src/security/prefs";
import { LEGAL_VERSION } from "./src/legal/content";
import { loadMultisigPref } from "./src/config/multisig";
import { loadBlocklist } from "./src/safety/blocklist";
import { loadRecipients } from "./src/safety/recipients";
import { loadApprovals } from "./src/safety/approvals";
import { loadContacts } from "./src/contacts/contacts";
import { loadPubAddresses } from "./src/wallet/pubAddresses";
import { preloadTokenMetaCache } from "./src/solana/tokens";
import { loadWalletSnapshots } from "./src/wallet/snapshotCache";
import { loadCollectiblePrefs, loadCollectibleSnapshots } from "./src/solana/collectibles";
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
  Home: "home",
  Wallet: "wallet",
  "Buy/Swap": "swap-horizontal",
  Browser: "compass",
  More: "ellipsis-horizontal",
};
const TAB_ICON_OUTLINE: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: "home-outline",
  Wallet: "wallet-outline",
  "Buy/Swap": "swap-horizontal-outline",
  Browser: "compass-outline",
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
      <Tab.Screen name="Home" component={EcosystemScreen} />
      <Tab.Screen name="Wallet" component={HomeScreen} />
      <Tab.Screen name="Buy/Swap" options={{ tabBarLabel: "Swap" }}>
        {() => <SwapScreen asTab />}
      </Tab.Screen>
      <Tab.Screen name="Browser" component={BrowserScreen} />
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

function Splash() {
  // Just the crown, centered — it turns up from upside down and settles upright. No endless
  // spin: a crown shouldn't sit inverted, and the half turn gives it a single deliberate beat.
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(spin, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Crown size={192} />
      </Animated.View>
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

  if (initializing) return <><StatusBar style="light" /><Splash /></>;
  if (!legalOk)
    return (
      <>
        <StatusBar style="light" />
        <Fade>
          <LegalAcceptScreen
            onAccept={() => {
              void setAcceptedLegalVersion(LEGAL_VERSION);
              setLegalOk(true);
            }}
          />
        </Fade>
      </>
    );
  if (!hasWallet) return <><StatusBar style="light" /><Fade><OnboardingScreen /></Fade></>;
  // A PIN (which encrypts the seeds) gates ahead of the biometric lock; when set, it
  // replaces the biometric lock so the user isn't gated twice.
  if (locked) return <><StatusBar style="light" /><Fade><PinUnlockScreen /></Fade></>;
  if (!pinEnabled && !unlocked) return <><StatusBar style="light" /><Fade><LockScreen /></Fade></>;
  // New wallets must be backed up before entering the app.
  if (needsBackup) return <><StatusBar style="light" /><Fade><BackupPrompt onDone={markBackedUp} /></Fade></>;
  // Offer the PIN once, after setup (skippable). PIN is the primary lock.
  if (shouldPromptPin) return <><StatusBar style="light" /><Fade><SetupPinPrompt /></Fade></>;

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
          <Stack.Screen name="Activity" component={ActivityScreen} />
          <Stack.Screen name="Govern" component={GovernScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="WalletConnect" component={WalletConnectScreen} />
          <Stack.Screen name="TokenApprovals" component={TokenApprovalsScreen} />
          <Stack.Screen name="Contacts" component={ContactsScreen} />
          <Stack.Screen name="Collectible" component={CollectibleDetailScreen} />
          <Stack.Screen name="Legal" component={LegalScreen} />
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  // Apply the saved network choice before anything uses the connection.
  const [ready, setReady] = useState(false);
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
      loadCollectibleSnapshots(),
      loadBrowserData(),
      loadConnections(),
      preloadTokenMetaCache(),
    ]).finally(() => setReady(true));
  }, []);

  // Tapping a "Received" notification jumps to Activity.
  useEffect(() => onNotificationTap(() => navigate("Activity")), []);

  return (
    <SafeAreaProvider>
      {ready ? (
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
