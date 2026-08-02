/**
 * Featured tokens — the curated coins surfaced in the swap picker, per chain.
 *
 * DELIBERATELY ADDRESSES ONLY. The picker renders "Popular" rows straight from static objects, so
 * a `decimals` typed in by hand is a `decimals` the swap math trusts — and getting it wrong
 * misprices a trade by a factor of a thousand or a billion. Everything except the address is read
 * from the chain instead (see swap/featuredTokens.ts), which also means the symbol and name on
 * screen are the contract's own, not a transcription of a list.
 *
 * `label` is only a placeholder for logs and for the brief moment before resolution lands; the
 * resolved on-chain name always wins.
 *
 * CHAIN MEMBERSHIP: most of the supplied EVM addresses didn't say whether they were Ethereum or
 * BSC, so the ambiguous ones are listed under BOTH and resolution decides — a contract that isn't
 * there doesn't answer `decimals()`, so it simply never appears on that chain. Once the app has
 * shown which chain each one landed on, these lists can be tightened by hand.
 */
import type { ChainId } from "../chains/registry";
import { WSOL_MINT } from "../solana/prices";
import { XGO_MINT } from "../solana/token2022";
import { EVM_NATIVE } from "../swap/types";

export interface FeaturedToken {
  /** SPL mint (Solana) or ERC-20 contract address (EVM). */
  address: string;
  /** Placeholder name, used until the chain answers. The resolved on-chain name overrides it. */
  label: string;
}

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * EVM entries whose chain wasn't specified. Listed on Ethereum AND BSC; whichever chain the
 * contract doesn't exist on drops it during resolution.
 */
const AMBIGUOUS_EVM: FeaturedToken[] = [
  { address: "0x1Ee8a2f28586e542af677eB15Fd00430f98d8fd8", label: "BTC Dragon" },
  { address: "0x870e184b7fb15a902dc9a93beb03c15a65977918", label: "Rhino" },
  // Supplied as "Layerx (LX) BEPRO" — two names on one line. This address is BEPRO Network; the
  // resolved on-chain name will settle it either way.
  { address: "0xcf3c8be2e2c42331da80ef210e9b1b307c03d36a", label: "BEPRO" },
  { address: "0x6C46422A0f7dbbAD9BEC3BbBC1189bfAf9794B05", label: "Little Rabbit" },
  { address: "0x57Bfe2aF99AeB7a3de3bc0c42c22353742bfD20D", label: "Water Rabbit" },
  { address: "0x4670f3a2A8D35021257cda028c7ae3Cb854C7CaF", label: "Sanctuary Token" },
  { address: "0x72d97aD5694e0ff5a9e33bd83BA281Bb8cFa0b38", label: "White Tiger Moon" },
  { address: "0x95AF4aF910c28E8EcE4512BFE46F1F33687424ce", label: "Manyu" },
  { address: "0xE53D384Cf33294C1882227ae4f90D64cF2a5dB70", label: "Ocicat" },
  { address: "0xbD7909318b9Ca4ff140B840F69bB310a785d1095", label: "Giant Token" },
  { address: "0x485d37ca1c8d4e0b5b11b87604816a4843c079ed", label: "DigiMon Rabbit" },
  { address: "0x6Ec90334d89dBdc89E08A133271be3d104128Edb", label: "WikiCat" },
  { address: "0xFeD56F9Cd29F44e7C61c396DAc95cb3ed33d3546", label: "PCat Phenomenal Cat" },
  { address: "0x7f792db54B0e580Cdc755178443f0430Cf799aCa", label: "Volt Inu" },
];

