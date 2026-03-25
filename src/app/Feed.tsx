'use client';

import { useMemo, useState, useCallback } from 'react';
import { Bootboard } from './Bootboard';
import { PostForm } from './PostForm';
import { Header } from './Header';
import { PostList } from './PostList';
import { IdentityProvider } from '@/contexts/IdentityContext';
import { useScrollTracker } from '@/hooks/useScrollTracker';
import { useFeedPolling } from '@/hooks/useFeedPolling';
import type { Post, BootboardData } from '@/types';

// A post that was added optimistically before the server confirms it.
interface OptimisticPost {
  id: number; // temporary timestamp ID
  content: string;
  author_name: string;
  created_at: string;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return 'just now';
}

// Remove an optimistic post if a confirmed server post with matching content +
// author already exists.
function pruneOptimistic(
  optimisticPosts: OptimisticPost[],
  serverPosts: Post[]
): OptimisticPost[] {
  return optimisticPosts.filter(
    (op) =>
      !serverPosts.some(
        (sp) => sp.content === op.content && sp.author_name === op.author_name
      )
  );
}

export function Feed({
  posts: initialPosts,
  bootboard: initialBootboard,
}: {
  posts: Post[];
  bootboard: BootboardData;
}) {
  const { posts: serverPosts, bootboard } = useFeedPolling({
    initialPosts,
    initialBootboard,
    intervalMs: 5000,
  });

  const [optimisticPosts, setOptimisticPosts] = useState<OptimisticPost[]>([]);

  // Prune confirmed posts on every render — no extra effect needed.
  const pendingOptimistic = useMemo(
    () => pruneOptimistic(optimisticPosts, serverPosts),
    [optimisticPosts, serverPosts]
  );

  const handlePostCreated = useCallback((content: string, author: string) => {
    setOptimisticPosts((prev) => [
      {
        id: Date.now(),
        content,
        author_name: author,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
  }, []);

  const chronological = useMemo(() => [...serverPosts].reverse(), [serverPosts]);
  const postIds = useMemo(() => serverPosts.map((p) => p.id), [serverPosts]);

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
  } = useScrollTracker({ postCount: serverPosts.length, postIds });

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

          {/* Optimistic posts — appear at the bottom (newest) while pending */}
          {pendingOptimistic.length > 0 && (
            <div className="mx-auto max-w-2xl px-4 pb-2 divide-y divide-zinc-800/60">
              {pendingOptimistic.map((op) => (
                <article key={op.id} className="py-3.5 opacity-50">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-300">{op.author_name}</span>
                        <span>·</span>
                        <time>{timeAgo(op.created_at)}</time>
                        {/* Pending indicator */}
                        <span className="flex items-center gap-1 text-zinc-600">
                          <svg
                            className="animate-spin w-3 h-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                          </svg>
                          sending
                        </span>
                      </div>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-all">
                        {op.content}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
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
            <PostForm onPostCreated={handlePostCreated} />
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
