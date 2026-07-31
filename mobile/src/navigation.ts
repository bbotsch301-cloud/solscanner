import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

export type RootStackParamList = {
  Tabs: undefined;
  Send: { symbol?: string } | undefined;
  Receive: undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;
