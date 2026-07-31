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
import * as SecureStore from "expo-secure-store";
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
import { CHAINS, DEFAULT_CHAIN, getChain, type ChainDef, type ChainId } from "../chains/registry";
import { getBalance as getEvmBalance } from "../evm/rpc";
import { fetchEvmTokenBalances, type EvmTokenBalance } from "../evm/tokens";
import { fetchEvmNativePrices, stableUsd } from "../evm/prices";
import { sendNativeEvm, sendTokenEvm } from "../evm/send";
import { executeUnifiedSwap } from "../swap";
import type { UnifiedQuote } from "../swap/types";
import {
  clearKeypair,
  createKeypair,
  getEvmAccount,
  getNeedsBackup,
  importMnemonic,
  loadKeypair,
  setNeedsBackup,
} from "./keystore";
import type { EvmAccount } from "./evm";

const ACTIVE_CHAIN_KEY = "wallet.activeChain.v1";

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

/** A chain-agnostic asset for the Home/Send lists. */
export interface UnifiedAsset {
  key: string;
  kind: "native" | "spl" | "erc20";
  symbol: string;
  name?: string;
  decimals: number;
  balance: number;
  usd: number | null;
  logoURI?: string;
  mint?: string; // spl
  program?: "legacy" | "token2022"; // spl
  address?: string; // erc20 contract
}

export interface NativeBalance {
  symbol: string;
  balance: number | null;
  usd: number | null;
}

interface WalletState {
  /** True until the stored key (if any) has been loaded. */
  initializing: boolean;
  keypair: Keypair | null;
  /** Solana address (kept stable for the Solana-specific screens). */
  address: string | null;
  /** SOL balance (not lamports), or null before first load. */
  solBalance: number | null;
  tokens: SplToken[];
  /** Live USD prices keyed by mint (native SOL under the wrapped-SOL mint). */
  prices: Record<string, PriceInfo>;
  solPrice: number | null;
  solChange24h: number | null;
  totalUsd: number | null;
  priceOf: (mint: string) => number | undefined;
  refreshing: boolean;
  busy: boolean;
  error: string | null;
  create: (passphrase?: string) => Promise<void>;
  importWallet: (mnemonic: string, passphrase?: string) => Promise<void>;
  reset: () => Promise<void>;
  needsBackup: boolean;
  markBackedUp: () => void;
  refresh: () => Promise<void>;
  airdrop: () => Promise<void>;
  send: (to: string, sol: number) => Promise<string>;
  sendToken: (mint: string, to: string, uiAmount: number, decimals: number) => Promise<string>;

  // ---- Multi-chain ----
  chains: ChainDef[];
  activeChain: ChainDef;
  setActiveChain: (id: ChainId) => Promise<void>;
  solanaAddress: string | null;
  evmAddress: string | null;
  /** Address for the active chain (Solana base58 or EVM 0x…). */
  activeAddress: string | null;
  /** Native asset of the active chain. */
  native: NativeBalance;
  /** Non-native assets held on the active chain. */
  assets: UnifiedAsset[];
  /** Send the active chain's native asset. */
  sendNative: (to: string, uiAmount: number) => Promise<string>;
  /** Send any asset (native or token) on its chain. */
  sendAsset: (asset: UnifiedAsset, to: string, uiAmount: number) => Promise<string>;
  /** Execute a swap on the active chain (signs with the right key), returns tx id/sig. */
  swapExecute: (quote: UnifiedQuote, onStatus?: (s: string) => void) => Promise<string>;
}

