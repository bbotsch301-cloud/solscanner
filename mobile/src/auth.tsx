import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { isBiometricEnabled } from "./security/prefs";

/**
 * Session lock state. Whether a wallet EXISTS is owned by WalletProvider (the key
 * in secure storage); this only tracks whether the current session is unlocked.
 */
interface AuthState {
  unlocked: boolean;
  unlock: () => void;
  lock: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // If biometric lock is off, the wallet opens without a lock screen.
  const [unlocked, setUnlocked] = useState(!isBiometricEnabled());

  const value = useMemo<AuthState>(
    () => ({
      unlocked,
      unlock: () => setUnlocked(true),
      lock: () => setUnlocked(false),
    }),
    [unlocked]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
