# Fairness Model

> How contributions are measured and revenue is distributed. This is a **starting point** — a working demo of agentic fairness, not a final system. As the platform evolves and real value contributions emerge (code, design, community building), this model will likely be replaced with something far more sophisticated. The point is to prove the concept works, learn from real usage, and iterate.
>
> Last updated: 2026-03-26

## The Core Idea

When someone pays to boot a post, that payment goes directly to every contributor — not to a company, not to a treasury. A single BSV transaction splits the fee across all contributors based on their measured contribution. No middleman. No delay.

## Current Model: Hybrid (Post Count + Engagement + Recency)

This is a demo model. It's simple enough to understand, fair enough to not be gameable, and transparent enough to build trust. It will be replaced as better contribution signals emerge.

### The Formula

```
For each post by a user:
  age_days = (now - post.created_at) / 86400
  decay = 0.5 ^ (age_days / half_life)
  engagement = 1 + (post.boot_count * engagement_multiplier)
  post_weight = sqrt(engagement) * decay

User's total weight = sum of all their post weights
User's share = their weight / total weight of all contributors
```

### Parameters (Tunable Knobs)

| Parameter | Starting Value | What it does | Range |
|-----------|---------------|--------------|-------|
| Platform cut | 5% | Funds server costs, on-chain fees, development | 0-10% |
| Boosted creator bonus | 15% | Extra reward for the post being spotlighted | 0-25% |
| Contributor pool | 80% | Remainder split across all contributors | Derived |
| Time decay half-life | 30 days | How fast old posts lose weight | 7-90 days |
| Engagement multiplier | 1.5x per boot | How much boots amplify a post's weight | 1-3x |
| Scaling function | sqrt | Diminishing returns on quantity | sqrt or cbrt |
| Minimum payout | 100 sats | Below this, balance accumulates until next boot | 10-500 sats |

All parameters are exposed for the fairness agent to adjust in later phases. They are the governance surface — the agent tunes knobs, it doesn't rewrite the formula.

### Payout Split (on a 10,000 sat boot)

| Bucket | % | Sats | Goes to |
|--------|---|------|---------|
| Platform | 5% | 500 | Server wallet (infrastructure costs) |
| Boosted creator bonus | 15% | 1,500 | The person whose post is being spotlighted |
| Contributor pool | 80% | 8,000 | All contributors by weight |

The boosted creator also gets their normal pool share on top of the bonus.

## Payout Flow

1. User clicks boot on a post
2. User pays X satoshis (boot fee)
3. Server calculates contribution weights for all contributors
4. Server builds a single BSV transaction with multiple outputs:
   - One output per qualifying contributor (at their share)
   - One output for the platform (5%)
   - One OP_RETURN output with audit metadata
   - Change output back to server if needed
5. Transaction broadcasts to BSV network
6. Every contributor gets paid directly in that single transaction
7. Contributors below the minimum payout threshold accumulate balance for next boot

### OP_RETURN Audit Trail

Every split transaction includes an OP_RETURN with metadata:

```json
{
  "app": "bsvibes",
  "action": "boot_split",
  "post_id": 42,
  "agent_version": "0.1.0",
  "total": 10000,
  "distributed": 9200,
  "recipients": 28,
  "deferred": 3,
  "ts": 1711461600000
}
```

This makes every split publicly verifiable on-chain. Anyone can look up the transaction and confirm the percentages match the stated contribution table.

## Gaming Analysis

| Attack | Effective? | Why |
|--------|-----------|-----|
| **Spam posts** | No | sqrt scaling + 5-post daily cap + 30-day decay = diminishing returns. 1000 spam posts barely moves the needle |
| **Self-boot** | No | Pay 10,000, get back ~3,500 max (your share + bonus). Net loss every time unless you believe in massive future volume |
| **Sybil (fake identities)** | Weak | Each identity limited to 5 posts/day, sqrt scaling per identity. Expensive to maintain, low reward |
| **Collusion ring** | Neutral | Two users booting each other's posts spend real money. The rest of the community benefits from their boot payments via the pool |
| **One great post** | Intended | A single viral post that gets booted 50 times builds significant weight through the engagement multiplier. This is the behavior we WANT |

