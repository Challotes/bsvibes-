# Roadmap

> What's done, what's next, what's planned. AI agents: update this file when you complete or start a task.
>
> Last updated: 2026-03-25

## Phase 1: Foundation — COMPLETE

- [x] Project setup (Next.js + TypeScript + Tailwind)
- [x] SQLite database with posts table (WAL mode, auto-migration)
- [x] BSV identity system (auto-generated keypairs, anon names, WIF in localStorage)
- [x] Post creation with cryptographic signing (ECDSA via @bsv/sdk)
- [x] Minimal GPT-style dark UI (centered layout, post box + feed)
- [x] Key backup system (copy to clipboard + download JSON)
- [x] Documentation (Vision, Identity, Security discussions)

## Phase 1.5: UI Overhaul & Bootboard — COMPLETE

- [x] Renamed project to BSVibes (from "Build From Nothing")
- [x] Telegram-style feed layout (newest at bottom, scroll-to-bottom with unread count)
- [x] Bootboard feature (pay-to-spotlight, boot counter per post, live timer)
- [x] Bootboard animations (shake, glow, slide-in on holder change)
- [x] Compact bootboard with expandable history
- [x] Genesis section (founding conversation, collapsible, persisted visited state)
- [x] Identity chip in header (replaces full identity bar)
- [x] Enter-to-post with auto-refocus after posting
- [x] Voice-to-text microphone button (Web Speech API)
- [x] Agent chat (Claude Haiku API, full project context, modal overlay)
- [x] Telegram-style post button (mic when empty, send arrow when typing)
- [x] Hidden scrollbars, word-break for long content
- [x] "Agentic Fairness" subtitle in header
- [x] "created with bopen.ai" attribution
- [x] Boot button UX: oval pill, vertically centered right of post, count below
- [x] Scrollable bootboard history with reboot buttons (up to 50 entries)

## Phase 1.6: Real-Time, UX & Deployment — COMPLETE

- [x] Real-time feed polling (GET /api/posts every 5s, pauses when tab hidden, resumes on visibility)
- [x] Optimistic UI on posting (post appears immediately with spinner + reduced opacity, auto-removed when server confirms)
- [x] Identity loss warning dot (amber pulsing dot on identity chip until user opens dropdown for first time)
- [x] Cursor-based pagination ("Load earlier posts" button, getOlderPosts server action)
- [x] PWA manifest + icons (Add to Home Screen on iOS/Android/Desktop)
- [x] Deployment prep (Railway config, Dockerfile, env var DB path, .env.example)
- [x] Incremental polling via ?since_id (only fetches new posts, not full 100 every 5s)
- [x] DB indexes on bootboard (post_id, held_until)
- [x] Bug fixes: PostList stale state, timeAgo logic error, AgentChat stale closure, dropdown click-outside
- [x] Code hygiene: shared system prompt, dead code removed, .dockerignore, break-words

## Phase 2: Security Hardening — COMPLETE

- [x] Server-side signature verification (ECDSA verify via @bsv/sdk, rejects invalid sigs)
- [x] Rate limiting (in-memory sliding window: 10 posts/min, 5 boots/min, 10 agent calls/min)
- [x] Hide WIF from DOM (masked by default, reveal toggle, copy/download still work)
- [x] JSON.parse try/catch in identity.ts (corrupted storage returns null instead of crash)
- [x] CSP headers (Content-Security-Policy, HSTS, Permissions-Policy added)
- [x] bootPost input validation + transaction wrapper (prevents race conditions)
- [x] Foreign key enforcement enabled in SQLite
- [x] Agent chat input capped (20 messages, 2000 chars each)
- [x] Error boundary added (error.tsx)
- [x] Identity dropdown language fixed (removed "key" from UI copy)
- [x] localStorage error handling (try/catch on setItem, graceful degradation in private browsing)
- [x] BSV SDK import failure handling (catch in useIdentity, sets error state instead of infinite loading)
- [x] Multi-tab identity race condition (re-check storage after async key generation)
- [x] DB init error handling (try/catch with descriptive error messages)
- [x] LiveTimer negative time guard (clock skew protection)
- [x] Post success feedback (green flash + "Posted" indicator)
- [x] Agent chat discoverable ("Ask AI" pill button replaces hidden text)
- [x] Identity loading state (dynamic placeholder + pulse animation)
- [x] Streaming agent responses (SSE via /api/agent route, progressive text display)
- [x] UI labels updated (identity dropdown copy rewritten, no longer says "key")
- [x] Manifesto / vision TLDR above Genesis section (V2 "The Signal" copy)
- [x] "Agentic Fairness" subtitle clickable (scrolls to manifesto)
- [x] "Chat with the agent" link in manifesto scrolls to bottom + highlights Ask AI button

## Phase 3: On-Chain Integration — COMPLETE

