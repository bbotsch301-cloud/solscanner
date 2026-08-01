import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Tabs: undefined;
  Wallets: undefined;
  /** asset is "native" or a token id (SPL mint / ERC-20 contract). */
  Send: { asset?: string } | undefined;
  /** asset is "native" or a token id (SPL mint / ERC-20 contract). */
  TokenDetail: { asset: string };
  Receive: undefined;
  Swap: undefined;
  Backup: undefined;
  CreateWallet: undefined;
  ImportWallet: undefined;
  Multisig: undefined;
  MultisigWallet: undefined;
  TreasuryMultisig: undefined;
  CreateSquad: undefined;
  ConnectMultisig: undefined;
  ManageSigners: undefined;
  ProposeTransfer: undefined;
  Activity: undefined;
  Govern: undefined;
  Settings: undefined;
  WalletConnect: undefined;
  TokenApprovals: undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;
