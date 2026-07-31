import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Tabs: undefined;
  /** asset is "SOL" or an SPL mint address. */
  Send: { asset?: string } | undefined;
  Receive: undefined;
  Swap: undefined;
  Backup: undefined;
  Activity: undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;
