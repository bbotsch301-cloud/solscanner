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
import { AppState } from "react-native";
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
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { connection } from "../solana/connection";
import { toBaseUnits } from "../units";
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
  loadVault,
  keypairFor,
  evmAccountFor,
  addNewSeed,
  importSeed,
  addAccount as vaultAddAccount,
  setActive,
  removeSeed,
  renameSeed,
  markSeedBackedUp,
  clearVault,
  loadLockState,
  pinIsEnabled,
  pinIsUnlocked,
  unlockWithPin as vaultUnlockWithPin,
  lockSeeds,
  enableAppPin,
  disableAppPin,
  changeAppPin,
  type VaultIndex,
  type SeedMeta,
  type AccountRef,
} from "./vault";
import { isPinPrompted, setPinPrompted, clearPinPrompted } from "../security/prefs";
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
  importWallet: (mnemonic: string, passphrase?: string, indices?: number[]) => Promise<void>;
  reset: () => Promise<void>;
  needsBackup: boolean;
  markBackedUp: () => void;

  // ---- Multiple wallets (vault) ----
  /** All seeds (independent wallets) on this device. */
  seeds: SeedMeta[];
  activeSeedId: string | null;
  activeIndex: number;
  /** Switch the active account (re-derives keys, reloads balances). */
  switchAccount: (seedId: string, index: number) => Promise<void>;
  /** Derive the next account index for a seed and switch to it. */
  addAccount: (seedId: string) => Promise<void>;
  /** Remove a whole wallet (seed) and all its accounts. */
  removeWallet: (seedId: string) => Promise<void>;
  renameWallet: (seedId: string, label: string) => Promise<void>;

  // ---- App PIN (optional second encryption layer over every seed) ----
  /** True when a wallet exists (even if currently locked). */
  hasWallet: boolean;
  /** True when an app PIN is configured. */
  pinEnabled: boolean;
  /** True when a PIN is set but seeds aren't unlocked yet this session. */
  locked: boolean;
  /** Unlock seed access with the PIN. False on a wrong PIN. */
  unlockWithPin: (pin: string) => Promise<boolean>;
  /** Turn on the PIN (encrypts all seeds). */
  enablePin: (pin: string) => Promise<void>;
  /** Turn off the PIN (needs the current PIN). False if it's wrong. */
  disablePin: (pin: string) => Promise<boolean>;
  /** Change the PIN. False if the current PIN is wrong. */
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;
  /** True when we should offer (once) to set a PIN during setup. */
  shouldPromptPin: boolean;
  /** Dismiss the one-time PIN offer without setting one. */
  skipPinPrompt: () => Promise<void>;
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
  const [vault, setVault] = useState<VaultIndex | null>(null);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinPrompted, setPinPromptedState] = useState(isPinPrompted());
  const [locked, setLocked] = useState(false);
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

  /** Re-derive the signing keys for a (seed, index) and reload its balances. */
  const applyActive = useCallback(
    async (ref: AccountRef) => {
      const [kp, acct] = await Promise.all([
        keypairFor(ref.seedId, ref.index),
        evmAccountFor(ref.seedId, ref.index),
      ]);
      setKeypair(kp);
      keypairRef.current = kp;
      setEvmAccount(acct);
      evmAccountRef.current = acct;
      setSolBalance(null);
      setTokens([]);
      setEvmNative(null);
      setEvmTokens([]);
      loadChain(activeChainRef.current);
    },
    [loadChain]
  );

  // Load the vault (migrating a v1 single wallet) on startup.
  useEffect(() => {
    (async () => {
      try {
        // Learn whether a PIN is set BEFORE touching seeds (they may be encrypted).
        const hasPin = await loadLockState();
        setPinEnabled(hasPin);
        const [v, savedChain] = await Promise.all([
          loadVault(),
          SecureStore.getItemAsync(ACTIVE_CHAIN_KEY).catch(() => null),
        ]);
        const startChain = (CHAINS.find((c) => c.id === savedChain)?.id ?? DEFAULT_CHAIN) as ChainId;
        setActiveChainId(startChain);
        activeChainRef.current = startChain;
        if (v) {
          setVault(v);
          if (hasPin && !pinIsUnlocked()) {
            // A wallet exists but its seeds are encrypted — wait for the PIN before
            // deriving anything. Root shows the PIN unlock screen (not onboarding).
            setLocked(true);
          } else {
            const meta = v.seeds.find((s) => s.id === v.active.seedId);
            setNeedsBackupState(meta?.needsBackup ?? false);
            await applyActive(v.active);
          }
        }
      } catch {
        /* leave keypair null → onboarding; never hang on the splash screen */
      } finally {
        setInitializing(false);
      }
    })();
  }, [applyActive]);

  // Auto-lock seed access whenever the app is backgrounded (only if a PIN is set).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background" && pinIsEnabled()) {
        lockSeeds();
        setLocked(true);
        setKeypair(null);
        keypairRef.current = null;
        setEvmAccount(null);
        evmAccountRef.current = null;
      }
    });
    return () => sub.remove();
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<boolean> => {
      const ok = await vaultUnlockWithPin(pin);
      if (!ok) return false;
      setLocked(false);
      const v = (await loadVault()) ?? vault;
      if (v) {
        setVault(v);
        const meta = v.seeds.find((s) => s.id === v.active.seedId);
        setNeedsBackupState(meta?.needsBackup ?? false);
        await applyActive(v.active);
      }
      return true;
    },
    [applyActive, vault]
  );

  const enablePin = useCallback(async (pin: string) => {
    await enableAppPin(pin);
    setPinEnabled(true);
    setLocked(false);
    await setPinPrompted(); // enabling counts as prompted (don't re-offer if turned off later)
    setPinPromptedState(true);
  }, []);

  const skipPinPrompt = useCallback(async () => {
    await setPinPrompted();
    setPinPromptedState(true);
  }, []);

  const disablePin = useCallback(async (pin: string): Promise<boolean> => {
    const ok = await disableAppPin(pin);
    if (ok) setPinEnabled(false);
    return ok;
  }, []);

  const changePin = useCallback(async (oldPin: string, newPin: string): Promise<boolean> => {
    return changeAppPin(oldPin, newPin);
  }, []);

  const syncBackupFlag = useCallback((v: VaultIndex) => {
    const meta = v.seeds.find((s) => s.id === v.active.seedId);
    setNeedsBackupState(meta?.needsBackup ?? false);
  }, []);

  const create = useCallback(
    async (passphrase = "") => {
      const { vault: v } = await addNewSeed(passphrase);
      setVault(v);
      setNeedsBackupState(true);
      await applyActive(v.active);
    },
    [applyActive]
  );

  const importWallet = useCallback(
    async (mnemonic: string, passphrase = "", indices: number[] = [0]) => {
      const { vault: v } = await importSeed(mnemonic, passphrase, indices);
      setVault(v);
      syncBackupFlag(v);
      await applyActive(v.active);
    },
    [applyActive, syncBackupFlag]
  );

  const switchAccount = useCallback(
    async (seedId: string, index: number) => {
      const v = await setActive({ seedId, index });
      setVault(v);
      syncBackupFlag(v);
      await applyActive(v.active);
    },
    [applyActive, syncBackupFlag]
  );

  const addAccount = useCallback(
    async (seedId: string) => {
      const { index } = await vaultAddAccount(seedId);
      const v = await setActive({ seedId, index });
      setVault(v);
      syncBackupFlag(v);
      await applyActive(v.active);
    },
    [applyActive, syncBackupFlag]
  );

  const removeWallet = useCallback(
    async (seedId: string) => {
      const v = await removeSeed(seedId);
      setVault(v);
      if (!v) {
        setKeypair(null);
        keypairRef.current = null;
        setEvmAccount(null);
        evmAccountRef.current = null;
        setNeedsBackupState(false);
        setSolBalance(null);
        setTokens([]);
        setEvmNative(null);
        setEvmTokens([]);
      } else {
        syncBackupFlag(v);
        await applyActive(v.active);
      }
    },
    [applyActive, syncBackupFlag]
  );

  const renameWallet = useCallback(async (seedId: string, label: string) => {
    setVault(await renameSeed(seedId, label));
  }, []);

  const markBackedUp = useCallback(async () => {
    const v = await markSeedBackedUp(vault?.active.seedId ?? "");
    if (v) setVault(v);
    setNeedsBackupState(false);
  }, [vault]);

  const reset = useCallback(async () => {
    await clearVault();
    await clearPinPrompted();
    setPinPromptedState(false);
    setPinEnabled(false);
    setVault(null);
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
          lamports: toBaseUnits(sol, 9), // exact base units — never float-multiply
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

      // Idempotent create: a no-op if the recipient's token account already exists, and safe
      // against a TOCTOU race (avoids a check-then-create that could fail if it's created between).
      const tx = new Transaction();
      tx.add(createAssociatedTokenAccountIdempotentInstruction(kp.publicKey, toAta, toPk, mintPk, programId));
      const raw = toBaseUnits(uiAmount, decimals); // exact base units — never float-multiply
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
      seeds: vault?.seeds ?? [],
      activeSeedId: vault?.active.seedId ?? null,
      activeIndex: vault?.active.index ?? 0,
      switchAccount,
      addAccount,
      removeWallet,
      renameWallet,
      hasWallet: vault != null,
      pinEnabled,
      locked,
      unlockWithPin,
      enablePin,
      disablePin,
      changePin,
      shouldPromptPin: vault != null && !pinEnabled && !pinPrompted,
      skipPinPrompt,
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
    vault,
    pinEnabled,
    pinPrompted,
    locked,
    unlockWithPin,
    enablePin,
    disablePin,
    changePin,
    skipPinPrompt,
    keypair,
    evmAccount,
    needsBackup,
    markBackedUp,
    switchAccount,
    addAccount,
    removeWallet,
    renameWallet,
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
