# Build From Nothing — Project Guidelines

## What This Is
A platform that starts from nothing — just a post board — and evolves based on user contributions. Every post is logged on-chain (BSV). A fairness agent tracks contributions. Eventually, any idea can spawn into its own "Build From Nothing" project.

## Architecture
- **Framework:** Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- **Database:** SQLite (better-sqlite3) for local dev, file: `local.db`
- **Blockchain:** BSV via `@bsv/sdk` — keypair generation, signing, on-chain logging
- **Identity:** Auto-generated BSV keypair stored in browser localStorage
- **Styling:** Dark theme (zinc/black palette), GPT-style minimal UI

## Key Files
- `src/app/page.tsx` — Main board page (server component, fetches posts)
- `src/app/PostForm.tsx` — Client component for posting ideas
- `src/app/IdentityBar.tsx` — Shows identity, key backup options
- `src/app/actions.ts` — Server actions (createPost, getPosts)
- `src/hooks/useIdentity.ts` — React hook for identity management
- `src/services/bsv/identity.ts` — BSV keypair generation & signing
- `src/lib/db.ts` — SQLite database setup with auto-migration
- `src/lib/utils.ts` — cn() helper (clsx + tailwind-merge)
- `src/components/ui/` — Reusable UI components (Button, Card, Input)
- `src/types/index.ts` — Shared TypeScript types

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
- Anonymous names: `anon_XXXX` format
- Posts are cryptographically signed (ECDSA via BSV SDK)
- Users can copy/download their key for backup
- Dynamic imports for `@bsv/sdk` to avoid bundling issues

## Security Notes
- Private keys stored in localStorage (upgrade path: PIN → passkey → HSM)
- Server should verify signatures (TODO)
- Rate limiting needed (TODO)
- CSP headers configured in next.config.ts
- Node polyfills shimmed via next.config.ts for browser compatibility

## Development
```bash
npm run dev    # Start dev server
npm run build  # Production build
npm run start  # Start production server
```

## Vision
1. Start with simple post board (current)
2. Log posts on-chain (BSV OP_RETURN)
3. Fairness agent tracks contributions
4. Revenue distribution based on contribution history
5. Any post can spawn into its own project (recursive model)



