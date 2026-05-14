"use client";

import { useEffect, useState } from "react";

/**
 * Returns the iOS soft-keyboard height in pixels (0 when closed). Reads
 * `window.visualViewport` — the only reliable signal on iOS Safari, since
 * `100dvh` does NOT respond to keyboard open/close, only to browser chrome.
 *
 * The recommended usage is wrapper `padding-bottom` inflation (NOT wrapper
 * resize). The wrapper stays `fixed inset-0` and only its padding-bottom
 * grows when the keyboard opens — `items-center` then re-centers the
 * content via the snap. iOS already animates the keyboard slide; we
 * deliberately do NOT add a CSS transition because that fights iOS's
 * native animation and produces visible lurching.
 *
 *   const kbd = useKeyboardOffset();
 *   <div
 *     className="fixed inset-0 ... p-6"
 *     style={{ paddingBottom: `calc(1.5rem + ${kbd}px)` }}
 *   >
 *
 * Reading details:
 *
 * - Baseline is `document.documentElement.clientHeight`, not
 *   `window.innerHeight`. The latter fluctuates with Safari's URL bar;
 *   the former is stable across browser-chrome transitions in both
 *   Safari (URL bar at bottom) and PWA (no URL bar).
 *
 * - Listens ONLY to the `resize` event, NOT `scroll`. The scroll event
 *   fires 10-15 times during a single keyboard-open animation as iOS
 *   auto-scrolls the focused input into view — listening would cause
 *   re-render storms and visible jank.
 *
 * - Asymmetric deadband: when the keyboard is closed (height ≤ 100px) we
 *   apply tighter throttling (50px) so the initial keyboard-open event
 *   fires. When the keyboard is already open (height > 100px) we apply a
 *   wider deadband (60px) to ignore the iOS QuickType predictions bar
 *   that appears/disappears mid-typing — its ~44-50px height swing would
 *   otherwise visibly shift the modal as the user types.
 *
 * - Initial spurious values during page-load reflow are filtered: any
 *   reading where the implied keyboard exceeds 60% of the screen is
 *   ignored (no real keyboard ever occupies that much).
 */
export function useKeyboardOffset(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vvp = window.visualViewport;

    function update() {
      const screenHeight = document.documentElement.clientHeight;
      const next = Math.max(0, screenHeight - vvp.height);

      // Ignore obvious garbage values from page-load reflow.
      if (next > screenHeight * 0.6) return;

      setKeyboardHeight((prev) => {
        // Asymmetric deadband: tighter when closing in on open, wider
        // once open to suppress predictions-bar oscillation.
        const threshold = prev > 100 ? 60 : 50;
        return Math.abs(prev - next) < threshold ? prev : next;
      });
    }

    update();
    vvp.addEventListener("resize", update);
    return () => {
      vvp.removeEventListener("resize", update);
    };
  }, []);

  return keyboardHeight;
}
