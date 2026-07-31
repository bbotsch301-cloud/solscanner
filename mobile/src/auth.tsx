import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState } from "react-native";
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
  // Biometric lock is on by default; if the user turned it off, open without a lock.
  const [unlocked, setUnlocked] = useState(!isBiometricEnabled());

  // Auto-lock: re-lock whenever the app is backgrounded (so an unlocked session can't
  // be resumed from the app switcher without re-authenticating).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && isBiometricEnabled()) setUnlocked(false);
    });
    return () => sub.remove();
  }, []);

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
