# Session Log

> Short summaries of each working session. AI agents: add an entry before ending any significant session.

## 2026-03-30 — Identity Card Redesign + Error Logging

Major UX overhaul of identity card:
- Split card into informational dropdown + "Manage identity" modal with labeled rows
- Added change passphrase flow (verify current → enter new → key rotation + recovery file)
- Copyable receive address on own row with copy icon and feedback
- "Not protected" bar is now clickable → opens upgrade modal directly
- Memory clue always visible, single passphrase entry for save (no double prompt)
- Cancel buttons red for visibility, modal resets on close, uniform expand/cancel behavior
- Advanced badge on "Show recovery key" row
- Simplified FundAddress: removed boot cost when opened from card, z-index fix
- Added error logging to on-chain post logging and wallet broadcast (6 log points)
- Investigated post 339 on-chain failure: transient WoC issue, wallet healthy (199M sats)

## 2026-03-30 — Migration Chain Repair + Return Value Fix

Critical bug found and fixed:
- `migrateIdentity()` return value was never checked — silent failures orphaned posts
- 280 posts were disconnected across 2 broken chain links (manual DB repair applied)
- Upgrade now aborts if migration registration fails (prevents future orphans)
- Root cause predated the redesign — existed since Phase 4
- Updated ROADMAP, SECURITY_AUDIT, SESSION_LOG

## 2026-03-30 — Identity Dropdown Full Redesign

Major simplification of identity dropdown:
- State reduced from 43 to ~24 variables
- UpgradeModal extracted as separate component (no more inline form push-down)
- PassphrasePrompt shared component (replaces 4 duplicate passphrase forms)
- Masked WIF display removed (meaningless to users)
- Advanced disclosure hides Show/Copy/Paste key
- Restore simplified to one-button file picker
- All 6 bugs fixed (B1-B6): plaintext fallback, double encrypt, fragile regex,
  state persistence, mutual exclusion, download throttle
- Unified recovery files: always both keys, no more "backup" terminology
- Self-contained HTML recovery files with embedded BSVibes icon
- Private & Offline banner in recovery files
- Passphrase hint in all download paths
- File naming: bsvibes-{name}-{date}.html

## 2026-03-30 — Encrypted Backups, Re-Auth, Hints, Recovery Tool

Security hardening (8 changes):
- Passphrase re-prompt with 60s grace window for Copy/Show/Save/Restore
- Upgrade backup encrypted with passphrase (wif_encrypted, not plaintext wif)
- Old WIF encrypted on failed fund transfer
- Protected restore: encrypted auto-download + confirmation gate
- Unprotected restore: keeps plaintext auto-download (no passphrase to encrypt with)
- Save file encrypts when protected (re-prompts for passphrase)
- Import handles encrypted backup files (detects wif_encrypted, prompts for passphrase)
- Optional passphrase hint (stored in localStorage + backup file, shown on unlock prompt)
- Standalone HTML recovery tool at /recover.html (offline, no dependencies, dark theme)
- File naming: bsvibes-{name}-{date}.json with -backup suffix for auto-saves

## 2026-03-29 — Earnings History Survives Upgrades + Goat Mode on Upgrade

- Fixed /api/earnings: now resolves full migration chain (BFS over migrations table, both directions) so earnings chart and activity feed survive security upgrades and cross-device restores
- All three queries (total, activity, sparkline) now use IN (all chain addresses) instead of single address
- IdentityBar: after successful security upgrade, auto-switches to Goat mode (sats) if user was in Noob mode

## 2026-03-29 — Identity Dropdown UX Overhaul

- Full copy audit by designer + marketer: 44 findings, every string reviewed
- Relaxed language rule: "key" and "recovery key" now permitted (Google/Apple normalised)
- 17 string replacements: recovery key, restore, featured, agentic split
- File names include dates and descriptive suffixes
- Recovery key section collapsible (collapsed when protected)
- Protected banner compact single-line
- Mobile overflow fix (max-h-[85vh])
- Currency toggle shows destination mode
- Activity labels: "Agentic split" + "Boot featured"
- Notification system added to roadmap (Phase 6.5)

