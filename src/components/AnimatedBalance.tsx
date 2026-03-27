'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedBalanceProps {
  sats: number;
  className?: string;
}

export function AnimatedBalance({ sats, className = '' }: AnimatedBalanceProps) {
  const [displayed, setDisplayed] = useState(sats);
  const [flash, setFlash] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const prevRef = useRef(sats);
  const rafRef = useRef<number | null>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    const next = sats;
    prevRef.current = sats;

    if (next <= prev) {
      setDisplayed(next);
      return;
    }

    const delta = next - prev;

    // Count up animation
    const duration = 600;
    const start = performance.now();

    setFlash(true);
    setLabel(`+${delta.toLocaleString()} · Agentic fairness`);
    setTimeout(() => setFlash(false), 1200);

    if (labelTimer.current) clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => setLabel(null), 3500);

    function step(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(prev + (next - prev) * eased));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [sats]);

  return (
    <span className="relative inline-flex items-center">
      <span
        className={`
          font-medium tabular-nums transition-all duration-300
          ${flash ? 'text-emerald-300 scale-110' : 'text-emerald-400 scale-100'}
          ${className}
        `}
        style={{ display: 'inline-block', transformOrigin: 'center' }}
      >
        {displayed.toLocaleString()} sats
      </span>

      {/* Agentic fairness label */}
      {label && (
        <span
          className="absolute top-full right-0 mt-1 whitespace-nowrap text-[9px] text-emerald-500/80 font-medium transition-opacity duration-500"
          aria-live="polite"
        >
          {label}
        </span>
      )}
    </span>
  );
}
