"use client";

import { useEffect, useState } from "react";

/**
 * Returns the iOS soft-keyboard height in pixels (0 when closed).
 *
 * The hook commits state changes ONLY on true open↔closed transitions —
 * intermediate height changes (QuickType predictions bar appearing,
 * mid-animation samples) are ignored once the keyboard is already open.
 * Result: the modal moves at most TWICE — once when the keyboard opens,
 * once when it closes. No mid-typing jiggles, no multi-step settles.
 *
 * Why this matters:
 *
 * iOS fires visualViewport `resize` events at multiple distinct moments,
 * not just the keyboard slide:
 *   - During the keyboard's ~250ms slide-up animation (~3 events)
 *   - When the QuickType predictions bar appears (~400ms after slide,
 *     +44px to keyboard height)
 *   - As predictions bar updates while user types
 *   - During the keyboard's retract animation
 *
 * A naive reactive hook (or a simple debounce) commits state on each
 * settle between events — producing multiple visible modal jumps. We
 * saw exactly this in user testing: "3 jumps up after keyboard opens,
 * 2 more when closing."
 *
 * The lock-once-open pattern eliminates all but the open and close
 * commits. The captured open height is whatever iOS reports first after
 * the debounce window — typically the full keyboard height (since the
 * debounce waits for the slide to complete). Once committed, further
 * height changes (QuickType bar, autocomplete strip, etc.) are
 * suppressed until the keyboard truly retracts (vvp.height returns to
 * near screen height).
 *
 * Debounce timing:
 *
 * `commit()` fires ~280ms after the LAST `resize` event. iOS's keyboard
 * slide is ~250ms; firing slightly after ensures we read the settled
 * vvp.height, not a mid-animation sample. The debounce also coalesces
 * the burst of events that fires during the slide into a single commit.
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
 * of screen are ignored.
 *
 * Threshold (100px): keyboards are always ≥ ~250px tall on iOS; anything
 * below 100px is browser chrome flicker (URL bar transitions, etc.),
 * not a real keyboard.
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

      setKeyboardHeight((prev) => {
        const wasOpen = prev > 100;
        const isOpen = next > 100;
        // Same open/closed state — don't update. Locks out the QuickType
        // bar and mid-animation samples while keyboard is open.
        if (wasOpen === isOpen) return prev;
        // True transition (closed → open OR open → closed). Commit.
        return next;
      });
    }

    function update() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(commit, 280);
    }

    commit();
    vvp.addEventListener("resize", update);
    return () => {
      if (timer !== null) clearTimeout(timer);
      vvp.removeEventListener("resize", update);
    };
  }, []);

  return keyboardHeight;
}
