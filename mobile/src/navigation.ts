import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { LegalDocKey } from "./legal/content";
import type { HistoryItem } from "./activity";

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
  /** Passes the row the list already has, so the screen paints without a refetch. */
  TransactionDetail: { item: HistoryItem };
  Govern: undefined;
  Settings: undefined;
  WalletConnect: undefined;
  TokenApprovals: undefined;
  Contacts: undefined;
  Legal: { doc: LegalDocKey };
  Browser: undefined;
  /** A single Key (non-fungible asset), by mint. */
  Collectible: { mint: string };
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;
