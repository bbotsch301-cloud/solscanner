# Security notes — XGO Wallet (mobile)

## Cryptography
- **Seed generation**: 24-word / 256-bit BIP39 via `@noble/hashes` `randomBytes`, which
  uses the OS CSPRNG (`crypto.getRandomValues`, backed by iOS SecRandom / Android
  SecureRandom). No `Math.random` fallback — it throws if no CSPRNG is present.
- **Derivation**: Solana ed25519 (SLIP-0010) + EVM secp256k1 (`@scure/bip32`), both
  deterministic from the single seed.
- **Signing**: `@noble/curves` with deterministic RFC-6979 nonces. EIP-191 / EIP-712 /
  EIP-1559 verified against published spec vectors. We do **not** use `elliptic` for any
  key or signing operation.
- **Key storage**: `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` — OS-encrypted,
  unlock-gated, excluded from iCloud/iTunes backups, never synced.

## Handling & UI
- Recovery phrase: no clipboard copy, screenshot prevention + warning, mandatory backup.
- App lock: biometric/passcode by default; auto-locks on background.
- Sends: recipient screening (Solana + EVM contract/burn/self checks) and a full-address
  confirmation before signing (anti address-poisoning).
- Swaps: exact-amount ERC-20 approvals (no lingering infinite allowance).
- WalletConnect: every request is shown decoded (message / typed-data / tx) and must be
  explicitly approved; permit/approval requests carry a red warning.

## Dependency advisories (npm audit)
As of this writing `npm audit` reports 4 high / 14 moderate / 4 low. **All fixes require
`npm audit fix --force`, which downgrades core deps to broken versions** (e.g.
`@solana/spl-token@0.1.8`, `@solana/web3.js@0.0.3`, `expo@57`) — so they are intentionally
NOT applied. Triage of the highs:

| Advisory | Where | Real exposure |
|---|---|---|
| `bigint-buffer` (toBigIntLE overflow) | transitive via `@solana/spl-token` account parsing | DoS only, needs an attacker-controlled RPC buffer; use a trusted RPC. Not key theft. |
| `elliptic` (risky ECDSA) | transitive (web3 stack) | **Unused** — our signing is `@noble/curves`, not `elliptic`. |
| `postcss` (XSS / path traversal) | **build-time** (CSS tooling) | Not in the mobile runtime bundle. No runtime risk. |
| `uuid` (buffer bounds when `buf` passed) | transitive via `jayson`/web3 | Not reachable — we never pass a `buf`. |

Action: monitor upstream (`@solana/*`, `expo`) for non-breaking releases that bump these
transitive deps, then update. Nothing here touches the key/signing path.
