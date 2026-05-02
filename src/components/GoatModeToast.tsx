"use client";

import { useEffect, useState } from "react";

interface GoatModeToastProps {
  visible: boolean;
  onDismiss: () => void;
}

/**
 * One-time celebratory toast shown the first time a user becomes protected
 * and the currency display auto-flips to Goat (sats).
 * Slides up on mount, auto-dismisses after 6s, click anywhere to dismiss early.
 */
export function GoatModeToast({ visible, onDismiss }: GoatModeToastProps) {
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (!visible) {
      setAnimateIn(false);
      return;
    }
    const enter = setTimeout(() => setAnimateIn(true), 16);
    const exit = setTimeout(() => onDismiss(), 6000);
    return () => {
      clearTimeout(enter);
      clearTimeout(exit);
    };
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ${
        animateIn ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <button
        type="button"
        onClick={onDismiss}
        className="flex items-center gap-2 rounded-full border border-amber-400/40 bg-zinc-900 px-4 py-2 text-sm text-amber-300 shadow-lg hover:bg-zinc-800 transition-colors"
      >
        <span className="text-base leading-none">🐐</span>
        <span>Goat Mode on &mdash; sats by default. Tap the toggle to switch back.</span>
      </button>
    </div>
  );
}
