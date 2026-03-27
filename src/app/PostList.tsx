'use client';

import { useState, useEffect, useTransition } from 'react';
import type { Post } from '@/types';
import { BootIcon } from '@/components/icons/BootIcon';
import { bootPost } from './actions';
import { clientSideBoot } from '@/services/bsv/client-boot';
import { useIdentityContext } from '@/contexts/IdentityContext';
import { Genesis } from './Genesis';
import { timeAgo } from '@/lib/utils';

interface BootButtonProps {
  postId: number;
  bootCount: number;
  postPubkey: string | null;
  bootPrice: number;
  freeBootsRemaining: number;
  onBooted?: () => void;
  onFundNeeded?: (address: string) => void;
}

function BootButton({ postId, bootCount, postPubkey, bootPrice, freeBootsRemaining, onBooted, onFundNeeded }: BootButtonProps) {
  const { identity } = useIdentityContext();
  const [isPending, startTransition] = useTransition();
  const [optimisticBoots, setOptimisticBoots] = useState(0);

  useEffect(() => {
    setOptimisticBoots(0);
  }, [bootCount]);

  const isFree = freeBootsRemaining > 0;
  const canBoot = identity && postPubkey; // Must be signed post + signed user

  async function handleBoot() {
    if (!identity || !postPubkey) return;
    setOptimisticBoots((prev) => prev + 1);

    startTransition(async () => {
      // Try server-side boot first (handles free boots)
      const result = await bootPost(postId, identity.address);

      if (result.requiresPayment) {
        // Paid boot — client builds trustless tx
        const sharesRes = await fetch(`/api/boot-shares?postId=${postId}&pubkey=${encodeURIComponent(identity.address)}`);
        if (!sharesRes.ok) {
          setOptimisticBoots((prev) => Math.max(0, prev - 1));
          return;
        }
        const sharesData = await sharesRes.json();

        const bootResult = await clientSideBoot(
          identity.wif,
          identity.address,
          postId,
          sharesData.shares,
          sharesData.bootPrice,
        );

        if (bootResult.status === 'insufficient_funds') {
          setOptimisticBoots((prev) => Math.max(0, prev - 1));
          onFundNeeded?.(identity.address);
          return;
        }

        if (bootResult.status === 'success' && bootResult.txid) {
          // Confirm on server for audit trail
          await fetch('/api/boot-confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId, txid: bootResult.txid, booterPubkey: identity.address }),
          });
        } else {
          setOptimisticBoots((prev) => Math.max(0, prev - 1));
          return;
        }
      }

      onBooted?.();
    });
  }

  const displayCount = bootCount + optimisticBoots;
  const title = !postPubkey
    ? 'Unsigned post — cannot be booted'
    : !identity
    ? 'Sign in to boot'
    : isFree
    ? `Boot to the board (FREE — ${freeBootsRemaining} remaining)`
    : `Boot to the board (${bootPrice.toLocaleString()} sats)`;

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleBoot}
        disabled={isPending || !canBoot}
        className={`flex items-center rounded-full px-1.5 py-0.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed border ${
          displayCount > 0
            ? 'text-amber-500 border-amber-500/20 hover:border-amber-500/40 hover:bg-amber-500/10'
            : 'text-zinc-600 border-zinc-800 hover:border-zinc-700 hover:text-amber-400 hover:bg-zinc-800/50'
        }`}
        title={title}
      >
        <BootIcon size={13} className={displayCount > 0 ? 'text-amber-500' : ''} />
      </button>
      {displayCount > 0 && (
        <span className="text-[9px] text-zinc-600 mt-0.5">{displayCount}</span>
      )}
      {isFree && canBoot && (
        <span className="text-[8px] text-emerald-600 mt-0.5">FREE</span>
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
  onFundNeeded?: (address: string) => void;
  bootPrice: number;
  freeBootsRemaining: number;
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
  onFundNeeded,
  bootPrice,
  freeBootsRemaining,
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
                  {post.tx_id && (
                    <a
                      href={`https://whatsonchain.com/tx/${post.tx_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View on chain"
                      className="inline-flex items-center text-emerald-500 hover:text-emerald-400 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    </a>
                  )}
                </div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-words">
                  {post.content}
                </p>
              </div>
              <div className="shrink-0 self-center">
                <BootButton
                  postId={post.id}
                  bootCount={post.boot_count}
                  postPubkey={post.pubkey}
                  bootPrice={bootPrice}
                  freeBootsRemaining={freeBootsRemaining}
                  onBooted={onBooted}
                  onFundNeeded={onFundNeeded}
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
