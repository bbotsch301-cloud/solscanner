import "@walletconnect/react-native-compat"; // MUST be first — installs RN polyfills
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EcosystemScreen } from "./src/screens/EcosystemScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { MoreScreen } from "./src/screens/MoreScreen";
import { TreasuryScreen } from "./src/screens/TreasuryScreen";
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
import { CreateWallet } from "./src/screens/CreateWallet";
import { ImportWallet } from "./src/screens/ImportWallet";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { PinUnlockScreen } from "./src/screens/PinUnlockScreen";
import { SetupPinPrompt } from "./src/screens/SetupPinPrompt";
import { LockScreen } from "./src/screens/LockScreen";
import { Fade } from "./src/components/Fade";
import { AuthProvider, useAuth } from "./src/auth";
import { WalletProvider, useWallet } from "./src/wallet/WalletContext";
import { WalletConnectProvider } from "./src/walletconnect/WalletConnectContext";
import { WalletConnectScreen } from "./src/screens/WalletConnectScreen";
import { loadNetworkPref } from "./src/solana/connection";
import { loadSecurityPref } from "./src/security/prefs";
import { loadMultisigPref } from "./src/config/multisig";
import { BackupPrompt } from "./src/screens/BackupPrompt";
import type { RootStackParamList } from "./src/navigation";
import { colors } from "./src/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const TAB_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: "home",
  Wallet: "wallet",
  "Buy/Swap": "swap-horizontal",
  Treasury: "business",
  More: "ellipsis-horizontal",
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
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICON[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={EcosystemScreen} />
      <Tab.Screen name="Wallet" component={HomeScreen} />
      <Tab.Screen name="Buy/Swap" options={{ tabBarLabel: "Swap" }}>
        {() => <SwapScreen asTab />}
      </Tab.Screen>
      <Tab.Screen name="Treasury" component={TreasuryScreen} />
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
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function Root() {
  const { initializing, hasWallet, pinEnabled, locked, needsBackup, markBackedUp, shouldPromptPin } =
    useWallet();
  const { unlocked } = useAuth();

  if (initializing) return <><StatusBar style="light" /><Splash /></>;
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
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        {/* Card/push screens (slide in from the right, matching their back chevrons). */}
        <Stack.Screen name="CreateWallet">
          {({ navigation }) => (
            <CreateWallet onDone={() => navigation.goBack()} onCancel={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="ImportWallet">
          {({ navigation }) => (
            <ImportWallet onDone={() => navigation.goBack()} onCancel={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Group screenOptions={{ presentation: "modal", animation: "slide_from_bottom" }}>
          <Stack.Screen name="Send" component={SendScreen} />
          <Stack.Screen name="Receive" component={ReceiveScreen} />
          <Stack.Screen name="Swap" component={SwapScreen} />
          <Stack.Screen name="TokenDetail" component={TokenDetailScreen} />
          <Stack.Screen name="Backup" component={BackupScreen} />
          <Stack.Screen name="Wallets" component={WalletsScreen} />
          <Stack.Screen name="TreasuryMultisig" component={TreasuryMultisigScreen} />
          <Stack.Screen name="CreateSquad" component={CreateSquadScreen} />
          <Stack.Screen name="Activity" component={ActivityScreen} />
          <Stack.Screen name="Govern" component={GovernScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="WalletConnect" component={WalletConnectScreen} />
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  // Apply the saved network choice before anything uses the connection.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([loadNetworkPref(), loadSecurityPref(), loadMultisigPref()]).finally(() => setReady(true));
  }, []);

  return (
    <SafeAreaProvider>
      {ready ? (
        <WalletProvider>
          <WalletConnectProvider>
            <AuthProvider>
              <Root />
            </AuthProvider>
          </WalletConnectProvider>
        </WalletProvider>
      ) : (
        <Splash />
      )}
    </SafeAreaProvider>
  );
}
