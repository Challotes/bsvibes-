import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Minimal personality prompt — who the agent is and how it behaves.
 * All factual knowledge comes from the project MDs loaded dynamically.
 */
const PERSONALITY = `You are the BSVibes agent — a helpful, knowledgeable assistant embedded in the BSVibes platform. You speak casually but with authority. Keep answers concise (2-4 sentences max unless asked for detail).

Rules:
- Only answer based on the project context provided below. Don't make up features or stats.
- If you don't know something, say so honestly and suggest they post the question to the feed.
- Be direct — no corporate filler. Match the BSVibes voice: real, transparent, no bullshit.
- When explaining fairness or money flows, be specific about how it actually works.
- If someone asks "is this a scam?", walk them through exactly how the money flows and point them to the open source code.`;

/**
 * Map of question categories → which MDs to load.
 * CLAUDE.md is always included as the base context.
 */
const MD_ROUTES: Array<{ pattern: RegExp; files: string[] }> = [
  { pattern: /fair|earn|boot|pay|split|money|revenue|sat|price|contribut/i, files: ['FAIRNESS.md'] },
  { pattern: /road|next|plan|future|coming|when|phase|todo/i, files: ['ROADMAP.md'] },
  { pattern: /secur|safe|key|backup|encrypt|password|protect|lock|recover/i, files: ['SECURITY_AUDIT.md'] },
  { pattern: /why|vision|mission|differ|compet|north.star|direction|purpose/i, files: ['DIRECTION.md'] },
  { pattern: /decid|chose|why did|technic|architect|how does|design/i, files: ['DECISIONS.md'] },
];

/**
 * Read an MD file from the project root. Returns empty string if not found.
 */
function loadMd(filename: string): string {
  try {
    return readFileSync(join(process.cwd(), filename), 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Select which MDs to load based on the user's question.
 * Always includes CLAUDE.md (base context). Adds up to 2 topic-specific MDs.
 */
function selectContext(question: string): string {
  const files = new Set<string>(['CLAUDE.md']);

  for (const route of MD_ROUTES) {
    if (route.pattern.test(question)) {
      for (const f of route.files) files.add(f);
    }
    if (files.size >= 3) break; // cap at 3 MDs
  }

  const sections = [...files].map((f) => {
    const content = loadMd(f);
    return content ? `\n--- ${f} ---\n${content}` : '';
  });

  return sections.join('\n');
}

/**
 * Build the full system prompt for a given user question.
 * Combines the static personality with dynamically loaded project context.
 */
export function buildAgentPrompt(latestQuestion: string): string {
  const context = selectContext(latestQuestion);
  return `${PERSONALITY}\n\n## Project Context\n${context}`;
}

// Legacy export for backwards compatibility (uses full context)
export const AGENT_SYSTEM_PROMPT = `${PERSONALITY}\n\n## Project Context\n${loadMd('CLAUDE.md')}`;
