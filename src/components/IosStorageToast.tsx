"use client";

import { useEffect, useState } from "react";

const SHOWN_KEY = "bsvibes_ios_storage_notice_shown";
const AUTO_DISMISS_MS = 8000;

function isIosStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function readShown(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeShown(): void {
  try {
    window.localStorage.setItem(SHOWN_KEY, "1");
  } catch {
    // localStorage write failed — toast still hides this session via state.
  }
}

/**
 * One-time toast that fires on a user's first iOS standalone launch (i.e.,
 * opened from the home-screen icon after Add to Home Screen). Surfaces the
 * iOS Intelligent Tracking Prevention reality — Safari may clear saved site
 * data after long periods of inactivity — and reassures them their recovery
 * file is the path back.
 *
 * Triggers ONLY when `navigator.standalone === true` (iOS-specific) AND
 * `bsvibes_ios_storage_notice_shown` localStorage flag is unset. Android
 * standalone (display-mode: standalone) is excluded because Chrome on Android
 * doesn't have iOS's ITP-style storage eviction.
 *
 * Mounted inside FeedContent which only renders post-welcome-gate, so the
 * sequencing requirement (welcome gate → ITP toast, not concurrent) is
 * satisfied by mount-point. Fires on mount, 8s auto-dismiss, single "Got it"
 * button. No "Remind me later" — this is informational, not a save prompt;
 * a second showing adds nothing.
 */
export function IosStorageToast(): React.JSX.Element | null {
  const [animateIn, setAnimateIn] = useState(false);
  const [visible, setVisible] = useState(false);
  // TEMP DIAGNOSTIC — remove after confirming ITP toast detection works on
  // iPhone home-screen-install. Captures the actual values we're checking so
  // the user can see why the toast didn't fire even when they expect it to.
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  useEffect(() => {
    // TEMP DIAGNOSTIC — capture values regardless of whether toast fires
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const dmStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const shownFlag = (() => {
      try {
        return window.localStorage.getItem(SHOWN_KEY);
      } catch {
        return "<read-failed>";
      }
    })();
    setDiagnostic(
      `nav.standalone=${String(nav.standalone)} dm-standalone=${dmStandalone} shown=${shownFlag}`
    );

    if (!isIosStandalone()) return;
    if (readShown()) return;
    setVisible(true);
    // Set the flag on display, not on dismissal — guarantees once-per-device
    // even if the user backgrounds the app mid-toast (no "Got it" tap fired).
    writeShown();
  }, []);

  useEffect(() => {
    if (!visible) {
      setAnimateIn(false);
      return;
    }
    const enter = setTimeout(() => setAnimateIn(true), 16);
    const exit = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => {
      clearTimeout(enter);
      clearTimeout(exit);
    };
  }, [visible]);

  return (
    <>
      {/* TEMP DIAGNOSTIC — remove after confirming. Shows what the toast
          detection is actually seeing. Tap to dismiss. */}
      {diagnostic && (
        <button
          type="button"
          onClick={() => setDiagnostic(null)}
          className="fixed top-2 left-1/2 z-[100] -translate-x-1/2 w-[calc(100vw-1rem)] max-w-md bg-yellow-500/95 text-black text-[10px] font-mono px-3 py-2 rounded-md shadow-lg break-all text-left"
        >
          <span className="font-bold">ITP debug:</span> {diagnostic} (tap to dismiss)
        </button>
      )}

      {visible && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-24 left-1/2 z-50 -translate-x-1/2 w-[calc(100vw-2rem)] max-w-sm transition-all duration-300 ${
            animateIn ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-lg">
            <p className="text-sm text-zinc-100 font-medium">
              You&apos;re all set. One thing to know.
            </p>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              Apple may clear saved site data after long periods of inactivity. If that ever
              happens, your recovery file brings everything back in seconds — you&apos;re covered.
            </p>
            <div className="flex mt-3">
              <button
                type="button"
                onClick={() => setVisible(false)}
                className="ml-auto bg-zinc-800 text-zinc-100 border border-zinc-700 rounded-lg px-3 py-1.5 text-[12px] font-medium hover:bg-zinc-700 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
