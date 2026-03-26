'use client';

import { useState, useEffect, useTransition } from 'react';
import type { Post } from '@/types';
import { BootIcon } from '@/components/icons/BootIcon';
import { bootPost } from './actions';
import { useIdentityContext } from '@/contexts/IdentityContext';
import { Genesis } from './Genesis';
import { timeAgo } from '@/lib/utils';

function BootButton({ postId, bootCount, onBooted }: { postId: number; bootCount: number; onBooted?: () => void }) {
  const { identity } = useIdentityContext();
  const [isPending, startTransition] = useTransition();
  const [optimisticBoots, setOptimisticBoots] = useState(0);

  useEffect(() => {
    setOptimisticBoots(0);
  }, [bootCount]);

  function handleBoot() {
    if (!identity) return;
    setOptimisticBoots((prev) => prev + 1);
    startTransition(async () => {
      await bootPost(postId, identity.name);
      onBooted?.();
    });
  }

  const displayCount = bootCount + optimisticBoots;

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleBoot}
        disabled={isPending || !identity}
        className={`flex items-center rounded-full px-1.5 py-0.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed border ${
          displayCount > 0
            ? 'text-amber-500 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/10'
            : 'text-zinc-600 border-zinc-800 hover:border-zinc-700 hover:text-amber-400 hover:bg-zinc-800/50'
        }`}
        title="Boot to the board"
      >
        <BootIcon size={13} className={displayCount > 0 ? 'text-amber-500' : ''} />
      </button>
      {displayCount > 0 && (
        <span className="text-[9px] text-zinc-600 mt-0.5">{displayCount}</span>
      )}
    </div>
  );
}

interface PostListProps {
  posts: Post[];
  genesisRef: React.RefObject<HTMLDivElement | null>;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  observerRef: React.RefObject<IntersectionObserver | null>;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadEarlier: () => void;
  onBooted?: () => void;
  onAskAgent?: () => void;
}

export function PostList({
  posts,
  genesisRef,
  bottomRef,
  observerRef,
  hasMore,
  isLoadingMore,
  onLoadEarlier,
  onBooted,
  onAskAgent,
}: PostListProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 pt-3">
      <div ref={genesisRef} />
      <Genesis onAskAgent={onAskAgent} />

      {hasMore && (
        <div className="flex justify-center py-4">
          <button
            onClick={onLoadEarlier}
            disabled={isLoadingMore}
            className="text-xs text-zinc-500 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded border border-zinc-800 hover:border-zinc-700 bg-zinc-900/50"
          >
            {isLoadingMore ? 'Loading...' : 'Load earlier posts'}
          </button>
        </div>
      )}

      {posts.length === 0 && (
        <p className="py-16 text-center text-sm text-zinc-600">
          No posts yet. Be the first to share an idea.
        </p>
      )}

      <div className="divide-y divide-zinc-800/60">
        {posts.map((post) => (
          <article
            key={post.id}
            data-post-id={post.id}
            ref={(el) => {
              if (el && observerRef.current) {
                observerRef.current.observe(el);
              }
            }}
            className="py-3.5 group"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="font-medium text-zinc-300">{post.author_name}</span>
                  {post.signature && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" title="Signed" />
                  )}
                  <span>·</span>
                  <time suppressHydrationWarning>{timeAgo(post.created_at)}</time>
                </div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-words">
                  {post.content}
                </p>
              </div>
              <div className="shrink-0 self-center">
                <BootButton postId={post.id} bootCount={post.boot_count} onBooted={onBooted} />
              </div>
            </div>
          </article>
        ))}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
