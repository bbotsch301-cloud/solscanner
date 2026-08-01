/**
 * The curated token showcase — the "menagerie" gathered together. Chain is inferred
 * from the address (0x… = EVM, else Solana). Deduped by address.
 *
 * `name`/`symbol`/`logo` are optional manual OVERRIDES: when omitted they're resolved
 * automatically (DexScreener → Jupiter → on-chain metadata; see lib/tokens/resolve.ts),
 * so a token can be added with just its address. Set them to force a specific display —
 * `logo` may be a URL or a local path like `/tokens/giraffe.png` (file in `public/`).
 */
export interface ShowcaseToken {
  address: string;
  name?: string;
  symbol?: string;
  logo?: string;
}

export type ShowcaseChain = "solana" | "evm";

export function chainOf(address: string): ShowcaseChain {
  return address.startsWith("0x") ? "evm" : "solana";
}

const RAW: ShowcaseToken[] = [
  { name: "Silver Surfer", address: "22WntfxTZcEoSeGPdfkcZ29QdKHowY8ahgcKaDHMpump" },
  { name: "Hummingbird Bitcoin", address: "5GgY77Uti2d6VSAT2WW27d7UA2yBC7PMm2iepjmtJuwv" },
  { name: "RAVEN (GOSHA)", address: "7WjZHjxzJurwKf6dgQdPYAYwDzXzYGtR7r3NbX6Bpump" },
  { name: "The White Dove", address: "8S7sAJPhzUegLxnwq2ymK7f6AE4Ty9tuPChMRKfgpump" },
  { name: "BTC Dragon", address: "0x1Ee8a2f28586e542af677eB15Fd00430f98d8fd8" },
  { name: "Giraffe Coin", address: "4r4Z6oodFM5VnVgdC8bfVj75UrrFv2vb2ShcuPjRpump" },
  { name: "Hungry Hippo", address: "6Tw9kzL3B4AFDyJNg7NULHpUozDrgdukU4UcVMwjpump" },
  { name: "Rhino", address: "0x870e184b7fb15a902dc9a93beb03c15a65977918" },
  { name: "Lulu the Ostrich", address: "4pTN87RQi7Bt7yzU3CFk6FDiD8BYbH2dFYPwsAfjBAGS" },
  { name: "Sheep", address: "6XvDynQVYmQD58TxnhZnjQm5oJGzhLxq6MAMDsGUzYhs" },
  { name: "Mikawa Inu", address: "5Jng6jkLKU1o8BNrCzTEMXMFvPjNJZTpdWR3Hq4RHJb6" },
  { name: "Solomon", address: "23Y1bUqVcJsvWH9WpVJfj1xDozq2GdKbEhRSdGhDpump" },
  { name: "Black Panther", address: "EtUUCeNTxXZZEQMbwVJCh55aL48MovCkRdpXcbUxw6US" },
  { name: "PupFun", address: "AyPNhxMEh5n44T8GhFCCzQzUXh2tTRagpQduVYeEpump" },
  { name: "Happy Elephant", address: "DAYiaV6rooemiBBroroWwh44zykYoozsTirV8AYZpump" },
  { name: "Hope", address: "2JVZ7LF7dPj8EfmKcGe6CPjXZRLRZqe3wE66jR4Bpump" },
  { name: "LayerX (LX) BEPRO", address: "0xcf3c8be2e2c42331da80ef210e9b1b307c03d36a" },
  { name: "PEIPEI Solana", address: "H4PDo8ngWwC4quPTRWfTr2HorUQ2Ep4G3JVeJHMfkZAT" },
  { name: "ETH PIGE", address: "0x995c0e3b9af4da89fc76c5c0784e97c7a36eec06" },
  { name: "Little Rabbit", address: "0x6C46422A0f7dbbAD9BEC3BbBC1189bfAf9794B05" },
  { name: "FIFA", address: "0x66641FCFCa7D919629D5e4A72D9F13787fcAF304" },
  { name: "Water Rabbit", address: "0x57Bfe2aF99AeB7a3de3bc0c42c22353742bfD20D" },
  { name: "BONKAI", address: "hqYtLoxviwGENvogcJ5324YTbYqW5H9LHtmQu5Jbonk" },
  { name: "Sanctuary Token", address: "0x4670f3a2A8D35021257cda028c7ae3Cb854C7CaF" },
  { name: "White Tiger Moon", address: "0x72d97aD5694e0ff5a9e33bd83BA281Bb8cFa0b38" },
  { name: "Manyu", address: "0x95AF4aF910c28E8EcE4512BFE46F1F33687424ce" },
  { name: "Ocicat", address: "0xE53D384Cf33294C1882227ae4f90D64cF2a5dB70" },
  { name: "Giant Token", address: "0xbD7909318b9Ca4ff140B840F69bB310a785d1095" },
  { name: "DigiMon Rabbit", address: "0x485d37ca1c8d4e0b5b11b87604816a4843c079ed" },
  { name: "BNB Frog", address: "0x64da67A12a46f1DDF337393e2dA12eD0A507Ad3D" },
  { name: "BNB Tiger", address: "0xAC68931B666E086E9de380CFDb0Fb5704a35dc2D" },
  { name: "BNB Lion", address: "0x71d421b6dE07ceFa2733D044f92A0306308dE8b8" },
  { name: "WikiCat", address: "0x6Ec90334d89dBdc89E08A133271be3d104128Edb" },
  { name: "Baby BnbTiger", address: "0x5a04565ee1c90c84061aD357AE9E2f1c32D57dc6" },
  { name: "PCat Phenomenal Cat", address: "0xFeD56F9Cd29F44e7C61c396DAc95cb3ed33d3546" },
  { name: "Volt Inu", address: "0x7f792db54B0e580Cdc755178443f0430Cf799aCa" },
];

/** Deduped by lowercased address, first name wins. */
export const SHOWCASE: ShowcaseToken[] = (() => {
  const seen = new Set<string>();
  const out: ShowcaseToken[] = [];
  for (const t of RAW) {
    const key = t.address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
})();

export function findShowcase(address: string): ShowcaseToken | undefined {
  const key = address.toLowerCase();
  return SHOWCASE.find((t) => t.address.toLowerCase() === key);
}
