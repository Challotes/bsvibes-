export interface KnowledgeEntry {
  keywords: string[];
  question: string;
  answer: string;
}

export const knowledge: KnowledgeEntry[] = [
  {
    keywords: ['what', 'bsvibes', 'this', 'site', 'about', 'platform', 'what is'],
    question: 'What is BSVibes?',
    answer: 'BSVibes is a platform that builds itself. It started as a simple post board where every contribution is logged on-chain using BSV. A fairness agent tracks contributions, and eventually any idea posted here can spawn into its own project with the same model. The tagline: "A platform that builds itself, then lets anyone do the same."',
  },
  {
    keywords: ['bootboard', 'boot', 'spotlight', 'boost'],
    question: 'How does the bootboard work?',
    answer: 'The bootboard is a spotlight slot. Any post can be "booted" to the board by paying a fee. But here\'s the catch — as soon as someone else pays, they take the spot and you get booted off. You could hold it for 5 seconds or 3 hours. It depends on how long until someone has something more important to say. You can boot your own post or anyone else\'s.',
  },
  {
    keywords: ['fairness', 'agent', 'ai', 'contribution', 'track', 'score'],
    question: 'What is the fairness agent?',
    answer: 'The fairness agent is an autonomous AI that monitors contributions — ideas posted, code committed, content created — and assigns contribution scores. When the platform generates revenue, the fairness agent determines how to distribute it based on who contributed what. Think of it as an impartial judge that tracks value from post #1.',
  },
  {
    keywords: ['token', 'pay', 'payment', 'earn', 'money', 'reward', 'bsv21'],
    question: 'How do tokens and payments work?',
    answer: 'The vision: an AI agent controls token creation using BSV-21 tokens on the BSV blockchain. When you contribute (post ideas, write code, create content), the agent evaluates your input and issues tokens proportionally. The agent wallet holds minting authority and pays contributors programmatically. Agents paying humans — not the other way around.',
  },
  {
    keywords: ['identity', 'key', 'name', 'anon', 'anonymous', 'backup', 'save'],
    question: 'How does identity work?',
    answer: 'When you first visit, a BSV keypair is auto-generated and stored in your browser. You get an anonymous name like anon_x7f2. Your posts are cryptographically signed, proving you wrote them. Click your name in the top right to back up your key. If you clear your browser without saving it, your identity is gone — so save it somewhere safe.',
  },
  {
    keywords: ['genesis', 'origin', 'start', 'began', 'conversation', 'how', 'created'],
    question: 'How did BSVibes start?',
    answer: 'It started with a conversation in February 2026. A group of BSV community members asked: what if we all worked together, unleashing our fullest potential, no more gatekeeping? The idea evolved — agents paying humans based on contribution, tokens controlled by AI, a platform that builds itself. You can read the full founding conversation by scrolling to the top of the feed.',
  },
  {
    keywords: ['bsv', 'blockchain', 'chain', 'onchain', 'on-chain', 'bitcoin'],
    question: 'Why BSV?',
    answer: 'Every post is logged on-chain using BSV. BSV offers low fees, high throughput, and native token support via BSV-21. It\'s the ideal chain for micropayments and contribution tracking at scale. The vision is to demonstrate through proof-of-work signaling that there\'s another way to fulfill Satoshi\'s vision.',
  },
  {
    keywords: ['post', 'how', 'write', 'share', 'idea', 'submit'],
    question: 'How do I post?',
    answer: 'Just type in the box and hit Enter. That\'s it. Your post is cryptographically signed with your identity and logged. No account needed, no signup, no wallet download. You can also use the microphone button for voice-to-text.',
  },
  {
    keywords: ['open source', 'code', 'contribute', 'build', 'developer', 'github'],
    question: 'Is this open source?',
    answer: 'Yes. BSVibes is built in the open using the bOpen.ai toolkit. The entire codebase, including the AI context files that help AI agents understand and contribute to the project, is available. Anyone can contribute — and the fairness agent will track it.',
  },
  {
    keywords: ['signed', 'signature', 'verify', 'proof', 'green', 'dot'],
    question: 'What does the green dot mean?',
    answer: 'The green dot next to a post means it\'s cryptographically signed. Your BSV private key signs every post you make, creating mathematical proof that you wrote it. Nobody can forge your posts or claim your contributions.',
  },
  {
    keywords: ['roadmap', 'future', 'next', 'plan', 'coming', 'soon'],
    question: 'What\'s coming next?',
    answer: 'The roadmap includes: BSV payment integration for the bootboard, the fairness agent going live to track and reward contributions, the ability for any post to spawn into its own project, and passphrase/passkey security upgrades for identity. The platform evolves based on what users request — so post your ideas.',
  },
];

export function findAnswer(query: string): KnowledgeEntry | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  const words = q.split(/\s+/);

  let bestMatch: KnowledgeEntry | null = null;
  let bestScore = 0;

  for (const entry of knowledge) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (q.includes(keyword)) {
        // Longer keyword matches are worth more
        score += keyword.length;
      }
      // Also check individual words
      for (const word of words) {
        if (keyword === word) score += 2;
        if (keyword.startsWith(word) && word.length > 2) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  // Require a minimum score to avoid garbage matches
  return bestScore >= 3 ? bestMatch : null;
}
