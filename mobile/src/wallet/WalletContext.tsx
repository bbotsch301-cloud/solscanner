import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { connection } from "../solana/connection";
import { clearKeypair, createKeypair, loadKeypair } from "./keystore";

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

export interface SplToken {
  mint: string;
  amount: number;
  decimals: number;
}

interface WalletState {
  /** True until the stored key (if any) has been loaded. */
  initializing: boolean;
  keypair: Keypair | null;
  address: string | null;
  /** SOL balance (not lamports), or null before first load. */
  solBalance: number | null;
  tokens: SplToken[];
  refreshing: boolean;
  busy: boolean;
  error: string | null;
  create: () => Promise<void>;
  reset: () => Promise<void>;
  refresh: () => Promise<void>;
  airdrop: () => Promise<void>;
  send: (to: string, sol: number) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<SplToken[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keypairRef = useRef<Keypair | null>(null);
  keypairRef.current = keypair;

  const fetchBalances = useCallback(async (pubkey: PublicKey) => {
    const [lamports, parsed] = await Promise.all([
      connection.getBalance(pubkey),
      connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: TOKEN_PROGRAM_ID,
      }),
    ]);
    setSolBalance(lamports / LAMPORTS_PER_SOL);
    const spl: SplToken[] = parsed.value
      .map((a) => {
        const info = a.account.data.parsed.info;
        return {
          mint: info.mint as string,
          amount: info.tokenAmount.uiAmount ?? 0,
          decimals: info.tokenAmount.decimals as number,
        };
      })
      .filter((t) => t.amount > 0);
    setTokens(spl);
  }, []);

  const refresh = useCallback(async () => {
    const kp = keypairRef.current;
    if (!kp) return;
    setRefreshing(true);
    setError(null);
    try {
      await fetchBalances(kp.publicKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }, [fetchBalances]);

  // Load a previously created wallet on startup.
  useEffect(() => {
    (async () => {
      const kp = await loadKeypair();
      if (kp) {
        setKeypair(kp);
        keypairRef.current = kp;
        refresh();
      }
      setInitializing(false);
    })();
  }, [refresh]);

  const create = useCallback(async () => {
    const kp = await createKeypair();
    setKeypair(kp);
    keypairRef.current = kp;
    setSolBalance(0);
    setTokens([]);
    refresh();
  }, [refresh]);

  const reset = useCallback(async () => {
    await clearKeypair();
    setKeypair(null);
    keypairRef.current = null;
    setSolBalance(null);
    setTokens([]);
  }, []);

  const airdrop = useCallback(async () => {
    const kp = keypairRef.current;
    if (!kp) return;
    setBusy(true);
    setError(null);
    try {
      const sig = await connection.requestAirdrop(
        kp.publicKey,
        LAMPORTS_PER_SOL
      );
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature: sig, ...bh },
        "confirmed"
      );
      await fetchBalances(kp.publicKey);
    } catch (e) {
      setError(
        (e as Error).message.includes("429")
          ? "Faucet rate-limited. Try again in a bit."
          : (e as Error).message
      );
    } finally {
      setBusy(false);
    }
  }, [fetchBalances]);

  const send = useCallback(async (to: string, sol: number): Promise<string> => {
    const kp = keypairRef.current;
    if (!kp) throw new Error("No wallet");
    const toPubkey = new PublicKey(to); // throws on invalid address
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: kp.publicKey,
        toPubkey,
        lamports: Math.round(sol * LAMPORTS_PER_SOL),
      })
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [kp]);
    fetchBalances(kp.publicKey).catch(() => {});
    return sig;
  }, [fetchBalances]);

  const value = useMemo<WalletState>(
    () => ({
      initializing,
      keypair,
      address: keypair?.publicKey.toBase58() ?? null,
      solBalance,
      tokens,
      refreshing,
      busy,
      error,
      create,
      reset,
      refresh,
      airdrop,
      send,
    }),
    [initializing, keypair, solBalance, tokens, refreshing, busy, error, create, reset, refresh, airdrop, send]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
