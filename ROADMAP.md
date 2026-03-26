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