- [x] Server wallet service (BSV_SERVER_WIF env var, UTXO fetching via WhatsOnChain, ARC broadcast)
- [x] OP_RETURN posting (OP_FALSE OP_RETURN with JSON payload, fire-and-forget after DB insert)
- [x] Transaction ID storage (tx_id updated on post row after successful broadcast)
- [x] On-chain verification link (green chain icon on posts, links to WhatsOnChain)
- [x] Wallet generation script (scripts/generate-wallet.mjs)
- [x] Graceful degradation (no BSV_SERVER_WIF = DB-only, no errors)

## Phase 4: Security Upgrades — COMPLETE

- [x] AES-256-GCM passphrase encryption (Web Crypto API, PBKDF2 100k iterations)
- [x] "Upgrade Security" button in identity dropdown (optional, user-initiated)
- [x] Key rotation on upgrade (new keypair, old key signs migration)
- [x] On-chain migration record (OP_RETURN linking old pubkey → new pubkey)
- [x] Server-side migration verification + DB storage (migrations table)
- [x] Protected/Unprotected shield indicator in identity dropdown
- [x] Session-cached decrypted identity (plaintext never written back to localStorage)
- [ ] Passkey wrapping (WebAuthn PRF, biometric unlock) — future
- [ ] Firefox passphrase fallback — future
- [ ] Deferred activation prompt (nudge at earnings threshold) — future
- [ ] Session timeout for encrypted identities (auto-lock after inactivity) — future
- [ ] Device sync via QR code (faster identity import between devices) — future
- [ ] PBKDF2 increase to 600k iterations — future (when real funds flow)

## Phase 5: Self-Funded Posting — PLANNED

- [ ] UTXO check via WhatsOnChain API
- [ ] Client-side transaction building with change output
- [ ] Silent switch between server-funded and self-funded
- [ ] Daily posting limits (5 free/day)
- [ ] QR code funding when limit reached

## Phase 6: Fairness & Revenue — COMPLETE

- [x] Fairness config (tunable parameters, governance surface)
- [x] Dynamic boot pricing (contributors × 156, floor 1000, ceiling 250000, cached 1h)
- [x] Contribution weight calculation (sqrt × decay × engagement, migration chain resolution)
- [x] No-custody payout split (every sat out in same tx, no DB balances)
- [x] UTXO manager (reservation, 0-conf chaining, multi-input aggregation)
- [x] Multi-output split transaction builder (P2PKH outputs + OP_RETURN audit)
- [x] Boot orchestrator (full workflow: validate → price → score → split → broadcast → record)
- [x] Boot grants table (15 free boots per pubkey)
- [x] Payouts audit table (records every split for transparency)
- [x] FundAddress component (deposit address panel for users who exhaust free boots)
- [x] Wire bootPost action to orchestrator (free boots → server, paid → client trustless)
- [x] Client-side trustless boot tx builder (browser builds split tx directly to contributors)
- [x] Boot shares API endpoint (/api/boot-shares — contributor list for client tx building)
- [x] Boot confirmation API endpoint (/api/boot-confirm — audit trail after client broadcast)
- [x] Auto-switch: free → server pays, has BSV → client pays trustlessly, no balance → fund QR
- [x] UI: boot price display on buttons (tooltip) and bootboard (empty state)
- [x] UI: free boot counter ("FREE" badge + remaining count in tooltip)
- [x] UI: fund address modal (shows deposit address when user has no BSV balance)
- [x] Boot button handles full flow: free → server, paid → client trustless, no funds → QR modal
- [x] UI: earnings display on identity chip (sats earned) + dropdown (total earned section)
- [x] Earnings API endpoint (/api/earnings — sum payouts by address)
- [x] Boot status API endpoint (/api/boot-status — free boots remaining for client sync)
- [x] UTXO reliability: spent-blacklist, retry logic, largest-first selection, error logging
- [x] Fund modal with balance breakdown (shows actual balance vs boot cost)
- [x] LIVE AND WORKING: posts on-chain, boots splitting payments, earnings accumulating
- [x] Security audit: 9 critical + 3 high findings fixed (SECURITY_AUDIT.md)
- [x] CSP hardened, boot-confirm verifies on-chain, unsigned posts rejected
- [x] Identity import with automatic migration cleanup
- [x] Earnings sparkline chart, Noob/Goat currency toggle, live balance polling
- [x] Forced backup download on security upgrade, interrupted upgrade recovery
- [x] Passphrase unlock UI (users no longer locked out after refresh with encrypted identity)
- [x] Atomic migration ordering (server confirms before key stored locally)
- [x] Identity import with automatic migration cleanup (signed challenge required)
- [x] Full tester audit: all identity/upgrade paths verified

## Phase 7: The Recursive Model — PLANNED

- [ ] Post-to-project spawning
- [ ] Template system for new instances
- [ ] Yours Wallet integration via @1sat/connect for power users

## Open Source — PLANNED

- [ ] Clean up repo for public release
- [ ] Ensure AI context files are comprehensive
- [ ] Choose license (considering contribution-tracking implications)
- [ ] GitHub public release
