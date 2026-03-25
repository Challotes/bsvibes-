'use client';

import { useEffect, useState, useRef, useTransition } from 'react';
import { BootIcon } from '@/components/icons/BootIcon';
import { bootPost } from './actions';
import { useIdentityContext } from '@/contexts/IdentityContext';
import type { BootboardData } from '@/types';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function LiveTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(since + 'Z').getTime();
    function tick() {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);

  return <span className="font-mono text-amber-400 text-xs">{formatDuration(elapsed)}</span>;
}

function HistoryRow({ entry }: { entry: BootboardData['history'][0] }) {
  const { identity } = useIdentityContext();
  const [isPending, startTransition] = useTransition();

  function handleReboot() {
    if (!identity) return;
    startTransition(async () => {
      await bootPost(entry.post_id, identity.name);
    });
  }

  return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-600 py-0.5">
      <button
        onClick={handleReboot}
        disabled={isPending || !identity}
        className={`shrink-0 flex items-center rounded-full px-1 py-0.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed border text-zinc-600 border-zinc-800 hover:border-zinc-700 hover:text-amber-400 hover:bg-zinc-800/50`}
        title="Reboot this post"
      >
        {isPending ? <span className="text-[10px]">...</span> : <BootIcon size={11} />}
      </button>
      <span className="text-zinc-500 shrink-0">{entry.author_name}</span>
      <span className="shrink-0">·</span>
      <span className="shrink-0">{formatDuration(entry.duration_seconds)}</span>
      <span className="shrink-0">·</span>
      <span className="truncate">{entry.content}</span>
    </div>
  );
}

export function Bootboard({ data }: { data: BootboardData }) {
  const { current, history } = data;
  const [shaking, setShaking] = useState(false);
  const [glowing, setGlowing] = useState(false);
  const [slideIn, setSlideIn] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const prevIdRef = useRef<number | null>(null);

  useEffect(() => {
    const currentId = current?.id ?? null;
    if (prevIdRef.current !== null && currentId !== null && currentId !== prevIdRef.current) {
      setShaking(true);
      setGlowing(true);
      setSlideIn(true);

      const shakeTimer = setTimeout(() => setShaking(false), 600);
      const glowTimer = setTimeout(() => setGlowing(false), 1200);
      const slideTimer = setTimeout(() => setSlideIn(false), 400);

      prevIdRef.current = currentId;
      return () => {
        clearTimeout(shakeTimer);
        clearTimeout(glowTimer);
        clearTimeout(slideTimer);
      };
    }
    prevIdRef.current = currentId;
  }, [current?.id]);

  return (
    <div
      className={`rounded-xl border bg-gradient-to-b from-amber-500/8 to-amber-500/3 px-3.5 py-3.5 transition-all duration-300 ${
        glowing
          ? 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
          : 'border-amber-500/30'
      } ${shaking ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
    >
      {current ? (
        <div className={slideIn ? 'animate-[slideUp_0.4s_ease-out]' : ''}>
          {/* Meta line — label + author + timer + expand toggle */}
          <div className="flex flex-wrap items-center justify-between text-xs text-zinc-500 mb-1.5 gap-y-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <BootIcon size={14} filled className="text-amber-400 shrink-0" />
              <span className="text-amber-400 font-semibold text-[11px] uppercase tracking-wide shrink-0">Bootboard</span>
              <span className="text-zinc-700 shrink-0">·</span>
              <span className="font-medium text-amber-300 truncate">{current.author_name}</span>
              {current.signature && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" title="Signed" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <LiveTimer since={current.booted_at} />
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-zinc-600 hover:text-zinc-400 transition-colors ml-1"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <p className="text-sm leading-snug text-zinc-100 whitespace-pre-wrap break-all">
            {current.content}
          </p>

          {/* Expanded: scrollable history with reboot */}
          {expanded && (
            <div className="animate-[slideUp_0.2s_ease-out] mt-2 pt-2 border-t border-zinc-800/40">
              <div className="flex items-center gap-2 text-[11px] text-zinc-600 mb-1.5">
                <span>booted by {current.boosted_by}</span>
              </div>
              {history.length > 0 && (
                <div className="max-h-[120px] overflow-y-auto scrollbar-hide space-y-1" style={{ scrollbarWidth: 'none' }}>
                  {history.map((h, i) => (
                    <HistoryRow key={i} entry={h} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs">
          <BootIcon size={14} filled className="text-amber-400" />
          <span className="text-amber-400 font-semibold text-[11px] uppercase tracking-wide">Bootboard</span>
          <span className="text-zinc-700">·</span>
          <span className="text-zinc-600">Boost any post to claim the spotlight</span>
        </div>
      )}
    </div>
  );
}
