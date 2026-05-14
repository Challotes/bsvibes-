"use client";

import { useEffect, useState } from "react";

/**
 * Returns the iOS soft-keyboard height in pixels (0 when closed).
 *
 * DEBOUNCED: the actual state update fires ~280ms after the LAST
 * visualViewport `resize` event. This is the critical design choice.
 *
 * Why debounce instead of reactive tracking:
 *
 * iOS Safari fires a stream of `resize` events during the keyboard's
 * ~250-300ms native slide animation. Every reactive update during that
 * window causes our React render to reposition the modal — items-center
 * recomputes against the new available space, and the card jumps to a
 * new pixel position. Across the animation the user sees 2-3 rapid
 * positional jumps. Throttling, deadbands, and CSS transitions all fail
 * to eliminate this because the underlying state changes are large
 * enough (0 → 336px) to break any reasonable filter.
 *
 * By debouncing, we update state EXACTLY ONCE, after the keyboard has
 * settled. The user sees the modal sit still during the keyboard slide
 * (iOS handles its own animation), then snap into position 280ms after
 * the slide ends. With a short CSS transition on the wrapper's
 * padding-bottom, that single snap becomes a quick eased move — no
 * jump cascade.
 *
 * 280ms timing rationale: iOS keyboard slide is ~250ms; we want to fire
 * slightly after that completes, but not so late the user perceives lag.
 *
 *   const kbd = useKeyboardOffset();
 *   <div
 *     className="fixed inset-0 ... p-6 transition-[padding] duration-150 ease-out"
 *     style={{ paddingBottom: `calc(1.5rem + ${kbd}px)` }}
 *   >
 *
 * Baseline uses `document.documentElement.clientHeight` (stable across
 * Safari URL bar transitions) rather than `window.innerHeight` (which
 * fluctuates). Spurious values where the implied keyboard exceeds 60%
 * of screen are ignored (no real keyboard ever occupies that much).
 */
export function useKeyboardOffset(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vvp = window.visualViewport;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function commit() {
      timer = null;
      const screenHeight = document.documentElement.clientHeight;
      const next = Math.max(0, screenHeight - vvp.height);
      if (next > screenHeight * 0.6) return;
      setKeyboardHeight(next);
    }

    function update() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(commit, 280);
    }

    // Initial read fires immediately (no need to debounce a stable value).
    commit();
    vvp.addEventListener("resize", update);
    return () => {
      if (timer !== null) clearTimeout(timer);
      vvp.removeEventListener("resize", update);
    };
  }, []);

  return keyboardHeight;
}
