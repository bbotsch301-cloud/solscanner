/**
 * Curated EVM swap tokens per chain + on-chain resolution of a pasted contract
 * address (mirror of Solana's resolveMint). Used by the chain-aware token picker.
 */
import type { ChainDef, ChainId } from "../chains/registry";
import { ethCall } from "./rpc";
import { isEvmAddress, toChecksumAddress } from "../wallet/evm";
import { EVM_NATIVE, type SwapToken } from "../swap/types";
import { nativeLogo, evmLogo } from "../config/logos";

const NATIVE = (symbol: string, name: string, logoURI: string): SwapToken => ({
  mint: EVM_NATIVE,
  symbol,
  name,
  decimals: 18,
  verified: true,
  logoURI,
});

const eth = (address: string) => evmLogo("ethereum", address);
const bsc = (address: string) => evmLogo("smartchain", address);

const ETHEREUM: SwapToken[] = [
  NATIVE("ETH", "Ethereum", nativeLogo.ethereum),
  { mint: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", name: "Wrapped Ether", decimals: 18, verified: true, logoURI: eth("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2") },
  { mint: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6, verified: true, logoURI: eth("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48") },
  { mint: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD", decimals: 6, verified: true, logoURI: eth("0xdAC17F958D2ee523a2206206994597C13D831ec7") },
  { mint: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", name: "Dai Stablecoin", decimals: 18, verified: true, logoURI: eth("0x6B175474E89094C44Da98b954EedeAC495271d0F") },
  { mint: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", symbol: "WBTC", name: "Wrapped BTC", decimals: 8, verified: true, logoURI: eth("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599") },
];

const BSC: SwapToken[] = [
  NATIVE("BNB", "BNB", nativeLogo.bsc),
  { mint: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "WBNB", name: "Wrapped BNB", decimals: 18, verified: true, logoURI: bsc("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c") },
  { mint: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", name: "Tether USD", decimals: 18, verified: true, logoURI: bsc("0x55d398326f99059fF775485246999027B3197955") },
  { mint: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", name: "USD Coin", decimals: 18, verified: true, logoURI: bsc("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d") },
  { mint: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", symbol: "ETH", name: "Ethereum Token", decimals: 18, verified: true, logoURI: bsc("0x2170Ed0880ac9A755fd29B2688956BD959F933F8") },
  { mint: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", symbol: "BTCB", name: "Bitcoin BEP2", decimals: 18, verified: true, logoURI: bsc("0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c") },
];

export function evmSwapTokens(id: ChainId): SwapToken[] {
  return id === "ethereum" ? ETHEREUM : id === "bsc" ? BSC : [];
}

/** Decode an ABI-encoded string result (dynamic string or legacy bytes32). */
function decodeAbiString(hex: string): string {
  const raw = hex.replace(/^0x/, "");
  if (raw.length >= 128) {
    // dynamic: [offset(32)][length(32)][data]
    const len = parseInt(raw.slice(64, 128), 16);
    if (len > 0 && len <= 128) {
      const bytes = raw.slice(128, 128 + len * 2);
      try {
        return new TextDecoder().decode(Uint8Array.from(bytes.match(/../g)!.map((b) => parseInt(b, 16)))).replace(/\0+$/, "");
      } catch {
        /* fall through */
      }
    }
  }
  // legacy bytes32
  try {
    const bytes = raw.slice(0, 64);
    return new TextDecoder().decode(Uint8Array.from(bytes.match(/../g)!.map((b) => parseInt(b, 16)))).replace(/\0+$/, "");
  } catch {
    return "";
  }
}

/** Resolve a pasted ERC-20 contract to a SwapToken via decimals()/symbol()/name(). */
export async function resolveEvmToken(chain: ChainDef, address: string): Promise<SwapToken | null> {
  if (!isEvmAddress(address)) return null;
  const to = toChecksumAddress(address);
  try {
    const decHex = await ethCall(chain, to, "0x313ce567"); // decimals()
    const decimals = Number(BigInt(decHex || "0x0"));
    if (!(decimals >= 0 && decimals <= 36)) return null;
    const [symHex, nameHex] = await Promise.all([
      ethCall(chain, to, "0x95d89b41").catch(() => ""), // symbol()
      ethCall(chain, to, "0x06fdde03").catch(() => ""), // name()
    ]);
    const symbol = decodeAbiString(symHex) || `${to.slice(0, 6)}…`;
    return { mint: to, symbol, name: decodeAbiString(nameHex) || symbol, decimals, verified: false };
  } catch {
    return null;
  }
}