export const FEATURED_TOKENS: Record<ChainId, FeaturedToken[]> = {
  solana: [
    { address: "5GgY77Uti2d6VSAT2WW27d7UA2yBC7PMm2iepjmtJuwv", label: "Hummingbird Bitcoin" },
    { address: "7WjZHjxzJurwKf6dgQdPYAYwDzXzYGtR7r3NbX6Bpump", label: "RAVEN (GOSHA)" },
    { address: "8S7sAJPhzUegLxnwq2ymK7f6AE4Ty9tuPChMRKfgpump", label: "The White Dove" },
    { address: "4r4Z6oodFM5VnVgdC8bfVj75UrrFv2vb2ShcuPjRpump", label: "Giraffe Coin" },
    { address: "6Tw9kzL3B4AFDyJNg7NULHpUozDrgdukU4UcVMwjpump", label: "Hungry Hippo" },
    { address: "4pTN87RQi7Bt7yzU3CFk6FDiD8BYbH2dFYPwsAfjBAGS", label: "Lulu the Ostrich" },
    { address: "6XvDynQVYmQD58TxnhZnjQm5oJGzhLxq6MAMDsGUzYhs", label: "Sheep" },
    { address: "5Jng6jkLKU1o8BNrCzTEMXMFvPjNJZTpdWR3Hq4RHJb6", label: "Mikawa Inu" },
    { address: "23Y1bUqVcJsvWH9WpVJfj1xDozq2GdKbEhRSdGhDpump", label: "Solomon" },
    { address: "EtUUCeNTxXZZEQMbwVJCh55aL48MovCkRdpXcbUxw6US", label: "Black Panther" },
    { address: "AyPNhxMEh5n44T8GhFCCzQzUXh2tTRagpQduVYeEpump", label: "PupFun" },
    { address: "DAYiaV6rooemiBBroroWwh44zykYoozsTirV8AYZpump", label: "Happy Elephant" },
    { address: "2JVZ7LF7dPj8EfmKcGe6CPjXZRLRZqe3wE66jR4Bpump", label: "Hope" },
    { address: "H4PDo8ngWwC4quPTRWfTr2HorUQ2Ep4G3JVeJHMfkZAT", label: "PEIPEI Solana" },
    { address: "hqYtLoxviwGENvogcJ5324YTbYqW5H9LHtmQu5Jbonk", label: "BONKAI" },
  ],
  ethereum: [
    // Named for Ethereum in the source list.
    { address: "0x995c0e3b9af4da89fc76c5c0784e97c7a36eec06", label: "ETH PIGE" },
    { address: "0x66641FCFCa7D919629D5e4A72D9F13787fcAF304", label: "FIFA" },
    ...AMBIGUOUS_EVM,
  ],
  bsc: [
    // Named for BNB Chain in the source list.
    { address: "0x64da67A12a46f1DDF337393e2dA12eD0A507Ad3D", label: "BNB Frog" },
    { address: "0xAC68931B666E086E9de380CFDb0Fb5704a35dc2D", label: "BNB Tiger" },
    { address: "0x71d421b6dE07ceFa2733D044f92A0306308dE8b8", label: "BNB Lion" },
    { address: "0x5a04565ee1c90c84061aD357AE9E2f1c32D57dc6", label: "Baby BnbTiger" },
    ...AMBIGUOUS_EVM,
  ],
};

/**
 * Which of a chain's built-in swap tokens stay in the "Popular" row above the featured list.
 *
 * Solana keeps only the three that matter as swap destinations — SOL and USDC are what people
 * trade into, and XGO is the project's own token; USDT/JUP/BONK are still reachable by search. The
 * EVM chains keep their full built-in set (native, wrapped, stables), which is already short.
 *
 * Note this filters the PICKER only. `SWAP_TOKENS` itself is untouched, because `SWAP_TOKENS[0]`
 * is the swap screen's default "from" token.
 */
export const POPULAR_ANCHORS: Record<ChainId, string[] | null> = {
  solana: [WSOL_MINT, USDC_MINT, XGO_MINT],
  ethereum: null, // null = keep them all
  bsc: null,
};

/** The featured list for a chain, deduped by address (the source list repeated one entry). */
export function featuredFor(id: ChainId): FeaturedToken[] {
  const seen = new Set<string>();
  return (FEATURED_TOKENS[id] ?? []).filter((t) => {
    const key = t.address.toLowerCase();
    if (seen.has(key) || key === EVM_NATIVE.toLowerCase()) return false;
    seen.add(key);
    return true;
  });
}
