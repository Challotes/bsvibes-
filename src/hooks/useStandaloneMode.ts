"use client";

import { useEffect, useState } from "react";

/**
 * Pure synchronous detection of "are we running as an installed PWA?".
 *
 * Callable from anywhere — including inside a `useEffect` (where `window` is
 * available and synchronous reads are safe). Used by `useIdentity` to decide
 * standalone vs browser-tab behavior BEFORE the auto-gen path could fire,
 * avoiding the SSR/hydration race where a reactive hook would briefly report
 * `false` then flip to `true`.
 *
 * Detection signals (any match → standalone):
 * - `display-mode: standalone` — Android Chrome PWA, iOS Safari PWA, desktop Chrome installed
 * - `display-mode: fullscreen` — PWAs that hide all browser UI
 * - `display-mode: window-controls-overlay` — desktop PWAs with custom title bar
 * - `navigator.standalone === true` — iOS Safari-specific (legacy, pre-display-mode)
 *
 * Deliberately excluded: `display-mode: minimal-ui` (Chrome fallback when manifest
 * requests standalone but the browser can't honor it — still shows browser chrome).
 */
export function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    nav.standalone === true
  );
}

/**
 * React hook for components that need to RE-RENDER on standalone-mode changes
 * (e.g., iPad Stage Manager / Split View transitions mid-session). For one-shot
 * detection inside an effect, call `detectStandalone()` directly instead.
 *
 * SSR-safe: returns false during server render, updates on client mount.
 */
export function useStandaloneMode(): boolean {
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const queries = [
      window.matchMedia("(display-mode: standalone)"),
      window.matchMedia("(display-mode: fullscreen)"),
      window.matchMedia("(display-mode: window-controls-overlay)"),
    ];

    function check(): void {
      setIsStandalone(detectStandalone());
    }

    check();

    for (const q of queries) {
      q.addEventListener("change", check);
    }
    return () => {
      for (const q of queries) {
        q.removeEventListener("change", check);
      }
    };
  }, []);

  return isStandalone;
}
