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
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { connection, CLUSTER, isPublicRpc } from "../solana/connection";
import { fetchAssetsViaDas } from "../solana/das";
import { getWalletSnapshot, saveWalletSnapshot } from "./snapshotCache";
import { sendAndConfirmGuarded } from "../solana/tx";
import { toBaseUnits } from "../units";
import { humanizeError } from "../solana/errors";
import { fetchPrices, WSOL_MINT, type PriceInfo } from "../solana/prices";
import { fetchTokenMetas } from "../solana/tokens";
import { CHAINS, DEFAULT_CHAIN, getChain, type ChainDef, type ChainId } from "../chains/registry";
import { getBalance as getEvmBalance } from "../evm/rpc";
import { fetchEvmTokenBalances, type EvmTokenBalance } from "../evm/tokens";
import { fetchEvmNativePrices, stableUsd } from "../evm/prices";
import { sendNativeEvm, sendTokenEvm, previewEvmSend, approveEvm } from "../evm/send";
import { executeUnifiedSwap } from "../swap";
import type { UnifiedQuote } from "../swap/types";
import {
  loadVault,
  deriveAccount,
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
  pinLockoutMs as vaultPinLockoutMs,
  lockSeeds,
  enableAppPin,
  disableAppPin,
  changeAppPin,
  type VaultIndex,
  type SeedMeta,
  type AccountRef,
} from "./vault";
import { getPubAddress, putPubAddress } from "./pubAddresses";
import { isPinPrompted, setPinPrompted, clearPinPrompted, isNotificationsEnabled, isFastBalancesEnabled } from "../security/prefs";
import { recordApproval } from "../safety/approvals";
import { notifyReceived, registerForBackendPush } from "../ui/notifications";
import type { EvmAccount } from "./evm";

const ACTIVE_CHAIN_KEY = "wallet.activeChain.v1";
// Auto-lock the seeds after this long with no interaction, even while foregrounded, so an
// unlocked wallet left open on an unattended phone re-locks itself.
const INACTIVITY_MS = 5 * 60_000;
// How long the app may sit backgrounded before it re-locks. Short enough that a lost phone is
// still protected, long enough to step into another app for an address and come back mid-send.
const BACKGROUND_GRACE_MS = 60_000;

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
  /** Milliseconds left on a brute-force lockout (0 when an attempt is allowed). */
  pinLockoutMs: () => number;
  /** Reset the inactivity auto-lock clock (wired to root touches). */
  bumpActivity: () => void;
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
  /** Simulate a send and return the network fee, before the confirm dialog. */
  previewSend: (asset: UnifiedAsset, to: string, uiAmount: number) => Promise<{ feeNative: number; symbol: string }>;
  /** Execute a swap on the active chain (signs with the right key), returns tx id/sig. */
  swapExecute: (quote: UnifiedQuote, onStatus?: (s: string) => void) => Promise<string>;
  /** Revoke an ERC-20 allowance (set to 0) on the active EVM chain. Returns the tx hash. */
  revokeApproval: (token: string, spender: string) => Promise<string>;
  /** Re-register all addresses with the push backend (call after enabling notifications). */
  syncPushRegistration: () => Promise<void>;
}

/** Volatile status kept in a SEPARATE context so a pull-to-refresh (which toggles `refreshing`)
 *  doesn't re-render every `useWallet()` consumer or rebuild the derived `assets`/`native`. */
export interface WalletStatus {
  refreshing: boolean;
  busy: boolean;
  error: string | null;
}

