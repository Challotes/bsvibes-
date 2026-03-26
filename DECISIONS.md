# Decisions

> Key decisions already made. Don't relitigate these unless the reasoning no longer applies. If you're an AI, respect these — they came from deliberate discussion, not defaults.

## Naming

- **Project name:** BSVibes (formerly "Build From Nothing" — renamed 2026-03-23)
- **Subtitle:** Agentic Fairness — fairness enforced by autonomous AI agents, not committees
- **bOpen.ai** is the toolkit, not the product. "created with bopen.ai" shown in UI
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

## Bootboard (settled)

- **Mechanic:** Any post can be "booted" to a spotlight slot by paying a fee. Someone else pays, you get booted off
- **Boot count:** Tracked per post — shows how many times a post has been featured
- **Revenue model:** Built into the UX, not bolted on. Creates natural urgency and competition
- **Animations:** Shake + glow + slide-in on holder change. Expandable history
- **Boot icon:** Uses 🥾 emoji (custom SVG attempted, reverted to emoji for clarity at small sizes)

## Agent Chat (settled)

- **AI-powered:** Uses Claude Haiku 4.5 via Anthropic API with streaming SSE responses
- **System prompt:** Single source of truth in `src/data/agent-prompt.ts`
- **Endpoint:** `/api/agent` route handler (POST, streams text chunks)
- **Cost:** ~$0.001 per question (~25,000 questions per $25 credits)
- **Rate limiting:** 30 requests/min per IP + max 3 concurrent requests (prevents Anthropic API overload)
- **Input limits:** Max 20 messages, 2000 chars each per request
- **Location:** "Ask AI" pill button below compose box, opens as centered modal (bottom sheet on mobile)
- **Post button:** Telegram-style — mic icon when empty, amber send arrow when text is present

## Genesis Section (settled)

- **Founding conversation** preserved at top of feed as immutable record
- **Visited state** persisted in localStorage — shows full "Genesis" pill first visit, discreet chevron after
- **Fairness agent tie-in:** This is the starting point for contribution tracking
- **NOT collapsible — by design.** Genesis is feed content, not a UI widget. It lives at the top of the scroll area. Users discover it by scrolling up (via the Genesis button), not by toggling a panel. Do not add a collapse/expand toggle.

## Feed UX Model (settled)

- **Telegram-style:** User enters at the most recent post (bottom of feed). Feed grows upward.
- **Unread tracking:** When user leaves and returns, new posts accumulate. Unread counter badge shows on the scroll-to-bottom button. IntersectionObserver marks posts as read when they scroll into view.
- **Navigation:** Scroll-to-bottom button (with unread count) and genesis chevron (scroll to top) are the two navigation anchors. Users explore the full history by scrolling between them.
- **Mobile enter-to-post:** The Telegram-style mic→arrow toggle on the compose button is the primary affordance. The "Enter to post" text hint is desktop-only — this is intentional, not a bug. Mobile users tap the amber arrow.
- **No collapse, no accordion, no "read more" gates** on any feed content. The feed is a continuous scroll.

## Agentic Fairness (settled direction)

- **Phase 1:** Human-defined parameters, AI executes (current target)
- **Phase 2:** AI suggests parameter changes, humans approve
- **Phase 3:** AI adjusts within bounds, humans can override
- **Phase 4:** Fully agentic, humans only intervene on disputes
- The name describes the vision, not just today's implementation
- **Revenue model:** Boot fees split directly to contributors via multi-output BSV transaction. See **FAIRNESS.md** for the full model, formula, parameters, and gaming analysis
- **This is a demo model** — simple post-count + engagement + recency. Will evolve as real value contributions emerge (code, design, community). The point is proving the mechanism works first

## Tech Stack (settled)

- Next.js 16 + TypeScript + Tailwind v4 + SQLite + BSV
- Telegram/X/GPT hybrid UI — feed-first, dark theme, pinned compose
- Server components by default, client only when needed
- Dynamic imports for @bsv/sdk
- **Linter:** Biome (replaced ESLint 2026-03-25 — ESLint script was broken, Biome is faster and simpler)
- **React Compiler:** Enabled (auto-memoization, free perf wins with React 19)
- **Identity:** Shared via IdentityProvider context (replaces 4 independent useIdentity() calls that each loaded BSV SDK)
- **ISR:** 10-second background revalidation on page.tsx (other users see new posts without manual refresh)
- **bootPost:** Wrapped in SQLite transaction with input validation (prevents race conditions on concurrent boots)
- **Foreign keys:** PRAGMA foreign_keys = ON (was decorative before)
- **Real-time:** Client polls /api/posts every 5s with since_id (pauses when tab hidden). Exposes `refresh()` for on-demand polling after post/boot
- **Optimistic UI:** Posts appear instantly at full opacity (no spinner — server confirms in ~50ms). Pruned on next poll (500ms early poll after post). Boot count increments optimistically
- **revalidatePath removed:** ISR `revalidate = 10` handles cold loads for new visitors. Polling handles active users. revalidatePath was adding 50-200ms of blocking server work per action with zero user benefit
- **BSV SDK caching:** Client-side SDK loaded once via singleton promise (`getBsvSdk()`), kicked off on page load. PrivateKey parsed from WIF once per session. Eliminated ~280ms cold import + repeated BigNumber work on every post
- **Pagination:** Cursor-based by post ID (not timestamp — IDs are monotonic, no collision risk)
- **Deployment:** Railway with persistent /data volume for SQLite. Dockerfile as alternative. DB path via DATABASE_PATH env var
- **PWA:** manifest.json + SVG icon. No service worker / offline support yet — just home screen install

## Critical Bugs Known

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Server never verifies signatures | Critical | FIXED (2026-03-25) — ECDSA verification via @bsv/sdk |
| 2 | No rate limiting | Critical | FIXED (2026-03-25) — in-memory sliding window per-author |
| 3 | WIF displayed raw in DOM | High | FIXED (2026-03-25) — masked by default, reveal toggle |
| 4 | Backup file contains raw WIF | High | TODO |
| 5 | JSON.parse without try/catch | Medium | FIXED (2026-03-25) — returns null on parse failure |
| 6 | Database file in project root | Low | TODO |

## Wallet Integration (future)

- Yours Wallet integration via `@1sat/connect` for power users
- Coexists with in-app wallet — not a replacement
- Not needed until later phases
