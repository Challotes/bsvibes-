# Decisions

> Key decisions already made. Don't relitigate these unless the reasoning no longer applies. If you're an AI, respect these — they came from deliberate discussion, not defaults.

## Naming

- **Project name:** BS Vibes (was "Build From Nothing" — name is changing)
- **bOpen.ai** is the toolkit, not the product
- **User-facing language:** Never say "key", "wallet", "WIF", "private key" in the UI
  - "save your key" → "keep your name"
  - "fund your address" → "deposit slot"
  - "key rotation" → "stronger lock"
  - "PIN" → "passphrase" (4-digit PIN is crackable in 1 hour — minimum 8 chars)

## Identity & Security

### Current state (Phase 1 — acceptable for now)
- BSV keypair generated in-browser via `PrivateKey.fromRandom()`
- Stored as plaintext WIF in localStorage
- No encryption, no password, no PIN
- Acceptable only because no real money is at stake yet

### The hardware problem (settled)
- BSV uses secp256k1 elliptic curve
- No hardware chip supports secp256k1 directly (not Apple Secure Enclave, not TPMs, not passkeys, not YubiKeys)
- Hardware can't **be** the BSV key, but hardware can **guard** it via encryption wrapping

### Planned upgrade path (6 stages, settled)
1. **Fix Now:** Server-side signature verification, rate limiting, try/catch on JSON.parse, hide WIF from DOM, CSP headers
2. **Stage 1 (current):** Raw localStorage with renamed labels
3. **Stage 2:** Passphrase encryption — download backup first, then set passphrase, AES-256 encrypt localStorage. Fresh key at upgrade time
4. **Stage 3:** Passkey wrapping — WebAuthn PRF replaces passphrase. Firefox falls back to passphrase. HKDF domain separation
5. **Stage 4:** Self-funded posting — UTXO check, client-side tx building, server fallback
6. **Stage 5:** Revenue + daily limits — 5 free posts/day, QR to fund, fairness agent routes revenue
7. **Stage 6:** Server HSM / threshold signing — required before significant funds flow

### The 5-minute window problem (settled)
- Any key that existed as plaintext in localStorage must be assumed potentially compromised
- When real money starts flowing: generate NEW key, old key signs on-chain migration message (MAP + AIP protocol)
- For idea-board phase with zero funds: risk is near-zero, defer rotation until revenue phase

### Passkey-wrapped keys (chosen approach)
- BSV key encrypted with AES-256
- Decryption key derived from WebAuthn PRF extension tied to biometrics
- Stolen localStorage = useless ciphertext
- Works on Chrome, Safari, Edge; Firefox needs passphrase fallback
- Medium implementation effort, best security/UX tradeoff

## Self-Funded Posting (settled)

- Server pays for posts by default (~0.00001 BSV per post)
- When user has BSV balance, app silently switches to user-funded
- Same button, same UX — funding source switches invisibly
- Must create change output or user loses remaining balance
- Cost: ~1 satoshi per post; 10,000 satoshis covers thousands of posts

## Anti-Spam (settled direction)

- Free posts capped per day (5/day suggested)
- Under limit: server pays, no friction
- Over limit with balance: self-funded, no friction
- Over limit without balance: "You've got more to say" + QR code
- Server-side enforcement (pubkey + IP + session token), not chain-only
- Optional: proof-of-work for free posts

## Tech Stack (settled)

- Next.js 16 + TypeScript + Tailwind v4 + SQLite + BSV
- GPT-style minimal dark UI
- Server components by default, client only when needed
- Dynamic imports for @bsv/sdk

## Critical Bugs Known

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Server never verifies signatures | Critical | TODO |
| 2 | No rate limiting | Critical | TODO |
| 3 | WIF displayed raw in DOM | High | TODO |
| 4 | Backup file contains raw WIF | High | TODO |
| 5 | JSON.parse without try/catch | Medium | TODO |
| 6 | Database file in project root | Low | TODO |

## Wallet Integration (future)

- Yours Wallet integration via `@1sat/connect` for power users
- Coexists with in-app wallet — not a replacement
- Not needed until later phases
