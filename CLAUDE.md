# BSVibes — AI Context File

> **If you're an AI reading this:** This file is your onboarding. Read it fully before writing any code.
> After completing significant work, update the relevant context files (DIRECTION.md, DECISIONS.md, ROADMAP.md) with what you changed and why.

## What This Is

A platform that builds itself. It started as a post board and evolves based on user contributions. Every post is logged on-chain (BSV). An Agentic Fairness system tracks contributions and distributes value. Eventually, any idea can spawn into its own project with the same model.

**Tagline:** "A platform that builds itself, then lets anyone do the same."
**Subtitle:** Agentic Fairness

## Toolkit

This project is built using the **bOpen.ai toolkit** (agents, skills, plugins). bOpen is the tooling, not the product. The product is BSVibes.

## Architecture

- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **Database:** SQLite (better-sqlite3) for local dev, file: `local.db`
- **Blockchain:** BSV via `@bsv/sdk` — keypair generation, signing, on-chain logging
- **Identity:** Auto-generated BSV keypair stored in browser localStorage
- **Styling:** Dark theme (zinc/black palette), Telegram/X/GPT hybrid UI

## Key Files

- `src/app/page.tsx` — Main entry (server component, fetches posts + bootboard, 10s ISR)
- `src/app/Feed.tsx` — Client orchestrator: real-time polling, optimistic posts, pagination state, composes all feed components
- `src/app/Header.tsx` — Top bar with BSVibes logo, genesis navigation, identity chip
- `src/app/PostList.tsx` — Pure rendering component for posts, BootButton, Genesis anchor, "Load earlier posts" button
- `src/app/PostForm.tsx` — Compose box with enter-to-post, voice-to-text mic, agent chat trigger, optimistic post callback
- `src/app/IdentityBar.tsx` — Identity chip with dropdown, WIF masked with reveal toggle, amber warning dot until first backup
- `src/app/Bootboard.tsx` — Bootboard spotlight: pay-to-feature post, live timer, shake/glow animations
- `src/app/Manifesto.tsx` — Vision TLDR block above Genesis (amber accent, "Chat with the agent" link)
- `src/app/Genesis.tsx` — Manifesto + founding conversation (always visible at top of feed, NOT collapsible by design)
- `src/app/AgentChat.tsx` — AI-powered Q&A agent (modal, streaming via /api/agent, highlight-on-demand)
- `src/data/agent-prompt.ts` — Shared system prompt for agent chat (single source of truth)
- `src/app/api/agent/route.ts` — Streaming agent chat endpoint (SSE, rate-limited)
- `src/app/api/posts/route.ts` — Feed polling endpoint (GET, supports ?since_id for incremental polling)
- `src/lib/rate-limit.ts` — In-memory sliding window rate limiter
- `src/app/actions.ts` — Server actions (createPost with sig verification, getPosts/getNewPosts/getOlderPosts, getBootboard, bootPost with transaction)
- `src/app/error.tsx` — Error boundary (dark theme, "Something went wrong" + retry)
- `src/contexts/IdentityContext.tsx` — Shared identity provider (single BSV SDK load for all components)
- `src/hooks/useIdentity.ts` — React hook for identity management (used inside IdentityProvider)
- `src/hooks/useScrollTracker.ts` — Scroll position, unread tracking, genesis visited state
- `src/hooks/useFeedPolling.ts` — Polls /api/posts every 5s with since_id; pauses on hidden tab; merges incremental updates
- `src/types/index.ts` — Shared types (Post, BootboardData, Identity, etc.)
- `src/lib/utils.ts` — Shared utilities (cn, generateAnonName, timeAgo)
- `src/lib/db.ts` — SQLite setup with WAL, foreign keys, auto-migration, indexes on bootboard
- `src/services/bsv/identity.ts` — BSV keypair generation & signing (cached SDK + PrivateKey)
- `src/services/bsv/wallet.ts` — Server wallet (BSV_SERVER_WIF, UTXO fetching, ARC broadcast)
- `src/services/bsv/onchain.ts` — OP_RETURN post logging (fire-and-forget, returns txid)
- `src/data/genesis.ts` — Genesis conversation data (founding messages)
- `src/data/agent-knowledge.ts` — Agent knowledge base (Q&A pairs + keyword matching)
- `src/components/icons/BootIcon.tsx` — Boot emoji icon component
- `src/types/speech.d.ts` — SpeechRecognition API TypeScript types

## Coding Standards

- Use TypeScript strict mode
- Server components by default, `'use client'` only when needed
- Server actions for data mutations
- Tailwind for styling — no CSS modules
- Dark theme: bg-black, bg-zinc-900, text-white, border-zinc-800
- Mobile-first responsive design

## Identity System

- BSV keypair auto-generated on first visit via `@bsv/sdk` `PrivateKey.fromRandom()`
- Stored as WIF in localStorage under key `bfn_keypair`
- Anonymous names: `anon_XXXX` format (4 random alphanumeric chars)
- Posts are cryptographically signed (ECDSA via BSV SDK)
- Users can copy/download their key for backup
- Dynamic imports for `@bsv/sdk` to avoid bundling issues
- Upgrade path: raw localStorage → passphrase encryption → passkey wrapping → server HSM
- See DECISIONS.md for the full security upgrade plan

## UX Principles

- **User-facing language matters.** Never say "key", "wallet", "WIF", "private key" in the UI.
  - "save your key" → "keep your name"
  - "fund your address" → "deposit slot"
  - "key rotation" → "stronger lock"
  - "PIN" → "passphrase" (minimum 8 chars, not a 4-digit PIN)
- 2-click onboarding: visit site → type idea → click Post. Done.
- No wallet downloads, no seed phrases, no "buy crypto first"

## Security Notes

- Private keys stored in localStorage (acceptable for idea board phase, no real money yet)
- Server should verify signatures (TODO — currently decorative)
- Rate limiting needed (TODO)
- CSP headers configured in next.config.ts (Content-Security-Policy, HSTS, Permissions-Policy)
- Node polyfills shimmed via next.config.ts for browser compatibility (empty-module.mjs)
- See DECISIONS.md for full security findings and upgrade plan

## Development

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Biome linting
npm run format   # Biome formatting
```

## Context Files

Read these to understand the full picture:

- **DIRECTION.md** — Where this project is going and why
- **DECISIONS.md** — Key decisions already made (don't relitigate these)
- **FAIRNESS.md** — Revenue distribution model, fairness formula, gaming analysis, phase progression
- **ROADMAP.md** — What's done, what's next, what's planned
- **SESSION_LOG.md** — What happened in each working session

## AI Contribution Protocol

When you finish significant work on this project:

1. Update ROADMAP.md if you completed or started a task
2. Update DECISIONS.md if you made a non-obvious technical choice
3. Update FAIRNESS.md if you changed the revenue model, fairness parameters, or contribution scoring
4. Update DIRECTION.md only if the project direction changed
5. Update this file (CLAUDE.md) if you added new key files or changed architecture
6. Add a session summary to SESSION_LOG.md (date, 3-5 bullet points of what was done)