const WalletContext = createContext<WalletState | null>(null);
const WalletStatusContext = createContext<WalletStatus | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [vault, setVault] = useState<VaultIndex | null>(null);
  const [pinEnabled, setPinEnabled] = useState(false);
  // Whether the user has already been offered the PIN setup (so "Skip for now" dismisses it
  // and we don't re-prompt). Enabling a PIN also counts as prompted.
  const [pinPrompted, setPinPromptedState] = useState(isPinPrompted());
  const [locked, setLocked] = useState(false);
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [evmAccount, setEvmAccount] = useState<EvmAccount | null>(null);
  // The active account's PUBLIC addresses, set instantly from the stored address cache on a switch
  // so assets render before the (slow) key derivation finishes. The keypair above is derived after
  // and only needed to sign — the addresses never depend on it.
  const [activeSolAddress, setActiveSolAddress] = useState<string | null>(null);
  const [activeEvmAddress, setActiveEvmAddress] = useState<string | null>(null);
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
  // Active public addresses, read by loadChain to fetch balances without needing the keypair.
  const activeSolAddressRef = useRef<string | null>(null);
  const activeEvmAddressRef = useRef<string | null>(null);
  const activeChainRef = useRef<ChainId>(DEFAULT_CHAIN);
  const lastActivityRef = useRef(0); // stamped on mount in the inactivity effect below
  const backgroundedAtRef = useRef(0); // when the app last went to background (0 = foregrounded)
  // Receive-notification state: last-known per-asset balances for the active address, and the
  // time of the user's last send/swap (to suppress "received" for their own outgoing/swap moves).
  const balanceBaselineRef = useRef<{ addr: string; amounts: Record<string, number> } | null>(null);
  const lastActionRef = useRef(0);
  keypairRef.current = keypair;
  evmAccountRef.current = evmAccount;
  activeChainRef.current = activeChainId;

  // Compare the freshly-loaded balances for `addr` against the last snapshot; any positive delta
  // fires a local "Received X" notification (only when enabled, not right after the user's own
  // action, and never on the first load of an address). Then re-snapshots.
  const detectReceipts = useCallback(
    (addr: string, entries: { key: string; symbol: string; amount: number; priceUsd?: number | null }[]) => {
      const prev = balanceBaselineRef.current;
      const amounts: Record<string, number> = {};
      for (const e of entries) amounts[e.key] = e.amount;
      const quiet = Date.now() - lastActionRef.current < 12_000;
      if (prev?.addr === addr && isNotificationsEnabled() && !quiet) {
        for (const e of entries) {
          const delta = e.amount - (prev.amounts[e.key] ?? 0);
          if (delta > 1e-9) {
            notifyReceived({ symbol: e.symbol, amount: delta, usd: e.priceUsd != null ? e.priceUsd * delta : null });
          }
        }
      }
      balanceBaselineRef.current = { addr, amounts };
    },
    []
  );

  // Drop all in-memory key material and require the PIN again. Used by both the
  // background lock and the inactivity timer.
  const lockNow = useCallback(() => {
    if (!pinIsEnabled()) return;
    lockSeeds();
    setLocked(true);
    setKeypair(null);
    keypairRef.current = null;
    setEvmAccount(null);
    evmAccountRef.current = null;
    setActiveSolAddress(null);
    activeSolAddressRef.current = null;
    setActiveEvmAddress(null);
    activeEvmAddressRef.current = null;
  }, []);

  // Any touch anywhere in the app resets the inactivity clock (wired at the root in App).
  const bumpActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const fetchBalances = useCallback(async (pubkey: PublicKey) => {
    // Fast-path: on a dedicated (Helius-capable) RPC with the opt-in enabled, one DAS call returns
    // balances + prices + metadata. Any failure returns null → we fall through to the normal path,
    // so the balance display can never break.
    if (!isPublicRpc() && isFastBalancesEnabled()) {
      const das = await fetchAssetsViaDas(pubkey);
      if (das) {
        const solUi = das.lamports / LAMPORTS_PER_SOL;
        // DAS omits the 24h change; grab just SOL's (one tiny call) so the balance hero keeps its %.
        const solChange = await fetchPrices([WSOL_MINT]).then((p) => p[WSOL_MINT]?.priceChange24h).catch(() => undefined);
        const prices = { ...das.prices };
        if (prices[WSOL_MINT] && solChange != null) prices[WSOL_MINT] = { ...prices[WSOL_MINT], priceChange24h: solChange };
        setSolBalance(solUi);
        setTokens(das.tokens);
        setPrices(prices);
        saveWalletSnapshot(`sol:${CLUSTER}:${pubkey.toBase58()}`, { solBalance: solUi, tokens: das.tokens, prices });
        detectReceipts(pubkey.toBase58(), [
          { key: "native:SOL", symbol: "SOL", amount: solUi, priceUsd: prices[WSOL_MINT]?.usdPrice ?? null },
          ...das.tokens.map((t) => ({
            key: t.mint,
            symbol: t.symbol ?? t.mint.slice(0, 4),
            amount: t.amount,
            priceUsd: prices[t.mint]?.usdPrice ?? null,
          })),
        ]);
        return;
      }
    }

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

    // NFT-shaped accounts (decimals 0, amount 1) belong to the Collection gallery, not the token
    // list — without this they render as junk "1 XXXX" rows.
    const spl: SplToken[] = [
      ...toTokens(legacy, "legacy"),
      ...toTokens(token2022, "token2022"),
    ].filter((t) => t.amount > 0 && !(t.decimals === 0 && t.amount === 1));
    setTokens(spl);

    const mints = spl.map((t) => t.mint);
    const [priceRes, metas] = await Promise.all([
      fetchPrices([WSOL_MINT, ...mints]).catch(() => ({}) as Record<string, PriceInfo>),
      fetchTokenMetas(mints).catch(() => ({}) as Record<string, never>),
    ]);
    setPrices(priceRes);
    const merged = metas && Object.keys(metas).length ? spl.map((t) => ({ ...t, ...metas[t.mint] })) : spl;
    if (merged !== spl) setTokens(merged);
    // Persist this snapshot so the next cold open paints instantly (network-scoped: mainnet ≠ devnet).
    saveWalletSnapshot(`sol:${CLUSTER}:${pubkey.toBase58()}`, {
      solBalance: lamports / LAMPORTS_PER_SOL,
      tokens: merged,
      prices: priceRes,
    });

    detectReceipts(pubkey.toBase58(), [
      { key: "native:SOL", symbol: "SOL", amount: lamports / LAMPORTS_PER_SOL, priceUsd: priceRes[WSOL_MINT]?.usdPrice ?? null },
      ...spl.map((t) => ({
        key: t.mint,
        symbol: metas[t.mint]?.symbol ?? t.mint.slice(0, 4),
        amount: t.amount,
        priceUsd: priceRes[t.mint]?.usdPrice ?? null,
      })),
    ]);
  }, [detectReceipts]);

  const fetchEvm = useCallback(async (chain: ChainDef, address: string) => {
    const [nativeWei, toks, evPrices] = await Promise.all([
      getEvmBalance(chain, address),
      fetchEvmTokenBalances(chain, address),
      fetchEvmNativePrices(),
    ]);
    const nativeAmt = Number(nativeWei) / 10 ** chain.decimals;
    setEvmNative(nativeAmt);
    setEvmTokens(toks);
    setEvmPrices(evPrices);
    saveWalletSnapshot(`${chain.id}:${address}`, { evmNative: nativeAmt, evmTokens: toks, evmPrices: evPrices });

    detectReceipts(address, [
      { key: "native", symbol: chain.symbol, amount: nativeAmt, priceUsd: evPrices[chain.symbol] ?? null },
      ...toks
        .filter((tb) => tb.balance > 0)
        .map((tb) => ({ key: tb.token.address, symbol: tb.token.symbol, amount: tb.balance, priceUsd: stableUsd(tb.token.symbol) })),
    ]);
  }, [detectReceipts]);

  /** Load balances for a specific chain (used by refresh + chain switch). */
  // Paint the last-known balances/tokens/prices from disk immediately (before the RPC round-trip),
  // so switching accounts/chains and cold opens feel instant. The live load then refreshes them.
  const seedFromSnapshot = useCallback((id: ChainId, sol: string | null, evm: string | null) => {
    const chain = getChain(id);
    if (chain.kind === "solana" && sol) {
      const s = getWalletSnapshot(`sol:${CLUSTER}:${sol}`);
      if (s) {
        setSolBalance(s.solBalance ?? null);
        setTokens(s.tokens ?? []);
        if (s.prices) setPrices(s.prices);
      }
    } else if (chain.kind === "evm" && evm) {
      const s = getWalletSnapshot(`${id}:${evm}`);
      if (s) {
        setEvmNative(s.evmNative ?? null);
        setEvmTokens(s.evmTokens ?? []);
        if (s.evmPrices) setEvmPrices(s.evmPrices);
      }
    }
  }, []);

  const loadChain = useCallback(
    async (id: ChainId) => {
      const chain = getChain(id);
      setRefreshing(true);
      setError(null);
      try {
        if (chain.kind === "solana") {
          const a = activeSolAddressRef.current;
          if (a) await fetchBalances(new PublicKey(a));
        } else {
          const a = activeEvmAddressRef.current;
          if (a) await fetchEvm(chain, a);
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
      seedFromSnapshot(id, activeSolAddressRef.current, activeEvmAddressRef.current); // instant paint
      await SecureStore.setItemAsync(ACTIVE_CHAIN_KEY, id).catch(() => {});
      await loadChain(id);
    },
    [loadChain, seedFromSnapshot]
  );

  // Set the active account's public addresses in both state (for the UI) and refs (for loadChain).
  const setActiveAddresses = useCallback((sol: string | null, evm: string | null) => {
    setActiveSolAddress(sol);
    activeSolAddressRef.current = sol;
    setActiveEvmAddress(evm);
    activeEvmAddressRef.current = evm;
  }, []);

  /** Activate a (seed, index): show its assets immediately from the stored PUBLIC address, then
   *  derive the signing keys (the slow BIP39 step) in the background — they're only needed to sign,
   *  never to display. First-ever use of an account derives the address, caches it, then loads. */
  const applyActive = useCallback(
    async (ref: AccountRef) => {
      // Clear the previous account's signing keys + balances right away.
      setKeypair(null);
      keypairRef.current = null;
      setEvmAccount(null);
      evmAccountRef.current = null;
      setSolBalance(null);
      setTokens([]);
      setEvmNative(null);
      setEvmTokens([]);

      // Instant view: known address → render + load balances now, without waiting on derivation.
      const stored = getPubAddress(ref.seedId, ref.index);
      if (stored) {
        setActiveAddresses(stored.sol, stored.evm);
        seedFromSnapshot(activeChainRef.current, stored.sol, stored.evm); // instant paint from disk
        loadChain(activeChainRef.current);
      } else {
        setActiveAddresses(null, null);
      }

      // Derive the signing keys (slow; only needed to sign). The view above already updated.
      const [kp, acct] = await Promise.all([
        keypairFor(ref.seedId, ref.index),
        evmAccountFor(ref.seedId, ref.index),
      ]);
      setKeypair(kp);
      keypairRef.current = kp;
      setEvmAccount(acct);
      evmAccountRef.current = acct;

      // First-ever activation of this account: we only just learned its address — cache + load now.
      if (!stored) {
        const sol = kp?.publicKey.toBase58() ?? null;
        const evm = acct?.address ?? null;
        setActiveAddresses(sol, evm);
        if (sol) putPubAddress(ref.seedId, ref.index, { sol, evm });
        loadChain(activeChainRef.current);
      }
    },
    [loadChain, setActiveAddresses, seedFromSnapshot]
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

  // Auto-lock seed access when the app is backgrounded — but only after a short grace window, so
  // stepping out to copy an address or scan a QR doesn't cost a PIN re-entry (and, because the
  // lock renders as an overlay, doesn't discard a half-filled Send/Swap form either). Anything
  // longer than the grace re-locks on return. Content is hidden in the app switcher separately,
  // by the privacy cover at the root, so the grace window never exposes balances on screen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAtRef.current = Date.now();
      } else if (state === "active") {
        const away = backgroundedAtRef.current ? Date.now() - backgroundedAtRef.current : 0;
        backgroundedAtRef.current = 0;
        if (away > BACKGROUND_GRACE_MS) lockNow();
        lastActivityRef.current = Date.now(); // fresh clock on return
      }
    });
    return () => sub.remove();
  }, [lockNow]);

  // Inactivity auto-lock: while unlocked and foregrounded, re-lock after INACTIVITY_MS of
  // no interaction (checked on a coarse interval; touches reset the clock via bumpActivity).
  useEffect(() => {
    lastActivityRef.current = Date.now(); // stamp once the app is mounted (impure off-render)
    const id = setInterval(() => {
      if (!pinIsEnabled() || !pinIsUnlocked()) return; // no PIN, or already locked
      if (Date.now() - lastActivityRef.current > INACTIVITY_MS) lockNow();
    }, 30_000);
    return () => clearInterval(id);
  }, [lockNow]);

  // Receive notifications: while enabled and foregrounded, refresh balances on a slow cadence so
  // incoming funds are caught "live" (the balance-diff in fetchBalances/fetchEvm fires the alert).
  useEffect(() => {
    const id = setInterval(() => {
      if (isNotificationsEnabled() && AppState.currentState === "active") refresh();
    }, 45_000);
    return () => clearInterval(id);
  }, [refresh]);

  // Phase-2 readiness: when notifications are on, register EVERY account's addresses (both chains)
  // with the push backend so it can alert on any receipt even when the app is closed. No-op until
  // EXPO_PUBLIC_NOTIFY_API is configured (registerForBackendPush guards on it).
  const syncPushRegistration = useCallback(async () => {
    if (!isNotificationsEnabled()) return;
    const v = await loadVault();
    if (!v) return;
    const addrs: string[] = [];
    for (const s of v.seeds) {
      for (const i of s.accounts) {
        const d = await deriveAccount(s.id, i);
        if (d) {
          addrs.push(d.solanaAddress);
          if (d.evmAddress) addrs.push(d.evmAddress);
        }
      }
    }
    registerForBackendPush([...new Set(addrs)]);
  }, []);
  useEffect(() => {
    void syncPushRegistration();
  }, [vault, syncPushRegistration]);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<boolean> => {
      const ok = await vaultUnlockWithPin(pin);
      if (!ok) return false;
      setLocked(false);
      lastActivityRef.current = Date.now(); // don't immediately re-lock after unlocking
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
        setActiveSolAddress(null);
        activeSolAddressRef.current = null;
        setActiveEvmAddress(null);
        activeEvmAddressRef.current = null;
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
    setActiveSolAddress(null);
    activeSolAddressRef.current = null;
    setActiveEvmAddress(null);
    activeEvmAddressRef.current = null;
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
      const sig = await sendAndConfirmGuarded(tx, [kp]);
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

      const sig = await sendAndConfirmGuarded(tx, [kp]);
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
      lastActionRef.current = Date.now(); // suppress a "received" from our own balance change
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

  /**
   * Dry-run a send before the confirm dialog: on EVM this simulates the transaction
   * (catching one that would revert) and returns the network fee to display; on Solana
   * the fee is a fixed ~5000 lamports and the node's preflight simulation at send time
   * already blocks a doomed transfer before any funds move.
   */
  const previewSend = useCallback(
    async (asset: UnifiedAsset, to: string, uiAmount: number): Promise<{ feeNative: number; symbol: string }> => {
      const chain = getChain(activeChainRef.current);
      if (chain.kind === "solana") return { feeNative: 0.000005, symbol: chain.symbol };
      const acct = evmAccountRef.current;
      if (!acct) throw new Error("No EVM wallet on this device.");
      const token =
        asset.kind === "erc20" && asset.address ? { address: asset.address, decimals: asset.decimals } : undefined;
      const { feeWei } = await previewEvmSend(chain, acct.address, to, uiAmount, token);
      return { feeNative: Number(feeWei) / 10 ** chain.decimals, symbol: chain.symbol };
    },
    []
  );

  /** Revoke (set to 0) an ERC-20 allowance on the active EVM chain. Returns the tx hash. */
  const revokeApproval = useCallback(async (token: string, spender: string): Promise<string> => {
    const chain = getChain(activeChainRef.current);
    if (chain.kind !== "evm") throw new Error("Approvals apply to EVM chains only.");
    const acct = evmAccountRef.current;
    if (!acct) throw new Error("No EVM wallet on this device.");
    const hash = await approveEvm(chain, acct.privateKey, acct.address, token, spender, 0n);
    loadChain(chain.id);
    return hash;
  }, [loadChain]);

  const swapExecute = useCallback(
    async (quote: UnifiedQuote, onStatus?: (s: string) => void): Promise<string> => {
      lastActionRef.current = Date.now(); // a swap's output isn't a "received" — suppress it
      const chain = getChain(activeChainRef.current);
      const signer = chain.kind === "solana" ? keypairRef.current : evmAccountRef.current;
      if (!signer) throw new Error("No wallet for this chain.");
      const sig = await executeUnifiedSwap(chain, quote, signer, onStatus);
      // Remember any ERC-20 router approval this swap relied on, so it shows up (and can be
      // revoked) on the Token Approvals screen.
      if (chain.kind === "evm" && chain.evmChainId && quote.evm?.spender && quote.input.mint) {
        recordApproval(chain.evmChainId, quote.input.mint, quote.evm.spender).catch(() => {});
      }
      loadChain(chain.id);
      return sig;
    },
    [loadChain]
  );

  const value = useMemo<WalletState>(() => {
    const solPrice = prices[WSOL_MINT]?.usdPrice ?? null;
    const solChange24h = prices[WSOL_MINT]?.priceChange24h ?? null;
    const priceOf = (mint: string) => prices[mint]?.usdPrice;
    // Public addresses come from the stored-address state (set instantly on switch), NOT the
    // keypair — so assets show before the signing key finishes deriving.
    const solanaAddress = activeSolAddress;
    const evmAddress = activeEvmAddress;
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
      pinLockoutMs: vaultPinLockoutMs,
      bumpActivity,
      enablePin,
      disablePin,
      changePin,
      // Offer PIN setup once (after wallet creation, or to an older wallet without one).
      // Strongly recommended but skippable — "Skip for now" sets pinPrompted so we don't
      // nag, and a PIN can still be added later in Settings.
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
      previewSend,
      swapExecute,
      revokeApproval,
      syncPushRegistration,
    };
  }, [
    initializing,
    vault,
    pinEnabled,
    pinPrompted,
    locked,
    unlockWithPin,
    bumpActivity,
    enablePin,
    disablePin,
    changePin,
    skipPinPrompt,
    keypair,
    activeSolAddress,
    activeEvmAddress,
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
    previewSend,
    swapExecute,
    revokeApproval,
    syncPushRegistration,
  ]);

  const status = useMemo<WalletStatus>(() => ({ refreshing, busy, error }), [refreshing, busy, error]);

  return (
    <WalletContext.Provider value={value}>
      <WalletStatusContext.Provider value={status}>{children}</WalletStatusContext.Provider>
    </WalletContext.Provider>
  );
}

export function useWalletStatus(): WalletStatus {
  const ctx = useContext(WalletStatusContext);
  if (!ctx) throw new Error("useWalletStatus must be used within WalletProvider");
  return ctx;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
