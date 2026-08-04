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
import { fetchPrices, cachedPrices, fetchDexPrices, WSOL_MINT, type PriceInfo } from "../solana/prices";
import { fetchTokenMetas, cachedTokenMetas } from "../solana/tokens";
import { CHAINS, DEFAULT_CHAIN, getChain, assertNever, type ChainDef, type ChainId } from "../chains/registry";
import { getBalance as getEvmBalance } from "../evm/rpc";
import { fetchEvmTokenBalances, type EvmTokenBalance } from "../evm/tokens";
import { fetchEvmNativePrices, stableUsd, erc20Usd } from "../evm/prices";
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
import { clearEntitlements } from "../access/entitlement";
import { clearSessions } from "../access/siws";
import { panicRotate, purgeOwner } from "../property/keyCopy/sweep";
import { clearReauthGrace } from "../security/reauth";
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
  /** Chain-LOCAL id: "native", an SPL mint, or an ERC-20 address. Unique within a chain, not
   *  across them — pair it with `chainId` for a list key. It's what Send/TokenDetail navigate by. */
  key: string;
  /** Which chain this is held on. Set on every asset, including the active-chain list. */
  chainId: ChainId;
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
  /** Non-native assets held on the active chain (Send, Swap, TokenDetail work from this). */
  assets: UnifiedAsset[];
  /** Everything held on EVERY chain, natives included, richest first — the Wallet tab's list. */
  allAssets: UnifiedAsset[];
  /** Held assets we couldn't put a price on, so `totalUsd` can be shown as a lower bound. */
  unpricedCount: number;
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
  // Keyed BY CHAIN, not just the active one. The wallet list is cross-chain now, so every EVM
  // chain's balances have to be held at once — a single slot could only ever describe whichever
  // chain you last looked at.
  const [evmNative, setEvmNative] = useState<Partial<Record<ChainId, number | null>>>({});
  const [evmTokens, setEvmTokens] = useState<Partial<Record<ChainId, EvmTokenBalance[]>>>({});
  // Native prices are symbol-keyed and global (ETH is ETH on either chain), so one map serves all.
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
  // time of the user's last SEND (to suppress a "received" caused by their own outgoing move).
  // Swaps deliberately do not suppress — see swapExecute.
  /**
   * Last-seen balances, keyed by `${chainId}:${address}` — one entry PER CHAIN, not one for the
   * whole wallet.
   *
   * It used to be a single slot. That was survivable while a refresh only ever loaded the active
   * chain, but the cross-chain Wallet list made every refresh call `detectReceipts` three times
   * (Solana, then both EVM chains) and each call overwrote the one slot. The `prev.addr === addr`
   * guard then never matched two calls in a row, so Solana receipts silently stopped firing
   * altogether. Scoping it also stops Ethereum and BSC — which share one address and both label
   * their native asset "native" — from diffing ETH against BNB and inventing a receipt.
   */
  const balanceBaselineRef = useRef<Map<string, Record<string, number>>>(new Map());
  const lastActionRef = useRef(0);
  keypairRef.current = keypair;
  evmAccountRef.current = evmAccount;
  activeChainRef.current = activeChainId;

  // Compare the freshly-loaded balances for `addr` against the last snapshot; any positive delta
  // fires a local "Received X" notification (only when enabled, not right after the user's own
  // action, and never on the first load of an address). Then re-snapshots.
  const detectReceipts = useCallback(
    (
      /** Which chain these balances are from — scopes the baseline. */
      chainId: ChainId,
      addr: string,
      entries: { key: string; symbol: string; amount: number; priceUsd?: number | null }[]
    ) => {
      const scope = `${chainId}:${addr}`;
      const prev = balanceBaselineRef.current.get(scope);
      const amounts: Record<string, number> = {};
      for (const e of entries) amounts[e.key] = e.amount;
      const quiet = Date.now() - lastActionRef.current < 12_000;
      // No baseline for this scope yet = first sight of this chain+account. Record it and stay
      // silent, or opening the app would announce everything you already own.
      if (prev && isNotificationsEnabled() && !quiet) {
        for (const e of entries) {
          const delta = e.amount - (prev[e.key] ?? 0);
          if (delta > 1e-9) {
            notifyReceived({ symbol: e.symbol, amount: delta, usd: e.priceUsd != null ? e.priceUsd * delta : null });
          }
        }
      }
      balanceBaselineRef.current.set(scope, amounts);
    },
    []
  );

  // Drop all in-memory key material and require the PIN again. Used by both the
  // background lock and the inactivity timer.
  const lockNow = useCallback(() => {
    if (!pinIsEnabled()) return;
    // Locking means the member stepped away. A grant they could still open, a confirmation they gave
    // five minutes ago, or a platform session token they could still spend, must not survive that
    // decision.
    void clearEntitlements();
    clearReauthGrace();
    clearSessions();
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
        // DAS can come back with no pricing at all; fall back to the recent-price cache rather
        // than publishing an empty map, which would render every holding as $0.00.
        const prices = Object.keys(das.prices).length
          ? { ...das.prices }
          : cachedPrices([WSOL_MINT, ...das.tokens.map((t) => t.mint)]);
        if (prices[WSOL_MINT] && solChange != null) prices[WSOL_MINT] = { ...prices[WSOL_MINT], priceChange24h: solChange };
        setSolBalance(solUi);
        setTokens(das.tokens);
        setPrices(prices);
        saveWalletSnapshot(`sol:${CLUSTER}:${pubkey.toBase58()}`, { solBalance: solUi, tokens: das.tokens, prices });
        // DAS only prices what Helius indexes, so smaller holdings come back with no value at all.
        // Fill those in behind the fast paint rather than blocking it — the point of this path is
        // that balances appear immediately.
        const unpriced = das.tokens.filter((t) => t.amount > 0 && !prices[t.mint]).map((t) => t.mint);
        if (unpriced.length) {
          void fetchDexPrices(unpriced).then((extra) => {
            if (!Object.keys(extra).length) return;
            const merged = { ...prices, ...extra };
            setPrices(merged);
            saveWalletSnapshot(`sol:${CLUSTER}:${pubkey.toBase58()}`, {
              solBalance: solUi,
              tokens: das.tokens,
              prices: merged,
            });
          });
        }
        detectReceipts("solana", pubkey.toBase58(), [
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

    const mints = spl.map((t) => t.mint);
    // Attach what we already know about each mint before publishing the list. Publishing the raw
    // accounts first meant the snapshot's named, logo'd rows were briefly replaced by bare mint
    // addresses on every refresh — the cache was there, we just weren't reading it.
    const warmMetas = cachedTokenMetas(mints);
    const seeded = Object.keys(warmMetas).length ? spl.map((t) => ({ ...t, ...warmMetas[t.mint] })) : spl;
    setTokens(seeded);
    // Same for prices: fill from the recent-price cache so USD values are on screen before the
    // price API answers, rather than every holding reading $0.00 in the meantime.
    setPrices((prev) => ({ ...cachedPrices([WSOL_MINT, ...mints]), ...prev }));

    const [priceRes, metas] = await Promise.all([
      fetchPrices([WSOL_MINT, ...mints]).catch(() => ({}) as Record<string, PriceInfo>),
      fetchTokenMetas(mints).catch(() => ({}) as Record<string, never>),
    ]);
    // A failed (or rate-limited) price call returns {} — publishing that would wipe the values
    // we're already showing and turn a funded wallet into $0.00. Keep the last-known instead.
    const nextPrices = Object.keys(priceRes).length ? priceRes : cachedPrices([WSOL_MINT, ...mints]);
    setPrices(nextPrices);
    const merged = metas && Object.keys(metas).length ? seeded.map((t) => ({ ...t, ...metas[t.mint] })) : seeded;
    if (merged !== seeded) setTokens(merged);
    // Persist this snapshot so the next cold open paints instantly (network-scoped: mainnet ≠ devnet).
    saveWalletSnapshot(`sol:${CLUSTER}:${pubkey.toBase58()}`, {
      solBalance: lamports / LAMPORTS_PER_SOL,
      tokens: merged,
      prices: nextPrices,
    });

    detectReceipts("solana", pubkey.toBase58(), [
      { key: "native:SOL", symbol: "SOL", amount: lamports / LAMPORTS_PER_SOL, priceUsd: nextPrices[WSOL_MINT]?.usdPrice ?? null },
      ...spl.map((t) => ({
        key: t.mint,
        symbol: metas[t.mint]?.symbol ?? warmMetas[t.mint]?.symbol ?? t.mint.slice(0, 4),
        amount: t.amount,
        priceUsd: nextPrices[t.mint]?.usdPrice ?? null,
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
    setEvmNative((prev) => ({ ...prev, [chain.id]: nativeAmt }));
    setEvmTokens((prev) => ({ ...prev, [chain.id]: toks }));
    setEvmPrices((prev) => ({ ...prev, ...evPrices }));
    saveWalletSnapshot(`${chain.id}:${address}`, { evmNative: nativeAmt, evmTokens: toks, evmPrices: evPrices });

    detectReceipts(chain.id, address, [
      { key: "native", symbol: chain.symbol, amount: nativeAmt, priceUsd: evPrices[chain.symbol] ?? null },
      ...toks
        .filter((tb) => tb.balance > 0)
        .map((tb) => ({ key: tb.token.address, symbol: tb.token.symbol, amount: tb.balance, priceUsd: stableUsd(tb.token.symbol) })),
    ]);
  }, [detectReceipts]);

  /** Load balances for a specific chain (used by refresh + chain switch). */
  // Paint the last-known balances/tokens/prices from disk immediately (before the RPC round-trip),
  // so switching accounts/chains and cold opens feel instant. The live load then refreshes them.
  // Seeds EVERY chain, not just the active one: the wallet list shows them all, so a cold open
  // that painted only one chain would still look half-empty for a beat.
  const seedFromSnapshot = useCallback((sol: string | null, evm: string | null) => {
    if (sol) {
      const s = getWalletSnapshot(`sol:${CLUSTER}:${sol}`);
      if (s) {
        setSolBalance(s.solBalance ?? null);
        setTokens(s.tokens ?? []);
        if (s.prices) setPrices(s.prices);
      }
    }
    if (evm) {
      for (const chain of CHAINS.filter((c) => c.kind === "evm")) {
        const s = getWalletSnapshot(`${chain.id}:${evm}`);
        if (!s) continue;
        setEvmNative((prev) => ({ ...prev, [chain.id]: s.evmNative ?? null }));
        setEvmTokens((prev) => ({ ...prev, [chain.id]: s.evmTokens ?? [] }));
        if (s.evmPrices) setEvmPrices((prev) => ({ ...prev, ...s.evmPrices }));
      }
    }
  }, []);

  const loadChain = useCallback(
    async (id: ChainId) => {
      const chain = getChain(id);
      setRefreshing(true);
      setError(null);
      try {
        switch (chain.kind) {
          case "solana": {
            const a = activeSolAddressRef.current;
            if (a) await fetchBalances(new PublicKey(a));
            break;
          }
          case "evm": {
            const a = activeEvmAddressRef.current;
            if (a) await fetchEvm(chain, a);
            break;
          }
          default:
            assertNever(chain.kind, "chain kind in loadChain");
        }
      } catch (e) {
        setError(humanizeError(e, { action: "load" }));
      } finally {
        setRefreshing(false);
      }
    },
    [fetchBalances, fetchEvm]
  );

  /**
   * Load every chain. The wallet list is cross-chain, so a refresh that only touched the active
   * chain would leave the other two showing whatever the disk snapshot last knew.
   *
   * Solana goes first and alone — it's the heaviest and shares a throttle with the rest of the
   * app. The EVM chains then go together: different hosts, so they don't contend.
   */
  const loadAll = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const sol = activeSolAddressRef.current;
      if (sol) await fetchBalances(new PublicKey(sol));
    } catch (e) {
      setError(humanizeError(e, { action: "load" }));
    }
    try {
      const evm = activeEvmAddressRef.current;
      if (evm) {
        // Each chain fails on its own — one dead RPC shouldn't cost the other chain's balances.
        await Promise.all(
          CHAINS.filter((c) => c.kind === "evm").map((c) => fetchEvm(c, evm).catch(() => {}))
        );
      }
    } finally {
      setRefreshing(false);
    }
  }, [fetchBalances, fetchEvm]);

  const refresh = useCallback(async () => {
    await loadAll();
  }, [loadAll]);

  /**
   * Reload balances repeatedly after a trade until the chain actually reflects it.
   *
   * A single read straight after confirmation is a coin flip: we confirm at "confirmed"
   * commitment and then immediately ask for balances, and the node frequently still answers with
   * pre-swap state. When that happens the incoming side isn't a delta yet, so no "Received" alert
   * fires — and the change only surfaces on the 45-second poll, by which time the user has moved
   * on and reasonably concludes the notification is broken. That's the whole "sometimes it
   * notifies, sometimes it doesn't" complaint.
   *
   * Retrying is safe precisely because `detectReceipts` advances its baseline once it reports a
   * delta: whichever attempt first sees the new balance fires exactly one notification, and the
   * rest are no-ops. Cheap insurance rather than a guess about propagation timing.
   */
  const settleAfterTrade = useCallback(
    (id: ChainId) => {
      for (const delay of [0, 3000, 9000]) {
        setTimeout(() => void loadChain(id), delay);
      }
    },
    [loadChain]
  );

  const setActiveChain = useCallback(
    async (id: ChainId) => {
      activeChainRef.current = id;
      setActiveChainId(id);
      seedFromSnapshot(activeSolAddressRef.current, activeEvmAddressRef.current); // instant paint
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
      // Whatever the previous account was allowed to open, this one is not — until it proves so
      // itself. A cached vault grant is a bearer link, a recent biometric confirmation was given by
      // someone acting as a different member, and a platform token names a wallet that is no longer
      // the one in use.
      void clearEntitlements();
      clearReauthGrace();
      clearSessions();
      // Clear the previous account's signing keys + balances right away.
      setKeypair(null);
      keypairRef.current = null;
      setEvmAccount(null);
      evmAccountRef.current = null;
      setSolBalance(null);
      setTokens([]);
      setEvmNative({});
      setEvmTokens({});

      // Instant view: known address → render + load balances now, without waiting on derivation.
      const stored = getPubAddress(ref.seedId, ref.index);
      if (stored) {
        setActiveAddresses(stored.sol, stored.evm);
        seedFromSnapshot(stored.sol, stored.evm); // instant paint from disk, every chain
        loadAll();
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
        loadAll();
      }
    },
    [loadAll, setActiveAddresses, seedFromSnapshot]
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
      // Addresses read BEFORE the seed goes, or there is nothing left to derive them from and the
      // content stays on disk with no entry pointing at it.
      const indices = vault?.seeds.find((sd) => sd.id === seedId)?.accounts ?? [];
      const going = indices
        .map((i) => getPubAddress(seedId, i)?.sol)
        .filter((a): a is string => !!a);
      const v = await removeSeed(seedId);
      for (const addr of going) void purgeOwner(addr);
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
        setEvmNative({});
        setEvmTokens({});
      } else {
        syncBackupFlag(v);
        await applyActive(v.active);
      }
    },
    [applyActive, syncBackupFlag, vault?.seeds]
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
    await clearEntitlements();
    clearReauthGrace();
    // A reset promises everything is gone. A live bearer token for the wallet just erased would
    // otherwise outlive it, in memory, until the process happened to die.
    clearSessions();
    // Rotating the key is the only deletion guaranteed to have taken effect even if every unlink
    // failed, which is what a reset has to be able to promise.
    await panicRotate();
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
    setEvmNative({});
    setEvmTokens({});
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
      // Same settling reload as a swap: one read here usually predates the node catching up,
      // which is what leaves a just-sent balance looking unchanged.
      settleAfterTrade("solana");
      return sig;
    },
    [settleAfterTrade]
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
      // Same settling reload as a swap: one read here usually predates the node catching up,
      // which is what leaves a just-sent balance looking unchanged.
      settleAfterTrade("solana");
      return sig;
    },
    [settleAfterTrade]
  );

  const sendNative = useCallback(
    async (to: string, uiAmount: number): Promise<string> => {
      const chain = getChain(activeChainRef.current);
      // Exhaustive on purpose: this signs and moves real funds, so an unhandled chain family has
      // to stop here rather than fall into the EVM signer with an undefined chain id.
      switch (chain.kind) {
        case "solana":
          return send(to, uiAmount);
        case "evm": {
          const acct = evmAccountRef.current;
          if (!acct) throw new Error("No EVM wallet on this device.");
          const sig = await sendNativeEvm(chain, acct.privateKey, acct.address, to, uiAmount);
          settleAfterTrade(chain.id);
          return sig;
        }
        default:
          return assertNever(chain.kind, "chain kind in sendNative");
      }
    },
    [send, settleAfterTrade]
  );

  const sendAsset = useCallback(
    async (asset: UnifiedAsset, to: string, uiAmount: number): Promise<string> => {
      lastActionRef.current = Date.now(); // suppress a "received" from our own balance change
      const chain = getChain(activeChainRef.current);
      // Dispatches on the ASSET's kind, not the chain's. The old form ended in a bare `// erc20`
      // fallthrough, so any future asset type would have been handed to the ERC-20 transfer path.
      switch (asset.kind) {
        case "native":
          return sendNative(to, uiAmount);
        case "spl":
          return sendToken(asset.mint!, to, uiAmount, asset.decimals);
        case "erc20": {
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
          settleAfterTrade(chain.id);
          return sig;
        }
        default:
          return assertNever(asset.kind, "asset kind in sendAsset");
      }
    },
    [sendNative, sendToken, settleAfterTrade]
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
      switch (chain.kind) {
        case "solana":
          return { feeNative: 0.000005, symbol: chain.symbol };
        case "evm": {
          const acct = evmAccountRef.current;
          if (!acct) throw new Error("No EVM wallet on this device.");
          const token =
            asset.kind === "erc20" && asset.address ? { address: asset.address, decimals: asset.decimals } : undefined;
          const { feeWei } = await previewEvmSend(chain, acct.address, to, uiAmount, token);
          return { feeNative: Number(feeWei) / 10 ** chain.decimals, symbol: chain.symbol };
        }
        default:
          return assertNever(chain.kind, "chain kind in previewSend");
      }
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
      // Deliberately NOT stamping lastActionRef here. A swap's output used to be suppressed as
      // "your own move", but landing the other side of a trade is exactly what people want
      // confirmed — and the suppression was only ever a 12-second race anyway, so the alert
      // arrived or didn't depending on when the balance poll happened to run. Sends still
      // suppress (that's an outflow you initiated); swap receipts now always notify.
      const chain = getChain(activeChainRef.current);
      // Picking the wrong signer here would hand one chain family's private key to another's
      // signing code, so this is exhaustive rather than a ternary with an implied EVM default.
      const signer = ((): Keypair | EvmAccount | null => {
        switch (chain.kind) {
          case "solana":
            return keypairRef.current;
          case "evm":
            return evmAccountRef.current;
          default:
            return assertNever(chain.kind, "chain kind in swapExecute");
        }
      })();
      if (!signer) throw new Error("No wallet for this chain.");
      const sig = await executeUnifiedSwap(chain, quote, signer, onStatus);
      // Remember any ERC-20 router approval this swap relied on, so it shows up (and can be
      // revoked) on the Token Approvals screen.
      if (chain.kind === "evm" && chain.evmChainId && quote.evm?.spender && quote.input.mint) {
        recordApproval(chain.evmChainId, quote.input.mint, quote.evm.spender).catch(() => {});
      }
      // The ONLY refresh after a swap. SwapScreen used to fire its own as well, so two reads raced
      // each other against a node that usually hadn't caught up yet — and neither saw a delta.
      settleAfterTrade(chain.id);
      return sig;
    },
    [settleAfterTrade]
  );

  const value = useMemo<WalletState>(() => {
    const solPrice = prices[WSOL_MINT]?.usdPrice ?? null;
    const solChange24h = prices[WSOL_MINT]?.priceChange24h ?? null;
    const priceOf = (mint: string) => prices[mint]?.usdPrice;

    // ---- Per-chain asset builders, so the active-chain lists and the cross-chain list can't
    // ---- drift apart: both are built from these.
    const solanaAssets = (): UnifiedAsset[] =>
      tokens.map((t) => {
        const p = priceOf(t.mint);
        return {
          key: t.mint,
          chainId: "solana" as ChainId,
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

    const evmAssetsFor = (chain: ChainDef): UnifiedAsset[] =>
      (evmTokens[chain.id] ?? [])
        .filter((tb) => tb.balance > 0)
        .map((tb) => ({
          key: tb.token.address,
          chainId: chain.id,
          kind: "erc20" as const,
          symbol: tb.token.symbol,
          name: tb.token.name,
          decimals: tb.token.decimals,
          balance: tb.balance,
          usd: erc20Usd(tb.token.symbol, tb.balance),
          logoURI: tb.token.logoURI,
          address: tb.token.address,
        }));

    const nativeFor = (chain: ChainDef): NativeBalance => {
      switch (chain.kind) {
        case "solana":
          return {
            symbol: "SOL",
            balance: solBalance,
            usd: solBalance != null && solPrice != null ? solBalance * solPrice : null,
          };
        case "evm": {
          const amt = evmNative[chain.id] ?? null;
          const p = evmPrices[chain.symbol] ?? null;
          return { symbol: chain.symbol, balance: amt, usd: amt != null && p != null ? amt * p : null };
        }
        default:
          return assertNever(chain.kind, "chain kind in nativeFor");
      }
    };

    /** Non-native assets held on a given chain. */
    const assetsFor = (chain: ChainDef): UnifiedAsset[] => {
      switch (chain.kind) {
        case "solana":
          return solanaAssets();
        case "evm":
          return evmAssetsFor(chain);
        default:
          return assertNever(chain.kind, "chain kind in assetsFor");
      }
    };
    // Public addresses come from the stored-address state (set instantly on switch), NOT the
    // keypair — so assets show before the signing key finishes deriving.
    const solanaAddress = activeSolAddress;
    const evmAddress = activeEvmAddress;
    const activeChain = getChain(activeChainId);

    let activeAddress: string | null;

    // `activeAddress` feeds the Receive QR, Send validation and Activity — an `else` that quietly
    // meant "EVM" would show one chain family's address while the app believed it was on another.
    switch (activeChain.kind) {
      case "solana":
        activeAddress = solanaAddress;
        break;
      case "evm":
        activeAddress = evmAddress;
        break;
      default:
        assertNever(activeChain.kind, "chain kind for activeAddress");
    }
    const native = nativeFor(activeChain);
    const assets = assetsFor(activeChain);

    // ---- The cross-chain list the Wallet tab shows. Natives are rows here (SOL, ETH, BNB)
    // ---- because the hero above them is a total, not one chain's balance.
    const allAssets: UnifiedAsset[] = [];
    for (const chain of CHAINS) {
      const n = nativeFor(chain);
      if (n.balance != null && n.balance > 0) {
        allAssets.push({
          key: "native",
          chainId: chain.id,
          kind: "native",
          symbol: chain.symbol,
          name: chain.name,
          decimals: chain.decimals,
          balance: n.balance,
          usd: n.usd,
          logoURI: chain.logoURI,
        });
      }
      allAssets.push(...assetsFor(chain));
    }
    // Most valuable first, with the unpriced (which sort as 0) after everything we can rank.
    allAssets.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));

    // `null` means "we don't know", and the UI must render it as such — never as $0.00. Two
    // ways not to know: balances haven't arrived, or they have but nothing could be priced yet
    // (the window right after a cold open, which is what made the wallet flash $0.00).
    //
    // A PARTIAL sum is still a real figure — plenty of small tokens genuinely have no market
    // price and never will — so we only give up when nothing at all is priced. Zero-balance
    // holdings are ignored either way: they contribute nothing whether or not we know the price.
    //
    // This now spans EVERY chain, because the Wallet tab's hero is a whole-wallet total. Showing
    // one chain's balance as "Balance" was its own quiet misstatement for anyone holding on two.
    const held = allAssets.filter((a) => a.balance > 0);
    const anythingPriced = held.some((a) => a.usd != null);
    // "Loaded" means at least one chain answered — Solana's balance is the reliable signal, since
    // an EVM chain the user has never touched legitimately holds nothing.
    const anyLoaded = solBalance != null || CHAINS.some((c) => evmNative[c.id] != null);
    const totalUsd =
      !anyLoaded || (held.length > 0 && !anythingPriced)
        ? null
        : held.reduce((s, a) => s + (a.usd ?? 0), 0);
    /** How many held assets we couldn't price — lets the UI mark the total as a lower bound. */
    const unpricedCount = held.filter((a) => a.usd == null).length;

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
      allAssets,
      unpricedCount,
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