## 2026-03-28 — Post-Audit Fixes: Ghost Posts, UTXO Contention, Migration Bridges

- Fixed ghost posts: createPost returns { ok, reason } — rejected posts removed from optimistic UI
- Fixed client-side double-spend on rapid boots: mutex + spent tracking + 0-conf chaining
- Fixed chain link overwrite: single atomic setPosts for tx_id updates + new posts
- Fixed boot-confirm 400: retry WoC verification after 2s for fresh txs
- Fixed WoC rate limit: balance polling slowed to 15s
- Fixed cleanupMigrations: now bridges orphaned intermediate keys before deleting
- Fixed test user migration data: manual 1EJk → 1H2p insertion
- Auto-download current identity backup before import (safety net)

## 2026-03-28 — isIdentityEncrypted Root Cause Fix

- Root cause found: isIdentityEncrypted() always returned false — checked raw JSON string for "enc:" prefix but the stored value is a JSON wrapper starting with "{"
- Every encrypted identity guard was broken: unlock prompt never appeared, stale plaintext key generated after upgrade, "Not protected" shown despite valid encrypted key
- Fixed: now JSON-parses stored value and checks .encrypted field (matches unlockIdentity pattern)
- Added secondary guard before key generation (after async gap)
- Upgrade → refresh → passphrase unlock → identity restored: fully working end-to-end

## 2026-03-28 — Tester Audit + Final Critical Fixes

- Full end-to-end tester audit by Jason: 8 bugs found in identity/upgrade flow
- BUG-1 FIXED: Passphrase unlock UI added (was dead code, users locked out after refresh)
- BUG-2 FIXED: Migration registered before key stored (atomic ordering, no crash window)
- needsUnlock state flows through useIdentity → context → IdentityBar
- commitUpgrade() separates key storage from key generation
- All previous critical fixes verified as working by tester

## 2026-03-28 — Security Audit: 9 Criticals + 3 Highs Fixed

- Full deep audit by code auditor (Jerry) + security ops (Paul): 53 findings total
- Created SECURITY_AUDIT.md tracking all findings with severity and fixes
- C1: Removed unsafe-eval from CSP
- C3: boot-confirm now verifies txid on-chain before recording
- C4: Backup includes old WIF when fund transfer fails
- C5: Free boot grant preserved when broadcast fails
- C6: Interrupted upgrade recovery (prefer plaintext key when both exist)
- C7: Double-upgrade preserves intermediate posts via bridge migration
- C8: cleanupMigrations requires signed challenge
- C9: Backup warning dot only clears on actual copy/download
- H1: Rate limiting keyed on pubkey not client-supplied name
- H5: Unsigned posts rejected (pubkey + signature required)
- H6: /api/tx-hex rate limited (60 req/min per IP)

## 2026-03-28 — Identity Safety, Currency Toggle, Earnings Chart, Activity Feed

Identity safety:
- Force backup auto-download before security upgrade completes (prevents key loss)
- Auto-transfer funds from old address to new on upgrade (batched UTXO fetch, no cap)
- Auto-cleanup stale migration records when importing old identity
- Fixed CORS: proxy WoC /tx/hex through /api/tx-hex endpoint
- Fixed migration chain routing contributions to lost addresses
- Identity import from backup file or WIF paste

Currency & earnings:
- Noob Mode (dollars) / Goat Mode (sats) toggle in dropdown, persisted
- BSV price feed from WhatsOnChain (cached 5 min)
- AnimatedBalance works in both modes (count-up + "Agentic fairness" label)
- Earnings sparkline chart (step-function area, pure SVG, always rising)
- Activity feed: shows free/paid boots correctly (is_free column)
- Live balance polling every 5s from WhatsOnChain
- Boot event tracking fixed (bootboard.id not post_id for payouts)

UI:
- Identity dropdown redesigned (security top, Noob/Goat toggle, balance, activity, backup)
- Pagination order fixed (older posts at top, recent at bottom)
- FREE badge disappears immediately when free boots exhausted

