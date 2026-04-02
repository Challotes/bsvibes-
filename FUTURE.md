# Future

> Ideas and explorations. Nothing here is decided — these are starting points for community discussion and future development. Everything is flexible and open to change.

## Handle System

Current anonymous names (`anon_XXXX` with 4 random chars) hit 1% collision at just 184 users. Before launch, this needs solving.

**Proposed design:** Server-assigned sequential handles.
- First 36 users: `anon_a` through `anon_9` (1 char)
- Next 1,296: `anon_aa` through `anon_99` (2 chars)
- Next 46,656: 3 chars, and so on
- Short handle = early adopter status
- Graceful fallback to random 4-char if server unreachable
- Same pubkey always gets the same name back (idempotent)

**Open questions:**
- Custom handles later? Users upgrade from `anon_a` to a chosen name. Same database table could store both.
- Should custom handles be free or cost sats (anti-squatting)?
- Do we call them "handles" in the UI?

## Boot Signals as AI-Readable Economic Data

Boots are the first permissionless, Sybil-resistant, AI-readable economic preference data. They cost real money (can't fake), they're on-chain forever (can't revoke), and anyone can read them (no API key needed).

**What an AI agent could detect from boot patterns:**
- Boot velocity — rate of change signals urgency
- Unique booter ratio — consensus vs one person's conviction
- Cross-post theme emergence — "mobile app" posts getting 3x the boot rate
- Contrarian convergence — people who normally disagree converging on one idea

**What AI agents could DO with signals:**
- Priority queue for development — backlog sorted by economic commitment, not opinions
- AI coding agents pulling tasks from the bootboard autonomously
- Auto-spawning project shells when boot clusters cross thresholds
- Dynamic resource allocation — boot signals determine which tasks get agent time

**The Fairness Oracle governance model:**
- Auto-adjust (safe): operational parameters like cache TTL, polling frequency
- Propose with evidence (needs human approval): economic parameters like creator bonus, decay rate
- Never auto-adjust: platform cut, gaming penalties
- Boot signals are one input into governance, alongside project owners and human oversight

## Agentic Fairness Protocol (AFP) — Cross-Project Royalties

Early thinking on how revenue could flow between parent and child projects.

**The cascade pattern (don't flatten into one transaction):**
- Within a project: real-time split in one tx (trustless, no custody) — already works
- Between projects: daily batch to parent treasury address, parent distributes to its own contributors
- A song purchase on a Music Store spawned from BSVibes: Customer → Artist + Music Store contributors (split inline) + BSVibes treasury (one output)

**On-chain record types (conceptual):**
- `agfair.genesis` — project registration
- `agfair.spawn` — parent-child link with royalty rate
- `agfair.manifest` — hash of contributor list, published periodically
- `agfair.royalty` — audit record of cross-project payments

**Enforcement:**
- No license can enforce royalties — it's a protocol problem, not legal
- On-chain spawn records prove lineage permanently
- Protocol membership (access to contributor registry, reputation) is the incentive
- Transparency as deterrent — stripping royalties is publicly visible on-chain

**Chain depth limits (at $0.50 per tx, 10% royalty per level):**
- Level 1: ~1,400 sats (viable)
- Level 2: ~140 sats (viable)
- Level 3: ~14 sats (barely)
- Level 4: dust — practical limit is 2-3 levels for micro-transactions

## Agent Concepts

7 agent concepts identified from the BSVibes codebase. None built yet.

**Top 2 (most valuable):**
1. **Fairness Oracle Agent** — AI governs revenue distribution, adjusts config knobs within bounded ranges, detects gaming. Most novel concept. The config surface exists at `services/fairness/config.ts` but the AI governance part is unbuilt.
2. **Trustless Split Payment SDK** — `client-boot.ts` (650 lines) is nearly self-contained. Closest to extractable as a standalone npm package.

**Other concepts:**
- **Zero-Friction Identity Agent** — drop-in crypto identity without wallet install for any app
- **UTXO Health Agent** — monitors wallet fragmentation, auto-consolidates, reports cost trends
- **Contribution Scoring Agent** — fair weight calculation for open source projects, DAOs, co-ops
- **Platform Economy Agent** — BSVibes as an autonomous economy (adjusts pricing, grants, moderation)
- **On-Chain Audit Agent** — reads the chain, produces transparency reports, detects DB/chain discrepancies

## Security Upgrades (Deferred)

Features noted for when real money flows at scale:

- **Session timeout** — auto-lock after 30 min tab hidden. Currently stays unlocked until tab close. Not needed at current stakes.
- **Device sync via QR** — scan QR on Device B to import identity from Device A. Faster than file transfer.
- **Passkey wrapping (WebAuthn)** — biometric unlock instead of passphrase. Firefox fallback needed.
- **PBKDF2 increase to 600k iterations** — currently 100k. Increase when real funds flow.

## Gaming Detection (Concepts)

Boot signals can be gamed. These are detection approaches to explore:

- **Self-booting** — detectable via address graph / UTXO history tracing
- **Wash booting** — temporal clustering analysis (burst patterns vs natural distribution)
- **Collusion rings** — graph community detection on boot patterns
- **Economic irrationality** — spending more on booting than possible fairness return
- **Best approach:** make gaming data public. Transparency as deterrent.
