# Roadmap

> What's done, what's next, what's planned. AI agents: update this file when you complete or start a task.
>
> Last updated: 2026-03-19

## Phase 1: Foundation — COMPLETE

- [x] Project setup (Next.js + TypeScript + Tailwind)
- [x] SQLite database with posts table (WAL mode, auto-migration)
- [x] BSV identity system (auto-generated keypairs, anon names, WIF in localStorage)
- [x] Post creation with cryptographic signing (ECDSA via @bsv/sdk)
- [x] Minimal GPT-style dark UI (centered layout, post box + feed)
- [x] Key backup system (copy to clipboard + download JSON)
- [x] Documentation (Vision, Identity, Security discussions)

## Phase 2: Security Hardening — IN PROGRESS

- [ ] Server-side signature verification (prevent impersonation)
- [ ] Rate limiting (per-address + per-IP)
- [ ] Hide WIF from DOM (download-only, never display raw key)
- [ ] JSON.parse try/catch (corrupted storage crashes app)
- [ ] CSP headers enhancement
- [ ] Rename UI labels ("keep your name" not "save your key")

## Phase 3: On-Chain Integration — PLANNED

- [ ] OP_RETURN posting (server-funded, ~0.00001 BSV per post)
- [ ] Transaction ID storage (store tx_id with each post)
- [ ] On-chain verification link (view post on blockchain)

## Phase 4: Security Upgrades — PLANNED

- [ ] Passphrase encryption for localStorage (AES-256, min 8 chars)
- [ ] Encrypted backup files
- [ ] Passkey wrapping (WebAuthn PRF, biometric unlock)
- [ ] Firefox passphrase fallback

## Phase 5: Self-Funded Posting — PLANNED

- [ ] UTXO check via WhatsOnChain API
- [ ] Client-side transaction building with change output
- [ ] Silent switch between server-funded and self-funded
- [ ] Daily posting limits (5 free/day)
- [ ] QR code funding when limit reached

## Phase 6: Fairness & Revenue — PLANNED

- [ ] Fairness agent v1 (timing, impact, quality, engagement scoring)
- [ ] Revenue distribution based on contribution history
- [ ] On-chain migration messages (MAP + AIP) for key upgrades

## Phase 7: The Recursive Model — PLANNED

- [ ] Post-to-project spawning
- [ ] Template system for new instances
- [ ] Yours Wallet integration via @1sat/connect for power users

## Open Source — PLANNED

- [ ] Clean up repo for public release
- [ ] Ensure AI context files are comprehensive
- [ ] Choose license (considering contribution-tracking implications)
- [ ] GitHub public release