## 2026-03-27 — Balance Display + Free Boot Policy

- Identity chip now shows spendable balance (WhatsOnChain UTXOs) instead of total earned
- Identity dropdown shows both: Balance (spendable) + Total earned (all-time)
- Settled: free boots are one-time only (15 per identity, never reset)
- System is live: posts on-chain, boots splitting payments, earnings accumulating, balance visible

## 2026-03-27 — Boot Reliability: UTXO Management + Paid Boot Flow

- Fixed boot splits failing silently: spent-UTXO blacklist prevents double-spend from stale WhatsOnChain data
- Added retry logic to boot split transactions (matches post OP_RETURN pattern)
- Added error logging to boot orchestrator (was silently swallowing broadcast failures)
- Sorted UTXOs largest-first so server wallet picks the big UTXO over tiny platform-cut UTXOs
- Fixed disabled boot button after free boots: freeBootsRemaining now synced from server via /api/boot-status
- Fixed fund modal not showing: onFundNeeded now passes user address + balance
- Fund modal shows balance breakdown (your balance / boot cost / top up needed)
- Added diagnostic logging to client-side boot for debugging
- CSP updated: added arc.gorillapool.io (BSV SDK default broadcaster)
- Confirmed: posts going on-chain consistently, green chain icons appearing, earnings accumulating

## 2026-03-27 — Boot Flow Fixes: 7 Bugs Fixed by BSV Agent

- Fixed split calculation double-count (creator overpaid when no pool contributors)
- CSP updated: WhatsOnChain + ARC added to connect-src for client-side boots
- Name vs address separation: bootboard shows anon names, grants tracked by address
- HistoryRow reboot now handles paid boots (was silently failing)
- Payout recording added for free boots (was only recording paid)
- Placeholder address removed from boot-shares (proper 503 when no wallet)
- boot-confirm accepts booterName for display
- Server wallet funded with BSV for live testing

## 2026-03-26 — Phase 6 Complete: Earnings Display

- Earnings API endpoint (/api/earnings) — sums payouts by recipient address
- Identity chip shows "X sats" earned next to anon name when earnings > 0
- Identity dropdown shows "Total earned" section with emerald accent
- Phase 6 marked COMPLETE in ROADMAP.md

## 2026-03-26 — Phase 6 UI Wiring: Boot Payments Live

- Boot button now handles full flow: free (server pays) → paid (client trustless) → no funds (QR modal)
- BootButton shows price in tooltip, "FREE" badge when free boots remain
- Bootboard shows boot cost in empty state
- FundAddress modal appears when user has no BSV balance
- Feed.tsx manages boot price, free boots remaining, fund modal state
- PostList passes boot info through to every BootButton

## 2026-03-26 — Phase 6 Backend: Fairness Engine + Revenue Splitting

- Built complete fairness engine: config.ts, pricing.ts, weights.ts, split.ts
- Dynamic boot pricing: contributors × 156 sats with floor/ceiling
- Contribution weights: sqrt(engagement) × time-decay, resolves migration chain
- True no-custody split: every sat out in same BSV transaction, no DB balances
- Rewrote wallet.ts: UTXO reservation, 0-conf chaining, multi-input aggregation
- Boot orchestrator: full workflow from validation through broadcast and audit recording
- Boot payment builder: multi-output P2PKH + OP_RETURN audit trail
- New DB tables: boot_grants (free boot tracking), payouts (audit trail)
- FundAddress.tsx component for users who exhaust free boots
- Settled decisions documented: no custody, boots require pubkey, only signed posts boostable

## 2026-03-26 — Security Upgrade System (Phase 4)

- AES-256-GCM passphrase encryption via Web Crypto API (crypto.ts)
- Key rotation on upgrade: new keypair generated, old key signs on-chain migration
- Migration service posts OP_RETURN linking old pubkey → new pubkey
- Server action verifies migration signature + stores in migrations table with indexes
- IdentityBar: "Upgrade Security" button, passphrase form, Protected/Unprotected shield
- identity.ts handles both plaintext and encrypted storage, session-cached decryption
- Phase 4 marked COMPLETE (passkey wrapping + deferred activation deferred to future)

