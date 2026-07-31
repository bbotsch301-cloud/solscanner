import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Prototype auth/session state: whether a wallet has been set up (onboarded) and
 * whether it's currently unlocked. Real key custody and passkey enrollment land in
 * a later phase; this drives the onboarding + biometric-unlock gate for now.
 */
interface AuthState {
  onboarded: boolean;
  unlocked: boolean;
  completeOnboarding: () => void;
  unlock: () => void;
  lock: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [onboarded, setOnboarded] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const value = useMemo<AuthState>(
    () => ({
      onboarded,
      unlocked,
      completeOnboarding: () => {
        setOnboarded(true);
        setUnlocked(true);
      },
      unlock: () => setUnlocked(true),
      lock: () => setUnlocked(false),
    }),
    [onboarded, unlocked]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