const WalletContext = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [evmAccount, setEvmAccount] = useState<EvmAccount | null>(null);
  const [needsBackup, setNeedsBackupState] = useState(false);
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [tokens, setTokens] = useState<SplToken[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [activeChainId, setActiveChainId] = useState<ChainId>(DEFAULT_CHAIN);
  const [evmNative, setEvmNative] = useState<number | null>(null);
  const [evmTokens, setEvmTokens] = useState<EvmTokenBalance[]>([]);
  const [evmPrices, setEvmPrices] = useState<Record<string, number>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keypairRef = useRef<Keypair | null>(null);
  const evmAccountRef = useRef<EvmAccount | null>(null);
  const activeChainRef = useRef<ChainId>(DEFAULT_CHAIN);
  keypairRef.current = keypair;
  evmAccountRef.current = evmAccount;
  activeChainRef.current = activeChainId;

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

  const fetchEvm = useCallback(async (chain: ChainDef, acct: EvmAccount) => {
    const [nativeWei, toks, evPrices] = await Promise.all([
      getEvmBalance(chain, acct.address),
      fetchEvmTokenBalances(chain, acct.address),
      fetchEvmNativePrices(),
    ]);
    setEvmNative(Number(nativeWei) / 10 ** chain.decimals);
    setEvmTokens(toks);
    setEvmPrices(evPrices);
  }, []);

  /** Load balances for a specific chain (used by refresh + chain switch). */
  const loadChain = useCallback(
    async (id: ChainId) => {
      const chain = getChain(id);
      setRefreshing(true);
      setError(null);
      try {
        if (chain.kind === "solana") {
          const kp = keypairRef.current;
          if (kp) await fetchBalances(kp.publicKey);
        } else {
          const acct = evmAccountRef.current;
          if (acct) await fetchEvm(chain, acct);
        }
      } catch (e) {
        setError(humanizeError(e, { action: "load" }));
      } finally {
        setRefreshing(false);
      }
    },
    [fetchBalances, fetchEvm]
  );

  const refresh = useCallback(async () => {
    await loadChain(activeChainRef.current);
  }, [loadChain]);

  const setActiveChain = useCallback(
    async (id: ChainId) => {
      activeChainRef.current = id;
      setActiveChainId(id);
      await SecureStore.setItemAsync(ACTIVE_CHAIN_KEY, id).catch(() => {});
      await loadChain(id);
    },
    [loadChain]
  );

  // Load a previously created wallet on startup.
  useEffect(() => {
    (async () => {
      const [kp, acct, savedChain] = await Promise.all([
        loadKeypair(),
        getEvmAccount(),
        SecureStore.getItemAsync(ACTIVE_CHAIN_KEY),
      ]);
      if (acct) {
        setEvmAccount(acct);
        evmAccountRef.current = acct;
      }
      const startChain = (CHAINS.find((c) => c.id === savedChain)?.id ?? DEFAULT_CHAIN) as ChainId;
      setActiveChainId(startChain);
      activeChainRef.current = startChain;
      if (kp) {
        setKeypair(kp);
        keypairRef.current = kp;
        setNeedsBackupState(await getNeedsBackup());
        loadChain(startChain);
      }
      setInitializing(false);
    })();
  }, [loadChain]);

  const afterKeyChange = useCallback(async () => {
    const acct = await getEvmAccount();
    setEvmAccount(acct);
    evmAccountRef.current = acct;
    setSolBalance(0);
    setTokens([]);
    setEvmNative(null);
    setEvmTokens([]);
    loadChain(activeChainRef.current);
  }, [loadChain]);

  const create = useCallback(async (passphrase = "") => {
    const kp = await createKeypair(passphrase);
    setKeypair(kp);
    keypairRef.current = kp;
    setNeedsBackupState(true);
    await afterKeyChange();
  }, [afterKeyChange]);

  const importWallet = useCallback(
    async (mnemonic: string, passphrase = "") => {
      const kp = await importMnemonic(mnemonic, passphrase);
      setKeypair(kp);
      keypairRef.current = kp;
      setNeedsBackupState(false);
      await afterKeyChange();
    },
    [afterKeyChange]
  );

  const markBackedUp = useCallback(async () => {
    await setNeedsBackup(false);
    setNeedsBackupState(false);
  }, []);

  const reset = useCallback(async () => {
    await clearKeypair();
    setKeypair(null);
    keypairRef.current = null;
    setEvmAccount(null);
    evmAccountRef.current = null;
    setNeedsBackupState(false);
    setSolBalance(null);
    setTokens([]);
    setEvmNative(null);
    setEvmTokens([]);
  }, []);

  const airdrop = useCallback(async () => {
    const kp = keypairRef.current;
    if (!kp) return;
    setBusy(true);
    setError(null);
    try {
      const sig = await connection.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      await fetchBalances(kp.publicKey);
    } catch (e) {
      setError(humanizeError(e, { action: "airdrop" }));
    } finally {
      setBusy(false);
    }
  }, [fetchBalances]);

  const send = useCallback(
    async (to: string, sol: number): Promise<string> => {
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
    },
    [fetchBalances]
  );

  const sendToken = useCallback(
    async (mint: string, to: string, uiAmount: number, decimals: number): Promise<string> => {
      const kp = keypairRef.current;
      if (!kp) throw new Error("No wallet");
      const mintPk = new PublicKey(mint);
      const toPk = new PublicKey(to); // throws on invalid address

      const mintInfo = await connection.getAccountInfo(mintPk);
      const programId = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
        ? TOKEN_2022_PROGRAM_ID
        : TOKEN_PROGRAM_ID;

      const fromAta = await getAssociatedTokenAddress(mintPk, kp.publicKey, false, programId);
      const toAta = await getAssociatedTokenAddress(mintPk, toPk, false, programId);

      const tx = new Transaction();
      const toInfo = await connection.getAccountInfo(toAta);
      if (!toInfo) {
        tx.add(createAssociatedTokenAccountInstruction(kp.publicKey, toAta, toPk, mintPk, programId));
      }
      const raw = BigInt(Math.round(uiAmount * 10 ** decimals));
      tx.add(
        createTransferCheckedInstruction(fromAta, mintPk, toAta, kp.publicKey, raw, decimals, [], programId)
      );

      const sig = await sendAndConfirmTransaction(connection, tx, [kp]);
      fetchBalances(kp.publicKey).catch(() => {});
      return sig;
    },
    [fetchBalances]
  );

  const sendNative = useCallback(
    async (to: string, uiAmount: number): Promise<string> => {
      const chain = getChain(activeChainRef.current);
      if (chain.kind === "solana") return send(to, uiAmount);
      const acct = evmAccountRef.current;
      if (!acct) throw new Error("No EVM wallet on this device.");
      const sig = await sendNativeEvm(chain, acct.privateKey, acct.address, to, uiAmount);
      loadChain(chain.id);
      return sig;
    },
    [send, loadChain]
  );

  const sendAsset = useCallback(
    async (asset: UnifiedAsset, to: string, uiAmount: number): Promise<string> => {
      const chain = getChain(activeChainRef.current);
      if (asset.kind === "native") return sendNative(to, uiAmount);
      if (asset.kind === "spl") return sendToken(asset.mint!, to, uiAmount, asset.decimals);
      // erc20
      const acct = evmAccountRef.current;
      if (!acct) throw new Error("No EVM wallet on this device.");
      const sig = await sendTokenEvm(
        chain,
        acct.privateKey,
        acct.address,
        asset.address!,
        asset.decimals,
        to,
        uiAmount
      );
      loadChain(chain.id);
      return sig;
    },
    [sendNative, sendToken, loadChain]
  );

  const swapExecute = useCallback(
    async (quote: UnifiedQuote, onStatus?: (s: string) => void): Promise<string> => {
      const chain = getChain(activeChainRef.current);
      const signer = chain.kind === "solana" ? keypairRef.current : evmAccountRef.current;
      if (!signer) throw new Error("No wallet for this chain.");
      const sig = await executeUnifiedSwap(chain, quote, signer, onStatus);
      loadChain(chain.id);
      return sig;
    },
    [loadChain]
  );

  const value = useMemo<WalletState>(() => {
    const solPrice = prices[WSOL_MINT]?.usdPrice ?? null;
    const solChange24h = prices[WSOL_MINT]?.priceChange24h ?? null;
    const priceOf = (mint: string) => prices[mint]?.usdPrice;
    const solanaAddress = keypair?.publicKey.toBase58() ?? null;
    const evmAddress = evmAccount?.address ?? null;
    const activeChain = getChain(activeChainId);

    let activeAddress: string | null;
    let native: NativeBalance;
    let assets: UnifiedAsset[];

    if (activeChain.kind === "solana") {
      activeAddress = solanaAddress;
      native = {
        symbol: "SOL",
        balance: solBalance,
        usd: solBalance != null && solPrice != null ? solBalance * solPrice : null,
      };
      assets = tokens.map((t) => {
        const p = priceOf(t.mint);
        return {
          key: t.mint,
          kind: "spl",
          symbol: t.symbol ?? t.mint.slice(0, 4),
          name: t.name,
          decimals: t.decimals,
          balance: t.amount,
          usd: p != null ? t.amount * p : null,
          logoURI: t.logoURI,
          mint: t.mint,
          program: t.program,
        };
      });
    } else {
      activeAddress = evmAddress;
      const nUsd = evmPrices[activeChain.symbol] ?? null;
      native = {
        symbol: activeChain.symbol,
        balance: evmNative,
        usd: evmNative != null && nUsd != null ? evmNative * nUsd : null,
      };
      assets = evmTokens
        .filter((tb) => tb.balance > 0)
        .map((tb) => ({
          key: tb.token.address,
          kind: "erc20",
          symbol: tb.token.symbol,
          name: tb.token.name,
          decimals: tb.token.decimals,
          balance: tb.balance,
          usd: tb.balance * stableUsd(tb.token.symbol),
          logoURI: tb.token.logoURI,
          address: tb.token.address,
        }));
    }

    const totalUsd =
      native.balance == null
        ? null
        : (native.usd ?? 0) + assets.reduce((s, a) => s + (a.usd ?? 0), 0);

    return {
      initializing,
      keypair,
      address: solanaAddress,
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
      chains: CHAINS,
      activeChain,
      setActiveChain,
      solanaAddress,
      evmAddress,
      activeAddress,
      native,
      assets,
      sendNative,
      sendAsset,
      swapExecute,
    };
  }, [
    initializing,
    keypair,
    evmAccount,
    needsBackup,
    markBackedUp,
    solBalance,
    tokens,
    prices,
    activeChainId,
    evmNative,
    evmTokens,
    evmPrices,
    refreshing,
    busy,
    error,
    create,
    importWallet,
    reset,
    refresh,
    airdrop,
    send,
    sendToken,
    setActiveChain,
    sendNative,
    sendAsset,
    swapExecute,
  ]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