## 2026-03-26 — On-Chain Posting (Phase 3)

- Server wallet service: loads BSV_SERVER_WIF, fetches UTXOs from WhatsOnChain, broadcasts via ARC
- OP_RETURN post logging: OP_FALSE OP_RETURN with JSON payload (app, type, content, author, sig, pubkey, ts)
- Fire-and-forget after DB insert — posts save instantly, on-chain logging is async/best-effort
- tx_id updated on post row after successful broadcast
- Green chain-link icon on posts with tx_id, links to WhatsOnChain transaction viewer
- Wallet generation script (scripts/generate-wallet.mjs) for easy setup
- Graceful degradation: no BSV_SERVER_WIF = DB-only mode, no errors
- Phase 3 marked COMPLETE in ROADMAP.md

## 2026-03-26 — Manifesto, Vision Copy & Concept-to-UI Gap

- Created Manifesto.tsx with V2 "The Signal" vision copy (amber left-border accent, bold heading)
- Genesis.tsx now renders Manifesto above founding conversation with bridge divider
- "Agentic Fairness" subtitle in header is now clickable (scrolls to manifesto)
- "Chat with the agent to learn more" link scrolls to bottom and pulses the Ask AI button amber for 2s
- Phase 2 fully complete: UI labels item marked done (identity dropdown copy already updated)

## 2026-03-25 — Performance: Instant Posts & Boots

- Root-caused 3s perceived delay: optimistic posts showed "sending" spinner until next poll (up to 5s)
- Removed revalidatePath from createPost/bootPost — was adding 50-200ms blocking server work, redundant with polling
- BSV SDK now cached as singleton promise on client, PrivateKey parsed once per session (was re-importing on every post)
- Optimistic posts render at full opacity with no spinner (server confirms in ~50ms)
- Early poll at 500ms after post/boot via exposed refresh() function
- Optimistic boot count increments instantly, resets when server confirms
- Textarea no longer disabled during background signing/server work
- Validated by architecture reviewer: all changes safe, no regressions

## 2026-03-25 — Bug Fixes, Code Hygiene & Efficient Polling

- Fixed PostList stale state bug: lifted pagination state to Feed.tsx so polled updates flow through
- Fixed timeAgo logic error (hours branch was broken): extracted to shared src/lib/utils.ts
- Fixed AgentChat stale closure: messagesRef pattern prevents lost conversation history on rapid messages
- Added click-outside handler to identity dropdown
- Extracted system prompt to src/data/agent-prompt.ts, removed dead agent-action.ts
- Added DB indexes on bootboard.post_id and bootboard.held_until
- Added .dockerignore, fixed break-all to break-words on post content
- Incremental polling via ?since_id=N — only fetches new posts instead of all 100 every 5s

## 2026-03-25 — Real-Time Feed, Optimistic Posts & Identity Warning

- Added `/api/posts` GET endpoint (returns posts + bootboard as JSON, dynamic/no-cache)
- Created `useFeedPolling` hook: polls every 5s, pauses when tab is hidden, resumes on visibilitychange
- Feed.tsx wired to polling hook — server-rendered initial data stays fresh without any page reload
- Optimistic UI: post appears immediately after submit with spinner + 50% opacity; auto-pruned when polling confirms it
- Identity chip now shows an amber pulsing dot (like a notification badge) until user opens the dropdown for the first time; stored in localStorage as `bsvibes_identity_backed_up`

## 2026-03-25 — Security, Error Handling, UX & Streaming Sprint

