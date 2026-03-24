'use client';

import { useEffect, useRef, useState, useCallback, useTransition, useMemo } from 'react';
import { PostForm } from './PostForm';
import { Bootboard } from './Bootboard';
import { bootPost } from './actions';
import { useIdentity } from '@/hooks/useIdentity';
import { BootIcon } from '@/components/icons/BootIcon';
import { Genesis } from './Genesis';
import { IdentityChip } from './IdentityBar';

interface Post {
  id: number;
  content: string;
  author_name: string;
  signature: string | null;
  pubkey: string | null;
  tx_id: string | null;
  created_at: string;
  boot_count: number;
}

interface BootboardData {
  current: {
    id: number;
    post_id: number;
    boosted_by: string;
    booted_at: string;
    content: string;
    author_name: string;
    signature: string | null;
  } | null;
  history: {
    boosted_by: string;
    booted_at: string;
    held_until: string;
    duration_seconds: number;
    content: string;
    author_name: string;
  }[];
  totalBoots: number;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + 'Z').getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function BootButton({ postId }: { postId: number }) {
  const { identity } = useIdentity();
  const [isPending, startTransition] = useTransition();

  function handleBoot() {
    if (!identity) return;
    startTransition(async () => {
      await bootPost(postId, identity.name);
    });
  }

  return (
    <button
      onClick={handleBoot}
      disabled={isPending || !identity}
      className="text-zinc-500 hover:text-amber-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title="Boot to the board"
    >
      {isPending ? '...' : <BootIcon size={16} />}
    </button>
  );
}

export function Feed({ posts, bootboard }: { posts: Post[]; bootboard: BootboardData }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const genesisRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isAtTop, setIsAtTop] = useState(false);
  const [genesisVisited, setGenesisVisited] = useState(false);
  const [genesisHydrated, setGenesisHydrated] = useState(false);

  // Hydrate from localStorage after mount
  useEffect(() => {
    if (localStorage.getItem('bsvibes_genesis_visited') === '1') {
      setGenesisVisited(true);
    }
    setGenesisHydrated(true);
  }, []);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCountRef = useRef(posts.length);

  const scrollToGenesis = useCallback(() => {
    genesisRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onScroll() {
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setIsAtBottom(atBottom);
      const atTop = el.scrollTop < 80;
      setIsAtTop(atTop);
      if (atTop && !genesisVisited) {
        setGenesisVisited(true);
        localStorage.setItem('bsvibes_genesis_visited', '1');
      }
      if (atBottom) setUnreadCount(0);
    }

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Track unread post IDs
  const unreadIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    const newPosts = posts.length - prevCountRef.current;
    prevCountRef.current = posts.length;

    if (newPosts > 0) {
      if (isAtBottom) {
        requestAnimationFrame(() => scrollToBottom());
      } else {
        // Mark the newest posts as unread
        const sorted = [...posts].sort((a, b) => b.id - a.id);
        for (let i = 0; i < newPosts; i++) {
          unreadIdsRef.current.add(sorted[i].id);
        }
        setUnreadCount(unreadIdsRef.current.size);
      }
    }
  }, [posts.length, isAtBottom, scrollToBottom]);

  // Observer to mark posts as read when they scroll into view
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = Number(entry.target.getAttribute('data-post-id'));
            if (unreadIdsRef.current.has(id)) {
              unreadIdsRef.current.delete(id);
              changed = true;
            }
          }
        }
        if (changed) {
          setUnreadCount(unreadIdsRef.current.size);
        }
      },
      { root: container, threshold: 0.5 }
    );

    return () => observerRef.current?.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const chronological = useMemo(() => [...posts].reverse(), [posts]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="shrink-0 border-b border-zinc-800 bg-black/80 backdrop-blur-md">
        <div className="relative mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight leading-none"><span className="text-amber-400">BS</span>Vibes</h1>
            <p className="text-[10px] text-zinc-600 tracking-wide">Agentic Fairness</p>
          </div>

          {/* Genesis button — center of header */}
          <div className="absolute left-1/2 -translate-x-1/2">
            {genesisHydrated && !isAtTop && (
              genesisVisited ? (
                <button
                  onClick={scrollToGenesis}
                  className="hover:text-amber-400 transition-colors"
                  title="Back to Genesis"
                >
                  <svg width="16" height="8" viewBox="0 0 16 8" fill="none" className="text-zinc-700 hover:text-amber-400/60">
                    <path d="M1 7l7-5 7 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ) : (
                <button
                  onClick={scrollToGenesis}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 shadow-lg hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-amber-400">
                    <path d="M8 13V3m0 0l-4 4m4-4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Genesis
                </button>
              )
            )}
          </div>

          <IdentityChip />
        </div>
      </header>

      {/* Pinned bootboard — top */}
      <div className="shrink-0">
        <div className="mx-auto max-w-2xl px-4 pt-2 pb-1">
          <Bootboard data={bootboard} />
        </div>
      </div>

      {/* Scrollable posts area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto relative scrollbar-hide"
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="mx-auto max-w-2xl px-4 pt-3">
          {/* Genesis anchor */}
          <div ref={genesisRef} />
          <Genesis />

          {chronological.length === 0 && (
            <p className="py-16 text-center text-sm text-zinc-600">
              No posts yet. Be the first to share an idea.
            </p>
          )}
          <div className="divide-y divide-zinc-800/60">
            {chronological.map((post) => (
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span className="font-medium text-zinc-300">
                      {post.author_name}
                    </span>
                    {post.signature && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" title="Signed" />
                    )}
                    <span>·</span>
                    <time suppressHydrationWarning>{timeAgo(post.created_at)}</time>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {post.boot_count > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-amber-500">
                        <BootIcon size={12} filled className="text-amber-500" />
                        {post.boot_count}
                      </span>
                    )}
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <BootButton postId={post.id} />
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-200 whitespace-pre-wrap break-all">
                  {post.content}
                </p>
              </article>
            ))}
          </div>
          <div ref={bottomRef} />
        </div>

        </div>

      {/* Telegram-style scroll-to-bottom button */}
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

      {/* Pinned bottom — seamless, no footer look */}
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
  );
}
