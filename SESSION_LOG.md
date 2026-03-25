# Session Log

> Short summaries of each working session. AI agents: add an entry before ending any significant session.

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
