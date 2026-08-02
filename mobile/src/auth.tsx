import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { isBiometricEnabled } from "./security/prefs";

// Mirrors BACKGROUND_GRACE_MS in WalletContext — a short window where returning to the app
// doesn't re-prompt, so stepping out for an address mid-transaction isn't punished.
const BACKGROUND_GRACE_MS = 60_000;

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

  // Auto-lock after a grace window rather than the instant the app backgrounds — the app-switcher
  // snapshot is covered separately (PrivacyCover at the root), so a quick trip to another app
  // never exposes anything and never costs a re-auth.
  const backgroundedAtRef = useRef(0);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAtRef.current = Date.now();
      } else if (state === "active") {
        const away = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0;
        backgroundedAtRef.current = 0;
        if (away > BACKGROUND_GRACE_MS && isBiometricEnabled()) setUnlocked(false);
      }
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
