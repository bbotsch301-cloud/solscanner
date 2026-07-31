import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Tabs: undefined;
  /** asset is "native" or a token id (SPL mint / ERC-20 contract). */
  Send: { asset?: string } | undefined;
  /** asset is "native" or a token id (SPL mint / ERC-20 contract). */
  TokenDetail: { asset: string };
  Receive: undefined;
  Swap: undefined;
  Buy: undefined;
  Backup: undefined;
  Activity: undefined;
  Govern: undefined;
  Settings: undefined;
  WalletConnect: undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;
