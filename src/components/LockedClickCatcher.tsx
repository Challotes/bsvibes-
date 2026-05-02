"use client";

import { useEffect } from "react";
import { useIdentityContext, useIdentityShake } from "@/contexts/IdentityContext";

/**
 * Global "shake the unlock UI" catcher. When the user is locked
 * (`needsUnlock && !identity`) and clicks an interactive element anywhere
 * outside the unlock card, fires `signalLockedAttempt()` so IdentityChip
 * shakes the passphrase prompt.
 *
 * Listens for `pointerdown` (capture phase) — NOT `click`. Per HTML5 spec,
 * disabled form controls suppress click events entirely; pointerdown still
 * fires on disabled elements per W3C Pointer Events. This is the dominant
 * path (every identity-required button is `disabled={!identity}` and clicking
 * a disabled button would never reach a click handler).
 *
 * Producers stay completely unaware of lock state — adding new identity-
 * required features in future requires zero wiring here. Read-only browsing
 * (scrolling, expanding sections, viewing posts/earnings) is unaffected
 * because the selector targets only interactive elements.
 *
 * Opt-out: stamp a button/div with `data-bypass-lock-shake="true"` to skip
 * the shake (e.g. if a future feature needs a different signal like a
 * funding toast).
 */
const INTERACTIVE_SELECTOR =
  'button, a[href], input, textarea, select, label, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';

export function LockedClickCatcher(): null {
  const { identity, needsUnlock } = useIdentityContext();
  const { signalLockedAttempt } = useIdentityShake();

  useEffect(() => {
    if (!(needsUnlock && !identity)) return;
    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-unlock-ui]")) return;
      if (target.closest("[data-bypass-lock-shake]")) return;
      if (!target.closest(INTERACTIVE_SELECTOR)) return;
      signalLockedAttempt();
    }
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", onPointerDown, { capture: true });
  }, [identity, needsUnlock, signalLockedAttempt]);

  return null;
}
