/**
 * WalletKit singleton. `@walletconnect/react-native-compat` MUST be imported before
 * anything from the WalletConnect stack (it installs the RN polyfills) — App.tsx also
 * imports it first, and we import it here defensively.
 */
import "@walletconnect/react-native-compat";
import { Core } from "@walletconnect/core";
import { WalletKit, type IWalletKit } from "@reown/walletkit";
import { WC_METADATA, WC_PROJECT_ID } from "./config";

let instance: IWalletKit | null = null;
let initPromise: Promise<IWalletKit> | null = null;

export async function initWalletKit(): Promise<IWalletKit> {
  if (instance) return instance;
  if (!initPromise) {
    initPromise = (async () => {
      const core = new Core({ projectId: WC_PROJECT_ID });
      instance = await WalletKit.init({ core, metadata: WC_METADATA });
      return instance;
    })();
  }
  return initPromise;
}

export function getWalletKit(): IWalletKit | null {
  return instance;
}