- Server-side ECDSA signature verification added (rejects invalid/malformed sigs, unsigned posts still allowed)
- In-memory sliding window rate limiting on createPost (10/min), bootPost (5/min), askAgent (10/min global)
- localStorage write failure handling (graceful degradation in private browsing/Safari)
- BSV SDK import failure handling (catch sets error state instead of infinite loading spinner)
- Multi-tab identity race condition fixed (re-checks storage after async key generation)
- DB init wrapped in try/catch with descriptive error messages
- Post success feedback (green border flash + "Posted" text with auto-fade)
- "Ask AI" pill button replaces near-invisible text link for agent chat
- Identity loading state (dynamic placeholder + pulse animation while generating)
- Streaming agent responses via /api/agent SSE route (text appears progressively)
- LiveTimer negative time guard, identity dropdown language fix ("key" removed)

## 2026-03-25 — Agent Team Review & 18-Item Fix Sprint

- Dispatched 5 specialist agents (Architecture, Design, Next.js, Agent/AI, Security) to review the entire codebase
- Applied 18 fixes across 4 waves: critical fixes, security hardening, structural cleanup, Next.js optimization
- Wave 1: bootPost transaction + validation, FK pragma, JSON.parse try/catch, metadata fix, error boundary
- Wave 2: CSP/HSTS/Permissions-Policy headers, agent input rate-limiting, WIF hidden from DOM with reveal toggle
- Wave 3: Types consolidated to src/types/, generateAnonName shared, IdentityProvider context (replaces 4 independent hooks), Feed.tsx broken into Header + PostList + useScrollTracker
- Wave 4: 10s ISR revalidation, React Compiler enabled, ESM empty-module, Biome replacing ESLint
- Removed unused src/components/ui/ (Button, Card, Input — dead code)
- All changes verified with clean production build

## 2026-03-25 — Boot Button UX & Bootboard History

- Boot button redesigned: oval pill with border, vertically centered right of each post, count below
- Bootboard history now scrollable (up to 50 entries) in compact 120px area
- Reboot button added to history rows — boot icon left of author name, click to reboot any past post
- History query returns post_id for reboot functionality

## 2026-03-25 — Agent Chat AI & Mobile Polish

- Upgraded agent chat from keyword matching to Claude Haiku 4.5 API (~$0.001/question)
- Telegram-style post button: mic when empty, amber send arrow when typing
- Unified boot button: single component, fixed width, number left of icon
- Mobile fixes: responsive padding, visible post button, boot button always shown, sheet-style agent modal
- Fixed identity dropdown opacity (solid header bg)
- Bootboard visual refinement: gradient bg, fade edge, more breathing room
- Removed debug logging from agent action

## 2026-03-24 — BSVibes UI Overhaul & Bootboard

- Renamed project from "Build From Nothing" to BSVibes across all source files
- Built Telegram-style feed layout with scroll-to-bottom, unread count badge (IntersectionObserver), hidden scrollbars
- Created Bootboard feature: pay-to-spotlight any post, boot counter, live timer, shake/glow/slide animations, expandable history
- Added Genesis section preserving the founding conversation (Feb 2026), with localStorage-persisted visited state and header-centered navigation
- Built agent chat with keyword-matched Q&A (11 knowledge entries, modal overlay, zero API cost)
- Added voice-to-text mic button (Web Speech API), enter-to-post with auto-refocus
- Identity bar refactored to compact header chip with dropdown
- Established "Agentic Fairness" as the subtitle/philosophy — progressive autonomy from human-set parameters to fully agentic
- Added "created with bopen.ai" attribution
- Updated all context files (CLAUDE.md, ROADMAP.md, DECISIONS.md)

## 2026-03-19 — Memory System & AI-Native Docs

- Reviewed and expanded memory system (was 2 files, now 6)
- Clarified: bOpen.ai is the toolkit, project is BS Vibes (not "Build From Nothing")
- Extracted context from 6 HTML discussion docs into structured files
- Created DIRECTION.md, DECISIONS.md, ROADMAP.md
- Upgraded CLAUDE.md with full project context and AI Contribution Protocol
- Established AI-native open source strategy: repos that self-onboard any AI agent
- Adopted phased enforcement: instructions now, hooks when contributors arrive, CI when patterns break
