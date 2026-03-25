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

- `src/app/page.tsx` — Main entry (server component, fetches posts + bootboard)
- `src/app/Feed.tsx` — Client component: scrollable feed, header, pinned sections, scroll tracking
- `src/app/PostForm.tsx` — Compose box with enter-to-post, voice-to-text mic, agent chat trigger
- `src/app/IdentityBar.tsx` — Identity chip in header with dropdown key backup
- `src/app/Bootboard.tsx` — Bootboard spotlight: pay-to-feature post, live timer, shake/glow animations
- `src/app/Genesis.tsx` — Founding conversation display (collapsible, at top of feed)
- `src/app/AgentChat.tsx` — AI-powered Q&A agent (modal, Claude Haiku API)
- `src/app/agent-action.ts` — Server action for agent chat (Claude API call with project context)
- `src/app/actions.ts` — Server actions (createPost, getPosts, getBootboard, bootPost)
- `src/data/genesis.ts` — Genesis conversation data (founding messages)
- `src/data/agent-knowledge.ts` — Agent knowledge base (Q&A pairs + keyword matching)
- `src/components/icons/BootIcon.tsx` — Boot emoji icon component
- `src/hooks/useIdentity.ts` — React hook for identity management
- `src/services/bsv/identity.ts` — BSV keypair generation & signing
- `src/lib/db.ts` — SQLite database setup with auto-migration (posts + bootboard tables)
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
- CSP headers configured in next.config.ts
- Node polyfills shimmed via next.config.ts for browser compatibility
- See DECISIONS.md for full security findings and upgrade plan

## Development

```bash
npm run dev    # Start dev server
npm run build  # Production build
npm run start  # Start production server
```

## Context Files

Read these to understand the full picture:

- **DIRECTION.md** — Where this project is going and why
- **DECISIONS.md** — Key decisions already made (don't relitigate these)
- **ROADMAP.md** — What's done, what's next, what's planned
- **SESSION_LOG.md** — What happened in each working session

## AI Contribution Protocol

When you finish significant work on this project:

1. Update ROADMAP.md if you completed or started a task
2. Update DECISIONS.md if you made a non-obvious technical choice
3. Update DIRECTION.md only if the project direction changed
4. Update this file (CLAUDE.md) if you added new key files or changed architecture
5. Add a session summary to SESSION_LOG.md (date, 3-5 bullet points of what was done)
