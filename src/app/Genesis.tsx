'use client';

import { genesisMessages } from '@/data/genesis';
import { Manifesto } from './Manifesto';

const authorColors: Record<string, string> = {
  enri: 'text-blue-400',
  holdOn: 'text-emerald-400',
  cryptoh: 'text-purple-400',
};

interface GenesisProps {
  onAskAgent?: () => void;
}

export function Genesis({ onAskAgent }: GenesisProps) {
  return (
    <div className="border-b border-zinc-800/40 mb-2">
      {/* Manifesto */}
      <Manifesto onAskAgent={onAskAgent} />

      {/* Divider — bridge to genesis messages */}
      <div className="flex items-center gap-3 mt-6 mb-0 px-4">
        <div className="flex-1 h-px bg-zinc-800/60" />
        <span className="text-[11px] text-zinc-600 tracking-wide shrink-0">
          The conversation that started it all
        </span>
        <div className="flex-1 h-px bg-zinc-800/60" />
      </div>

      {/* Genesis header */}
      <div className="flex items-center gap-2 py-3 px-4">
        <div className="w-1 h-4 bg-amber-500 rounded-full" />
        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Genesis</span>
        <span className="text-[11px] text-zinc-600">Feb 2026</span>
      </div>

      {/* Messages */}
      <div className="space-y-2 pb-4 px-4">
        {genesisMessages.map((msg, i) => {
          const colorClass = authorColors[msg.author] || 'text-zinc-400';
          const prevAuthor = i > 0 ? genesisMessages[i - 1].author : null;
          const showAuthor = msg.author !== prevAuthor;

          return (
            <div key={i}>
              {showAuthor && (
                <div className="flex items-center gap-2 mt-3 first:mt-0">
                  <span className={`text-xs font-medium ${colorClass}`}>{msg.author}</span>
                </div>
              )}
              <div className="mt-0.5">
                <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
