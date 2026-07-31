"use client";

// Buffer polyfill must load before web3.js / wallet-adapter — keep this import first.
import "@/lib/polyfills";
import { useMemo, type ReactNode } from "react";
import {
  ConnectionProvider,
  WalletProvider as BaseWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";
import "@solana/wallet-adapter-react-ui/styles.css";
import { PUBLIC_RPC } from "@/lib/liquidity/config";

/**
 * Wraps the liquidity page in Solana wallet context. We pass no explicit wallet
 * adapters — modern wallet-adapter auto-detects Wallet Standard wallets (Phantom,
 * Solflare, Backpack, …) that register themselves in the browser.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo<Adapter[]>(() => [], []);
  return (
    <ConnectionProvider endpoint={PUBLIC_RPC}>
      <BaseWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </BaseWalletProvider>
    </ConnectionProvider>
  );
}