## Scaling

| Contributors | Per-user share (if equal) | Outputs per tx | Tx fee |
|-------------|--------------------------|----------------|--------|
| 5 | 1,600 sats | 7 | ~400 sats |
| 50 | 160 sats | 52 | ~2,100 sats |
| 500 | 16 sats | ~95 above threshold | ~4,200 sats |
| 5,000 | 1.6 sats | ~2 above threshold | ~250 sats |

At high contributor counts, most users fall below the 100-sat minimum payout threshold. Their shares accumulate in the database and pay out when they cross the threshold on a future boot. The transaction stays lean.

## Phase Progression

This model maps to the Agentic Fairness phases from DECISIONS.md:

| Phase | Who controls the knobs | How |
|-------|----------------------|-----|
| **Phase 1 (now)** | Humans set all parameters | Hardcoded in config, changed by developers |
| **Phase 2** | AI suggests parameter changes | Agent analyzes patterns, proposes "reduce decay to 21 days — here's why", humans approve/reject |
| **Phase 3** | AI adjusts within bounds | Agent can change half-life between 14-45 days, platform cut between 3-7%, without human approval |
| **Phase 4** | Fully agentic | Agent controls all parameters, humans only intervene on disputes |

## Technical Implementation

### Database Schema

```sql
-- Accumulated balances for contributors below payout threshold
CREATE TABLE IF NOT EXISTS contributor_balances (
  pubkey TEXT PRIMARY KEY,
  address TEXT NOT NULL,
  pending_sats INTEGER DEFAULT 0,
  total_earned_sats INTEGER DEFAULT 0,
  last_payout_at TEXT
);

-- Individual payout records
CREATE TABLE IF NOT EXISTS payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  boot_event_id INTEGER NOT NULL,
  recipient_pubkey TEXT NOT NULL,
  amount_sats INTEGER NOT NULL,
  payout_type TEXT NOT NULL, -- 'pool_share' | 'boost_bonus' | 'platform'
  txid TEXT, -- BSV transaction ID (null until broadcast)
  created_at TEXT DEFAULT (datetime('now'))
);
```

### Key Files (when implemented)

- `src/services/fairness/weights.ts` — Weight calculation from posts
- `src/services/fairness/split.ts` — Payout split logic
- `src/services/fairness/config.ts` — Tunable parameters

### BSV Transaction

- Server-side for Phase 1 (server builds the multi-output split transaction)
- Migrate to client-side when self-funded posting is live
- Uses `@bsv/sdk` Transaction with N P2PKH outputs
- OP_FALSE OP_RETURN for audit trail (BSV standard, provably unspendable)

## What This Model Does NOT Measure (Yet)

This is a simple post-count + engagement model. It's a starting demo. Real value contributions that future versions should consider:

- **Code commits** — someone who builds a feature contributes more than someone who posts an idea
- **Quality scoring** — semantic analysis of post content, not just count
- **Community building** — bringing in new contributors, answering questions
- **Design work** — visual contributions, UX improvements
- **Knowledge sharing** — technical expertise, documentation
- **Cross-project value** — contributions that benefit multiple spawned projects

The current model is deliberately simple so we can prove the mechanism works (payments split correctly, on-chain, verifiable) before adding complexity to the scoring.

## Open Questions

- **Boot price**: Fixed (e.g., 10,000 sats) or dynamic (increases the longer someone holds the spot)?
- **Multiple boots in quick succession**: Does each boot trigger a separate split transaction, or batch them?
- **Unsigned posts**: Should posts without a valid signature earn contribution weight? Currently they would — but the contributor can't receive payment without an address.
- **Genesis contributors**: Should the founding conversation participants get a permanent base weight, or do they enter the decay curve like everyone else?
- **When to start**: Do we enable payments from day one, or run the weight calculation visibly (show users their share) before real money flows?
