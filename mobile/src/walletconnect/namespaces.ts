/**
 * Build the namespaces we approve for a session from the wallet's accounts:
 * eip155 (Ethereum + BSC) with the EVM address, and solana with the Solana address.
 */
import { buildApprovedNamespaces } from "@walletconnect/utils";
import { CHAINS } from "../chains/registry";
import { SOLANA_CAIP2 } from "./config";

const EVM_METHODS = [
  "personal_sign",
  // eth_sign is intentionally omitted — raw-bytes blind signing is a known drainer vector.
  "eth_signTypedData",
  "eth_signTypedData_v4",
  "eth_sendTransaction",
  "eth_signTransaction",
];
const SOLANA_METHODS = ["solana_signMessage", "solana_signTransaction", "solana_signAndSendTransaction"];

const EVM_CHAINS = CHAINS.filter((c) => c.kind === "evm" && c.evmChainId).map(
  (c) => `eip155:${c.evmChainId}`
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function approvedNamespaces(proposal: any, evmAddress: string | null, solanaAddress: string | null) {
  const supportedNamespaces: Record<
    string,
    { chains: string[]; methods: string[]; events: string[]; accounts: string[] }
  > = {};

  if (evmAddress) {
    supportedNamespaces.eip155 = {
      chains: EVM_CHAINS,
      methods: EVM_METHODS,
      events: ["accountsChanged", "chainChanged"],
      accounts: EVM_CHAINS.map((c) => `${c}:${evmAddress}`),
    };
  }
  if (solanaAddress) {
    supportedNamespaces.solana = {
      chains: [SOLANA_CAIP2],
      methods: SOLANA_METHODS,
      events: [],
      accounts: [`${SOLANA_CAIP2}:${solanaAddress}`],
    };
  }

  return buildApprovedNamespaces({ proposal, supportedNamespaces });
}
