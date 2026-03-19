# Direction

> Where this project is going and why. Read this before suggesting features or architecture changes.

## The Vision

Start with literally nothing — just a board for posting ideas. Every post is logged on-chain (BSV). A fairness agent tracks contributions. The platform evolves based on what users request. Eventually, any post can become its own project with the same model.

**"The first proof that this works is the platform itself."**

The platform is not built then launched. It is planted as a seed and grown with the community. Every person who posts an idea, suggests a feature, or helps shape direction becomes a contributor with on-chain proof of participation. Contributions are tracked from post #1.

## The Core Loop

1. User posts idea
2. Logged on-chain (immutable record)
3. Fairness agent watches (learns who contributed what)
4. Features get built (by team, agents, or community)
5. Platform evolves
6. Contributors get credit (based on on-chain history)
7. Repeat

## Onboarding Philosophy

The biggest barrier to crypto adoption is complexity. We eliminate it:

- Visit site → see a text box → type idea → click Post → done
- BSV keypair generated automatically behind the scenes
- No wallet downloads. No seed phrases. No "buy crypto first."
- Server pays for on-chain transactions (~$0.0005 per post)
- Target: ~15% conversion vs industry ~0.3% (50x improvement)

## The Recursive Model

Once the platform works, any post can become its own project. Someone posts "We should build a recipe app" — if it gains traction, it spawns into its own platform with the same contribution tracking, fairness agent, and model.

"Every idea is a seed. Every seed can grow into a forest."

## Open Source Strategy

This project will be open source. The repo is designed to be **AI-native** — when anyone clones it, their AI assistant should immediately understand full context, direction, and what to work on.

Context lives in the repo (CLAUDE.md, DIRECTION.md, DECISIONS.md, ROADMAP.md). AI is instructed to update these as it works, so documentation stays current automatically.

Enforcement is phased: start with instructions only, add hooks when contributors arrive, add CI when patterns of breakage emerge.

## What This Is NOT

- Not a crypto wallet app
- Not a social media platform (yet — it may evolve into one)
- Not a fundraising tool
- Not built on bOpen.ai — bOpen is the toolkit, the product is BS Vibes
