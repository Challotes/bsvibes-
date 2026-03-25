'use client';

import { useEffect, useState, useRef } from 'react';
import { BootIcon } from '@/components/icons/BootIcon';

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
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [since]);

  return <span className="font-mono text-amber-400 text-xs">{formatDuration(elapsed)}</span>;
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

          {/* Expanded: history */}
          {expanded && (
            <div className="animate-[slideUp_0.2s_ease-out] mt-2 pt-2 border-t border-zinc-800/40">
              <div className="flex items-center gap-2 text-[11px] text-zinc-600 mb-1">
                <span>booted by {current.boosted_by}</span>
              </div>
              {history.length > 0 && (
                <div className="space-y-0.5">
                  {history.slice(0, 3).map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-zinc-600">
                      <span className="text-zinc-500">{h.author_name}</span>
                      <span>·</span>
                      <span>held for {formatDuration(h.duration_seconds)}</span>
                      <span>·</span>
                      <span className="truncate max-w-[180px]">{h.content}</span>
                    </div>
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
