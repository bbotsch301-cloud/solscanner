import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EcosystemScreen } from "./src/screens/EcosystemScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { TreasuryScreen } from "./src/screens/TreasuryScreen";
import { GovernScreen } from "./src/screens/GovernScreen";
import { ActivityScreen } from "./src/screens/ActivityScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { SendScreen } from "./src/screens/SendScreen";
import { ReceiveScreen } from "./src/screens/ReceiveScreen";
import { SwapScreen } from "./src/screens/SwapScreen";
import { BuyScreen } from "./src/screens/BuyScreen";
import { BackupScreen } from "./src/screens/BackupScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { LockScreen } from "./src/screens/LockScreen";
import { AuthProvider, useAuth } from "./src/auth";
import { WalletProvider, useWallet } from "./src/wallet/WalletContext";
import type { RootStackParamList } from "./src/navigation";
import { colors } from "./src/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator();

const TAB_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: "home",
  Wallet: "wallet",
  Treasury: "business",
  Govern: "people",
  Settings: "settings",
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
      <Tab.Screen name="Treasury" component={TreasuryScreen} />
      <Tab.Screen name="Govern" component={GovernScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
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
  const { initializing, keypair } = useWallet();
  const { unlocked } = useAuth();

  if (initializing) return <><StatusBar style="light" /><Splash /></>;
  if (!keypair) return <><StatusBar style="light" /><OnboardingScreen /></>;
  if (!unlocked) return <><StatusBar style="light" /><LockScreen /></>;

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Group screenOptions={{ presentation: "modal" }}>
          <Stack.Screen name="Send" component={SendScreen} />
          <Stack.Screen name="Receive" component={ReceiveScreen} />
          <Stack.Screen name="Swap" component={SwapScreen} />
          <Stack.Screen name="Buy" component={BuyScreen} />
          <Stack.Screen name="Backup" component={BackupScreen} />
          <Stack.Screen name="Activity" component={ActivityScreen} />
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <WalletProvider>
        <AuthProvider>
          <Root />
        </AuthProvider>
      </WalletProvider>
    </SafeAreaProvider>
  );
}
