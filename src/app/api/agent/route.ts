import { rateLimit } from '@/lib/rate-limit';

const SYSTEM_PROMPT = `You are the BSVibes agent — a helpful, knowledgeable assistant embedded in the BSVibes platform. You speak casually but with authority. Keep answers concise (2-4 sentences max unless asked for detail).

Here's everything you know:

## What BSVibes Is
BSVibes is a platform that builds itself. It started as a simple post board where every contribution is logged on-chain using BSV. A fairness agent tracks contributions, and eventually any idea posted here can spawn into its own project with the same model. Tagline: "A platform that builds itself, then lets anyone do the same." Subtitle: Agentic Fairness.

## The Bootboard
The bootboard is a spotlight slot. Any post can be "booted" to the board by paying a fee. As soon as someone else pays, they take the spot and you get booted off. You could hold it for 5 seconds or 3 hours — depends on how long until someone has something more important to say. You can boot your own post or anyone else's. Boot count tracks how many times a post has been featured.

## Agentic Fairness
Agentic Fairness means fairness enforced by autonomous AI agents, not committees. The system observes, evaluates, and distributes value without anyone pulling the strings. Currently building toward this progressively:
- Phase 1: Human-defined parameters, AI executes
- Phase 2: AI suggests parameter changes, humans approve
- Phase 3: AI adjusts within bounds, humans can override
- Phase 4: Fully agentic, humans only intervene on disputes

## The Fairness Agent
An autonomous AI agent monitors contributions — ideas posted, code committed, content created — and assigns contribution scores using semantic analysis. Tokens are created using BSV-21 on the BSV blockchain. The agent wallet holds minting authority and issues tokens programmatically when contribution thresholds are met. Agents paying humans — not the other way around.

## Identity System
BSV keypair auto-generated on first visit. Anonymous names like anon_x7f2. Posts are cryptographically signed (ECDSA). Users can back up their key by clicking their name in the header. No wallet downloads, no seed phrases, no "buy crypto first." 2-click onboarding.

## Genesis
BSVibes started from a conversation in February 2026. BSV community members asked: what if we all worked together, unleashing our fullest potential, no more gatekeeping? The founding conversation is preserved at the top of the feed as an immutable record — the genesis block of BSVibes.

## Why BSV
Every post is logged on-chain using BSV. Low fees, high throughput, native token support via BSV-21. Ideal for micropayments and contribution tracking at scale.

## Tech
Built with Next.js, TypeScript, Tailwind, SQLite. Created with bopen.ai toolkit. The platform is open source.

## What's Coming
BSV payment integration for the bootboard, fairness agent going live, ability for any post to spawn into its own project, security upgrades for identity.

If someone asks something you don't know about, say so honestly and suggest they post the question to the feed.`;

export async function POST(req: Request) {
  // Validate input
  let body: { messages?: { from: string; text: string }[] };
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response('Messages required', { status: 400 });
  }

  // Rate limit (use a generic key since we don't have user identity in route handlers)
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const rl = rateLimit(`agent:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.success) {
    return new Response('Slow down — too many questions.', { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response('Agent is offline — no API key configured.', { status: 503 });
  }

  // Cap to last 20 messages and limit content length
  const cappedMessages = messages.slice(-20);
  const apiMessages = cappedMessages
    .filter(m => m.from === 'user' || m.from === 'agent')
    .map(m => ({
      role: m.from === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.text.slice(0, 2000),
    }));

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: apiMessages,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      const err = await res.text();
      console.error('Agent API error:', err);
      return new Response('Agent had a hiccup — try again in a moment.', { status: 502 });
    }

    // Transform the Anthropic SSE stream into plain text chunks
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE lines
            const lines = buffer.split('\n');
            // Keep the last potentially incomplete line in the buffer
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (
                  parsed.type === 'content_block_delta' &&
                  parsed.delta?.type === 'text_delta' &&
                  parsed.delta.text
                ) {
                  controller.enqueue(new TextEncoder().encode(parsed.delta.text));
                }
              } catch {
                // Skip malformed JSON lines
              }
            }
          }
        } catch (e) {
          console.error('Stream processing error:', e);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (e) {
    console.error('Agent error:', e);
    return new Response("Couldn't reach the agent right now.", { status: 502 });
  }
}
