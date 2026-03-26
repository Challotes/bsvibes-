'use client';

import { useMemo, useState, useCallback, useTransition } from 'react';
import { Bootboard } from './Bootboard';
import { PostForm } from './PostForm';
import { Header } from './Header';
import { PostList } from './PostList';
import { IdentityProvider } from '@/contexts/IdentityContext';
import { useScrollTracker } from '@/hooks/useScrollTracker';
import { useFeedPolling } from '@/hooks/useFeedPolling';
import { getOlderPosts } from './actions';
import { FundAddress } from './FundAddress';
import type { Post, BootboardData } from '@/types';
import { timeAgo } from '@/lib/utils';

// A post that was added optimistically before the server confirms it.
interface OptimisticPost {
  id: number; // temporary timestamp ID
  content: string;
  author_name: string;
  created_at: string;
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
  const { posts: serverPosts, bootboard, refresh } = useFeedPolling({
    initialPosts,
    initialBootboard,
    intervalMs: 5000,
  });

  const [optimisticPosts, setOptimisticPosts] = useState<OptimisticPost[]>([]);
  const [olderPosts, setOlderPosts] = useState<Post[]>([]);
  const [hasMore, setHasMore] = useState(initialPosts.length === 100);
  const [isLoadingMore, startLoadingMore] = useTransition();
  const [agentHighlight, setAgentHighlight] = useState(false);
  const [bootPrice, setBootPrice] = useState(1000); // floor default
  const [freeBootsRemaining, setFreeBootsRemaining] = useState(15);
  const [showFundModal, setShowFundModal] = useState(false);
  const [userAddress, setUserAddress] = useState('');

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
    // Poll 500ms after posting to confirm quickly
    setTimeout(refresh, 500);
  }, [refresh]);

  const handleLoadEarlier = useCallback(() => {
    // Oldest post is either the last in olderPosts, or the last in chronological.
    const allSoFar = [...serverPosts, ...olderPosts];
    const oldestId = allSoFar[allSoFar.length - 1]?.id;
    if (!oldestId) return;
    startLoadingMore(async () => {
      const older = await getOlderPosts(oldestId);
      setOlderPosts((prev) => [...prev, ...older]);
      setHasMore(older.length === 100);
    });
  }, [serverPosts, olderPosts]);

  // chronological = newest-first server posts reversed to oldest-first, then older pages appended.
  const chronological = useMemo(
    () => [...[...serverPosts].reverse(), ...olderPosts],
    [serverPosts, olderPosts]
  );
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

  const handleAskAgent = useCallback(() => {
    scrollToBottom();
    setAgentHighlight(true);
    setTimeout(() => setAgentHighlight(false), 2000);
  }, [scrollToBottom]);

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
            <Bootboard data={bootboard} onBooted={refresh} bootPrice={bootPrice} />
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
            hasMore={hasMore}
            isLoadingMore={isLoadingMore}
            onLoadEarlier={handleLoadEarlier}
            onBooted={refresh}
            onAskAgent={handleAskAgent}
            onFundNeeded={() => setShowFundModal(true)}
            bootPrice={bootPrice}
            freeBootsRemaining={freeBootsRemaining}
          />

          {/* Optimistic posts — appear at the bottom (newest), full opacity since server confirms in ~50ms */}
          {pendingOptimistic.length > 0 && (
            <div className="mx-auto max-w-2xl px-4 pb-2 divide-y divide-zinc-800/60">
              {pendingOptimistic.map((op) => (
                <article key={op.id} className="py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-zinc-500">
                        <span className="font-medium text-zinc-300">{op.author_name}</span>
                        <span>·</span>
                        <time>{timeAgo(op.created_at)}</time>
                      </div>
                      <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-words">
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
            <PostForm onPostCreated={handlePostCreated} agentHighlight={agentHighlight} />
            <div className="flex justify-center mt-1">
              <a href="https://bopen.ai" target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-700 hover:text-zinc-500 transition-colors">
                created with bopen.ai
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Fund address modal */}
      {showFundModal && userAddress && (
        <FundAddress
          address={userAddress}
          bootPrice={bootPrice}
          onClose={() => setShowFundModal(false)}
        />
      )}
    </IdentityProvider>
  );
}
