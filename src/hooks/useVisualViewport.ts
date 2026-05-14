"use client";

import { useEffect, useState } from "react";

interface VisualViewportRect {
  height: number;
  offsetTop: number;
}

/**
 * Returns the current visual viewport's height and offsetTop. On iOS Safari
 * the visual viewport shrinks when the soft keyboard opens (unlike `100dvh`,
 * which does NOT react to the keyboard — it only tracks browser chrome).
 *
 * Apply to a centered modal wrapper as inline styles so the wrapper covers
 * exactly the visible area and the modal stays fully visible above the
 * keyboard:
 *
 *   const vvp = useVisualViewport();
 *   <div
 *     className="fixed left-0 right-0 z-[N] flex items-center justify-center p-6"
 *     style={vvp ? { top: vvp.offsetTop, height: vvp.height } : { top: 0, height: "100dvh" }}
 *   >
 *
 * Returns null on SSR / before mount.
 */
export function useVisualViewport(): VisualViewportRect | null {
  const [rect, setRect] = useState<VisualViewportRect | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vvp = window.visualViewport;

    function update() {
      setRect({ height: vvp.height, offsetTop: vvp.offsetTop });
    }

    update();
    vvp.addEventListener("resize", update);
    vvp.addEventListener("scroll", update);
    return () => {
      vvp.removeEventListener("resize", update);
      vvp.removeEventListener("scroll", update);
    };
  }, []);

  return rect;
}
