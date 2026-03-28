# Security Audit — 2026-03-28

> Combined findings from code auditor (Jerry) and security ops (Paul). 53 total findings.
> Fix criticals before any real users. Fix highs this sprint. Fix mediums before public launch.

## CRITICAL (9 findings — must fix before real users)

### C1: CSP allows unsafe-inline + unsafe-eval
**File:** next.config.ts line 37
**Risk:** XSS = instant key theft. Any injected script reads localStorage WIF.
**Fix:** Nonce-based CSP. Remove unsafe-eval and unsafe-inline.

### C2: WIF cached in JS module-scope variables
**File:** src/services/bsv/identity.ts lines 39-45
**Risk:** `_cachedWif` and `_sessionIdentity.wif` in memory for entire session. Any script can read.
**Fix:** Cache CryptoKey object instead of WIF string where possible. Accepted risk for plaintext path.

### C3: /api/boot-confirm accepts any txid without verification
**File:** src/app/api/boot-confirm/route.ts
**Risk:** Attacker can fake boot confirmations, inflate contribution weight, game fairness system at zero cost.
**Fix:** Server must verify txid on-chain before recording. Fetch tx from WoC, confirm outputs match expected split.

### C4: Auto-download backup only has NEW key when fund transfer fails
**File:** src/app/IdentityBar.tsx lines 171-185
**Risk:** User told "old key is in backup file" but backup contains new key. Stranded funds unrecoverable.
**Fix:** Include old WIF in backup when transfer fails, or don't remove plaintext key until transfer succeeds.

### C5: Free boot consumes grant even when broadcast fails
**File:** src/services/fairness/boot-orchestrator.ts lines 92-150
**Risk:** User loses free boot but nobody gets paid. Boot appears successful but no on-chain payment.
**Fix:** Only update bootboard and consume grant when broadcast succeeds.

### C6: Interrupted upgrade locks user out
**File:** src/services/bsv/identity.ts lines 366-372
**Risk:** Power failure between setItem(encrypted) and removeItem(plaintext) = both keys exist. System only checks encrypted, user locked out despite plaintext key being present.
**Fix:** getIdentity() should prefer plaintext key when both exist (upgrade was interrupted).

### C7: Double-upgrade from same key orphans intermediate posts
**File:** src/app/actions.ts + src/services/fairness/weights.ts
**Risk:** INSERT OR REPLACE deletes A→B migration when A→C is inserted. Posts made with key B have no migration chain, are permanently orphaned.
**Fix:** Before replacing migration, check if old to_pubkey has posts. If so, insert B→C migration.

### C8: cleanupMigrations has no authentication
**File:** src/app/actions.ts lines 229-243
**Risk:** Anyone who knows a pubkey can delete that user's migration records via the server action. Targeted payout redirection attack.
**Fix:** Require signed challenge proving ownership of the private key.

### C9: Backup warning dot clears on dropdown OPEN, not on actual backup
**File:** src/app/IdentityBar.tsx lines 110-115
**Risk:** User thinks they're backed up after opening dropdown, but never actually copied or downloaded.
**Fix:** Only set BACKED_UP_KEY after handleDownload() or handleCopy() completes.

## HIGH (7 findings — fix this sprint)

### H1: Rate limiting keyed on client-supplied author name
**File:** src/app/actions.ts line 24
**Fix:** Key on IP address or verified pubkey.

### H2: /api/boot-shares exposes all contributor addresses unauthenticated
**File:** src/app/api/boot-shares/route.ts
**Fix:** Add rate limiting. Consider signed request for detailed shares.

### H3: Console logs leak addresses and amounts client-side
**File:** Multiple (identity.ts, IdentityBar.tsx)
**Fix:** Remove financial detail from console.log in production.

### H4: Server wallet private key in process memory
**File:** src/services/bsv/wallet.ts
**Fix:** Document risk. Move to signing oracle when value increases.

### H5: Unsigned posts accepted with no attribution
**File:** src/app/actions.ts lines 27-43
**Fix:** Require pubkey on all posts. Reject or flag unsigned.

### H6: /api/tx-hex is an open proxy with no rate limiting
**File:** src/app/api/tx-hex/route.ts
**Fix:** Add IP-keyed rate limiting (60 req/min).

### H7: Migration registration after local key storage — crash breaks attribution
**File:** src/services/bsv/identity.ts
**Fix:** Register migration before storing new key locally.

## MEDIUM (8 findings — before public launch)

- M1: PBKDF2 at 100k iterations (increase to 600k)
- M2: Backup file contains plaintext WIF (encrypt for secured identities)
- M3: Migration signature has no timestamp validation
- M4: Rate limiter is in-memory, resets on restart
- M5: /api/earnings exposes full financial history unauthenticated
- M6: WIF reveal has no auto-hide timeout
- M7: /api/boot-shares triggers full weight calc with no cache
- M8: Posts during upgrade window may be unsigned

## LOW (6 findings — track as debt)

- L1: WIF paste field has no input masking
- L2: Backup filename contains user's anon name
- L3: Console error may leak partial server WIF
- L4: Rate limiter cleanup uses first caller's window
- L5: Direct WoC calls leak user addresses with IP
- L6: Clipboard not cleared after WIF copy
