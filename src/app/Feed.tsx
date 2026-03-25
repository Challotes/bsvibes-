'use client';

import { useMemo } from 'react';
import { Bootboard } from './Bootboard';
import { PostForm } from './PostForm';
import { Header } from './Header';
import { PostList } from './PostList';
import { IdentityProvider } from '@/contexts/IdentityContext';
import { useScrollTracker } from '@/hooks/useScrollTracker';
import type { Post, BootboardData } from '@/types';

export function Feed({ posts, bootboard }: { posts: Post[]; bootboard: BootboardData }) {
  const chronological = useMemo(() => [...posts].reverse(), [posts]);
  const postIds = useMemo(() => posts.map((p) => p.id), [posts]);

  const {
    scrollRef,
    bottomRef,
    genesisRef,
    observerRef,
    isAtBottom,
    isAtTop,
    unreadCount,
    genesisVisited,
    genesisHydrated,
    scrollToBottom,
    scrollToGenesis,
  } = useScrollTracker({ postCount: posts.length, postIds });

  return (
    <IdentityProvider>
      <div className="flex flex-col h-screen">
        <Header
          isAtTop={isAtTop}
          genesisHydrated={genesisHydrated}
          genesisVisited={genesisVisited}
          onScrollToGenesis={scrollToGenesis}
        />

        {/* Pinned bootboard */}
        <div className="shrink-0 relative">
          <div className="mx-auto max-w-2xl px-4 pt-2 pb-3">
            <Bootboard data={bootboard} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-b from-transparent to-black pointer-events-none" />
        </div>

        {/* Scrollable posts area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto relative scrollbar-hide"
          style={{ scrollbarWidth: 'none' }}
        >
          <PostList
            posts={chronological}
            genesisRef={genesisRef}
            bottomRef={bottomRef}
            observerRef={observerRef}
          />
        </div>

        {/* Scroll-to-bottom button */}
        {!isAtBottom && (
          <div className="shrink-0 flex justify-end mx-auto max-w-2xl px-4">
            <button
              onClick={scrollToBottom}
              className="relative -mb-5 z-30 w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 shadow-lg hover:bg-zinc-700 transition-colors mr-2"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="text-zinc-300">
                <path d="M8 3v10m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-2 -right-1 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-amber-500 text-black text-[11px] font-bold px-1.5">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Pinned bottom — compose area */}
        <div className="shrink-0">
          <div className="mx-auto max-w-2xl px-4 pb-4 pt-2">
            <PostForm />
            <div className="flex justify-center mt-1">
              <a href="https://bopen.ai" target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-700 hover:text-zinc-500 transition-colors">
                created with bopen.ai
              </a>
            </div>
          </div>
        </div>
      </div>
    </IdentityProvider>
  );
}
