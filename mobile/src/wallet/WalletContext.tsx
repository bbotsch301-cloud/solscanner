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
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { connection } from "../solana/connection";
import { humanizeError } from "../solana/errors";
import { fetchPrices, WSOL_MINT, type PriceInfo } from "../solana/prices";
import { fetchTokenMetas } from "../solana/tokens";
import {
  clearKeypair,
  createKeypair,
  getNeedsBackup,
  importMnemonic,
  loadKeypair,
  setNeedsBackup,
} from "./keystore";

export interface SplToken {
  mint: string;
  amount: number;
  decimals: number;
  /** Which token program owns the mint (Token-2022 tokens like XGO charge fees). */
  program: "legacy" | "token2022";
  symbol?: string;
  name?: string;
  logoURI?: string;
}

interface WalletState {
  /** True until the stored key (if any) has been loaded. */
  initializing: boolean;
  keypair: Keypair | null;
  address: string | null;
  /** SOL balance (not lamports), or null before first load. */
  solBalance: number | null;
  tokens: SplToken[];
  /** Live USD prices keyed by mint (native SOL under the wrapped-SOL mint). */
  prices: Record<string, PriceInfo>;
  /** Live SOL price in USD, or null if unavailable. */
  solPrice: number | null;
  /** SOL 24h change as a percentage, if known. */
  solChange24h: number | null;
  /** Total portfolio value in USD, or null before first load. */
  totalUsd: number | null;
  /** USD price for a given mint, if known. */
  priceOf: (mint: string) => number | undefined;
  refreshing: boolean;
  busy: boolean;
  error: string | null;
  create: () => Promise<void>;
  importWallet: (mnemonic: string) => Promise<void>;
  reset: () => Promise<void>;
  /** True when a new wallet hasn't been backed up yet. */
  needsBackup: boolean;
  markBackedUp: () => void;
  refresh: () => Promise<void>;
  airdrop: () => Promise<void>;
  send: (to: string, sol: number) => Promise<string>;
  sendToken: (
    mint: string,
    to: string,
    uiAmount: number,
    decimals: number
  ) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [needsBackup, setNeedsBackupState] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<SplToken[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keypairRef = useRef<Keypair | null>(null);
  keypairRef.current = keypair;

  const fetchBalances = useCallback(async (pubkey: PublicKey) => {
    // Query BOTH token programs so Token-2022 assets (like XGO) show up too.
    const [lamports, legacy, token2022] = await Promise.all([
      connection.getBalance(pubkey),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
      connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);
    setSolBalance(lamports / LAMPORTS_PER_SOL);

    const toTokens = (
      res: Awaited<ReturnType<typeof connection.getParsedTokenAccountsByOwner>>,
      program: SplToken["program"]
    ): SplToken[] =>
      res.value.map((a) => {
        const info = a.account.data.parsed.info;
        return {
          mint: info.mint as string,
          amount: info.tokenAmount.uiAmount ?? 0,
          decimals: info.tokenAmount.decimals as number,
          program,
        };
      });

    const spl: SplToken[] = [
      ...toTokens(legacy, "legacy"),
      ...toTokens(token2022, "token2022"),
    ].filter((t) => t.amount > 0);
    setTokens(spl);

    const mints = spl.map((t) => t.mint);
    // Prices and metadata are best-effort — never fail a balance refresh over them.
    const [, metas] = await Promise.all([
      fetchPrices([WSOL_MINT, ...mints])
        .then(setPrices)
        .catch(() => {}),
      fetchTokenMetas(mints).catch(() => ({}) as Record<string, never>),
    ]);
    if (metas && Object.keys(metas).length) {
      setTokens(spl.map((t) => ({ ...t, ...metas[t.mint] })));
    }
  }, []);

  const refresh = useCallback(async () => {
    const kp = keypairRef.current;
    if (!kp) return;
    setRefreshing(true);
    setError(null);
    try {
      await fetchBalances(kp.publicKey);
    } catch (e) {
      setError(humanizeError(e, { action: "load" }));
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
        setNeedsBackupState(await getNeedsBackup());
        refresh();
      }
      setInitializing(false);
    })();
  }, [refresh]);

  const create = useCallback(async () => {
    const kp = await createKeypair(); // marks needs-backup in the keystore
    setKeypair(kp);
    keypairRef.current = kp;
    setNeedsBackupState(true);
    setSolBalance(0);
    setTokens([]);
    refresh();
  }, [refresh]);

  const importWallet = useCallback(
    async (mnemonic: string) => {
      const kp = await importMnemonic(mnemonic); // throws on invalid phrase
      setKeypair(kp);
      keypairRef.current = kp;
      setNeedsBackupState(false);
      setSolBalance(0);
      setTokens([]);
      refresh();
    },
    [refresh]
  );

  const markBackedUp = useCallback(async () => {
    await setNeedsBackup(false);
    setNeedsBackupState(false);
  }, []);

  const reset = useCallback(async () => {
    await clearKeypair();
    setKeypair(null);
    keypairRef.current = null;
    setNeedsBackupState(false);
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
      setError(humanizeError(e, { action: "airdrop" }));
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

  const sendToken = useCallback(
    async (mint: string, to: string, uiAmount: number, decimals: number): Promise<string> => {
      const kp = keypairRef.current;
      if (!kp) throw new Error("No wallet");
      const mintPk = new PublicKey(mint);
      const toPk = new PublicKey(to); // throws on invalid address

      // Detect the token program from the mint's owner (legacy vs Token-2022).
      const mintInfo = await connection.getAccountInfo(mintPk);
      const programId = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      const fromAta = await getAssociatedTokenAddress(mintPk, kp.publicKey, false, programId);
      const toAta = await getAssociatedTokenAddress(mintPk, toPk, false, programId);

      const tx = new Transaction();
      // Create the recipient's token account if they don't have one yet.
      const toInfo = await connection.getAccountInfo(toAta);
      if (!toInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(kp.publicKey, toAta, toPk, mintPk, programId)
        );
      }
      const raw = BigInt(Math.round(uiAmount * 10 ** decimals));
      // For Token-2022 fee tokens (like XGO), the mint applies its transfer fee
      // automatically; the recipient receives the amount minus the fee.
      tx.add(
        createTransferCheckedInstruction(fromAta, mintPk, toAta, kp.publicKey, raw, decimals, [], programId)
      );

      const sig = await sendAndConfirmTransaction(connection, tx, [kp]);
      fetchBalances(kp.publicKey).catch(() => {});
      return sig;
    },
    [fetchBalances]
  );

  const value = useMemo<WalletState>(() => {
    const solPrice = prices[WSOL_MINT]?.usdPrice ?? null;
    const solChange24h = prices[WSOL_MINT]?.priceChange24h ?? null;
    const priceOf = (mint: string) => prices[mint]?.usdPrice;
    const totalUsd =
      solBalance == null
        ? null
        : solBalance * (solPrice ?? 0) +
          tokens.reduce((s, t) => s + t.amount * (prices[t.mint]?.usdPrice ?? 0), 0);

    return {
      initializing,
      keypair,
      address: keypair?.publicKey.toBase58() ?? null,
      solBalance,
      tokens,
      prices,
      solPrice,
      solChange24h,
      totalUsd,
      priceOf,
      refreshing,
      busy,
      error,
      create,
      importWallet,
      reset,
      needsBackup,
      markBackedUp,
      refresh,
      airdrop,
      send,
      sendToken,
    };
  }, [initializing, keypair, needsBackup, markBackedUp, solBalance, tokens, prices, refreshing, busy, error, create, importWallet, reset, refresh, airdrop, send, sendToken]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
