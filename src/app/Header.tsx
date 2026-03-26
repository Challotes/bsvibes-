'use client';

import { IdentityChip } from './IdentityBar';

interface HeaderProps {
  isAtTop: boolean;
  genesisHydrated: boolean;
  genesisVisited: boolean;
  onScrollToGenesis: () => void;
}

export function Header({ isAtTop, genesisHydrated, genesisVisited, onScrollToGenesis }: HeaderProps) {
  return (
    <header className="shrink-0 border-b border-zinc-800 bg-black">
      <div className="relative mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight leading-none">
            <span className="text-amber-400">BS</span>Vibes
          </h1>
          <button
            onClick={onScrollToGenesis}
            className="text-[11px] text-zinc-500 tracking-wide hover:text-amber-400 transition-colors duration-150"
          >
            Agentic Fairness
          </button>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2">
          {genesisHydrated && !isAtTop && (
            genesisVisited ? (
              <button
                onClick={onScrollToGenesis}
                className="hover:text-amber-400 transition-colors"
                title="Back to Genesis"
              >
                <svg width="16" height="8" viewBox="0 0 16 8" fill="none" className="text-zinc-700 hover:text-amber-400/60">
                  <path d="M1 7l7-5 7 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            ) : (
              <button
                onClick={onScrollToGenesis}
                className="flex items-center gap-1 sm:gap-1.5 rounded-full bg-zinc-800 border border-zinc-700 px-2 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs text-zinc-400 shadow-lg hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-amber-400">
                  <path d="M8 13V3m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="hidden sm:inline">Genesis</span>
                <span className="sm:hidden">Origin</span>
              </button>
            )
          )}
        </div>

        <IdentityChip />
      </div>
    </header>
  );
}
