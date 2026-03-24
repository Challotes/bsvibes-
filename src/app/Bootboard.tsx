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

  return <span className="font-mono text-amber-400">{formatDuration(elapsed)}</span>;
}

export function Bootboard({ data }: { data: BootboardData }) {
  const { current, history } = data;
  const [shaking, setShaking] = useState(false);
  const [glowing, setGlowing] = useState(false);
  const [slideIn, setSlideIn] = useState(false);
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
      className={`rounded-xl border bg-amber-500/5 p-4 transition-all duration-300 ${
        glowing
          ? 'border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
          : 'border-amber-500/30'
      } ${shaking ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <BootIcon size={20} filled className="text-amber-400" />
        <span className="text-amber-400 text-sm font-semibold tracking-wide uppercase">Bootboard</span>
      </div>

      {current ? (
        <div>
          <div
            className={`rounded-lg border border-amber-500/20 bg-black/40 px-4 py-3 transition-all duration-300 ${
              slideIn ? 'animate-[slideUp_0.4s_ease-out]' : ''
            }`}
          >
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-amber-300">{current.author_name}</span>
                {current.signature && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" title="Signed" />
                )}
                <span>·</span>
                <span>booted by <span className="text-zinc-400">{current.boosted_by}</span></span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <LiveTimer since={current.booted_at} />
              </div>
            </div>
            <p className="text-[15px] leading-relaxed text-zinc-100 whitespace-pre-wrap break-all">
              {current.content}
            </p>
          </div>

          {history.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-zinc-600 mb-1">Recently booted</p>
              {history.slice(0, 3).map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-zinc-600">
                  <span className="text-zinc-500">{h.author_name}</span>
                  <span>·</span>
                  <span>held for {formatDuration(h.duration_seconds)}</span>
                  <span>·</span>
                  <span className="truncate max-w-[200px]">{h.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-3">
          <p className="text-sm text-zinc-500">No one on the bootboard yet.</p>
          <p className="text-xs text-zinc-600 mt-1">Boost any post to claim the spotlight.</p>
        </div>
      )}
    </div>
  );
}
