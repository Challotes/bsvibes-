# Security Audit — 2026-03-28

> Combined findings from code auditor (Jerry) and security ops (Paul). 53 total findings.
> Fix criticals before any real users. Fix highs this sprint. Fix mediums before public launch.

## CRITICAL (9 findings — must fix before real users)

### C1: CSP allows unsafe-inline + unsafe-eval — PARTIALLY FIXED
**File:** next.config.ts line 37
**Risk:** XSS = instant key theft. Any injected script reads localStorage WIF.
**Fix:** Removed unsafe-eval. unsafe-inline remains (needed for Next.js). Nonce-based CSP is the full fix (future).

### C2: WIF cached in JS module-scope variables
**File:** src/services/bsv/identity.ts lines 39-45
**Risk:** `_cachedWif` and `_sessionIdentity.wif` in memory for entire session. Any script can read.
**Fix:** Cache CryptoKey object instead of WIF string where possible. Accepted risk for plaintext path.

### C3: /api/boot-confirm accepts any txid without verification — FIXED
**File:** src/app/api/boot-confirm/route.ts
**Risk:** Attacker can fake boot confirmations, inflate contribution weight, game fairness system at zero cost.
**Fix:** (2026-04-03) Full fix: replay protection (txid dedup check + application-level SELECT before insert), rate limiting (10/min/IP), and on-chain output verification (parses WoC tx vout, compares addresses/amounts against recalculated split with 2 sat tolerance). DB-level uniqueness is composite `UNIQUE(txid, recipient_address)` at db.ts:117 — replay protection relies on the app-level check, not the index alone.

### C4: Auto-download backup only has NEW key when fund transfer fails
**File:** src/app/IdentityBar.tsx lines 171-185
**Risk:** User told "old key is in backup file" but backup contains new key. Stranded funds unrecoverable.
**Fix:** Include old WIF in backup when transfer fails, or don't remove plaintext key until transfer succeeds.

### C5: Free boot consumes grant even when broadcast fails — FIXED
**File:** src/services/fairness/boot-orchestrator.ts lines 92-150
**Risk:** User loses free boot but nobody gets paid. Boot appears successful but no on-chain payment.
**Fix:** (2026-03-28) Grant consumed only after successful broadcast.

### C6: Interrupted upgrade locks user out
**File:** src/services/bsv/identity.ts lines 366-372
**Risk:** Power failure between setItem(encrypted) and removeItem(plaintext) = both keys exist. System only checks encrypted, user locked out despite plaintext key being present.
**Fix:** getIdentity() should prefer plaintext key when both exist (upgrade was interrupted).

### C7: Double-upgrade from same key orphans intermediate posts — FIXED
**File:** src/app/actions.ts + src/services/fairness/weights.ts
**Risk:** INSERT OR REPLACE deletes A→B migration when A→C is inserted. Posts made with key B have no migration chain, are permanently orphaned.
**Fix:** (2026-03-28) Before replacing migration, check if old to_pubkey has posts. If so, insert B→C bridging migration.

### C8: cleanupMigrations has no authentication — FIXED
**File:** src/app/actions.ts lines 229-243
**Risk:** Anyone who knows a pubkey can delete that user's migration records via the server action. Targeted payout redirection attack.
**Fix:** (2026-03-28) Requires signed challenge with 5-minute timestamp replay protection.

### C9: Backup warning dot clears on dropdown OPEN, not on actual backup — FIXED
**File:** src/app/IdentityBar.tsx lines 110-115
**Risk:** User thinks they're backed up after opening dropdown, but never actually copied or downloaded.
**Fix:** `markBackedUp()` now only fires from `handleDownload()`, `handleSaveEncrypted()`, and `handleCopy()` handlers — no longer on dropdown open. Verified 2026-04-10.

## HIGH (7 findings — fix this sprint)

### H1: Rate limiting keyed on client-supplied author name — FIXED
**File:** src/app/actions.ts line 24
**Fix:** (2026-03-28) Now keyed on verified pubkey.

### H2: /api/boot-shares exposes all contributor addresses unauthenticated — PARTIAL
**File:** src/app/api/boot-shares/route.ts
**Fix:** Rate limiting added (30/min/IP) at boot-shares/route.ts:12. Signed request for detailed shares still TODO. Updated 2026-04-10.

### H3: Console logs leak addresses and amounts client-side
**File:** Multiple (identity.ts, IdentityBar.tsx)
**Fix:** Remove financial detail from console.log in production.

### H4: Server wallet private key in process memory
**File:** src/services/bsv/wallet.ts
**Fix:** Document risk. Move to signing oracle when value increases.

### H5: Unsigned posts accepted with no attribution
**File:** src/app/actions.ts lines 27-43
**Fix:** Require pubkey on all posts. Reject or flag unsigned.

### H6: /api/tx-hex is an open proxy with no rate limiting — FIXED
**File:** src/app/api/tx-hex/route.ts
**Fix:** (2026-03-31) Added 500/min/IP rate limit.

### H7: Migration registration after local key storage — FIXED
**File:** src/services/bsv/identity.ts + src/app/IdentityBar.tsx
**Fix:** upgradeIdentity() no longer stores key. Returns encStore. IdentityBar calls migrateIdentity() first, then commitUpgrade() only on success. Atomic ordering.

### Additional findings from tester audit (2026-03-28):

**BUG-1 (High) — FIXED:** `unlockIdentity` was dead code. No passphrase prompt existed. Added unlock UI panel to IdentityBar. needsUnlock state flows through useIdentity → context.

**BUG-2 (High) — FIXED:** Same as H7 above. Migration now registered before key storage.

**BUG-10 (Critical) — FIXED:** `migrateIdentity()` return value was never checked. If server-side signature verification failed, migration silently didn't register but upgrade continued — orphaning all posts under the old key. Fixed: upgrade now aborts if `migrateIdentity` returns `{ success: false }`. Two manual chain repairs applied to reconnect 280 orphaned posts.

**BUG-6 (Medium) — OPEN:** boot-confirm stores booterPubkey as boosted_by but field expects BSV address. Mismatch for paid boots.

**BUG-9 (Critical) — FIXED:** `isIdentityEncrypted()` always returned false. Checked raw JSON string for "enc:" prefix but stored value is JSON wrapper. Every encrypted identity guard was broken — unlock prompt never appeared, stale key generated after upgrade. Fixed by JSON-parsing and checking .encrypted field.

## MEDIUM (8 findings — before public launch)

- M1: PBKDF2 at 100k iterations (increase to 600k)
- M2: Backup file contains plaintext WIF — PARTIAL (encrypted with passphrase for protected users; unprotected users still get plaintext WIF via doDownloadPlaintext path at IdentityBar.tsx:282-297)
- M3: Migration signature has no timestamp validation
- M4: Rate limiter is in-memory, resets on restart
- M5: /api/earnings exposes full financial history unauthenticated
- M6: WIF reveal has no auto-hide timeout
- M7: /api/boot-shares triggers full weight calc with no cache — FIXED (30s TTL cache added)
- M8: Posts during upgrade window may be unsigned

## LOW (6 findings — track as debt)

- L1: WIF paste field has no input masking
- L2: Backup filename contains user's anon name
- L3: Console error may leak partial server WIF
- L4: Rate limiter cleanup uses first caller's window
- L5: Direct WoC calls leak user addresses with IP
- L6: Clipboard not cleared after WIF copy
