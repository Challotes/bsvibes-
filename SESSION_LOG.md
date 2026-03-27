# Session Log

> Short summaries of each working session. AI agents: add an entry before ending any significant session.

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
