import type { InstallType } from "@/hooks/useInstallPlatform";

/**
 * Returns true if the install pitch should be visible given the four LAUNCH_PLAN
 * decision #10 trigger conditions. Pure — no DOM, no storage, no `Date.now()` —
 * so it can be unit-tested with a truth-table.
 *
 * Inputs:
 * - `backedUp` — user has saved their recovery file (gate against pre-save install,
 *   which would leave them with no recovery path in the new sandbox).
 * - `standalone` — already-installed PWA mode. If true, the pitch is pointless.
 * - `installType` — from `useInstallPlatform`. `null` means pre-hydration (SSR or
 *   first render); render nothing until populated. `"unsupported"` means no install
 *   path exists on this platform (e.g., desktop Firefox).
 * - `suppressed` — from `InstallContext.isSuppressed`. Combines the 30-day dismissal
 *   window AND the permanent-after-engagement flag.
 *
 * All four must agree before the pitch shows. Any single failure → hide.
 */
export function shouldShowInstallPitch(args: {
  backedUp: boolean;
  standalone: boolean;
  installType: InstallType | null;
  suppressed: boolean;
}): boolean {
  if (!args.backedUp) return false;
  if (args.standalone) return false;
  if (args.installType === null) return false; // pre-hydration
  if (args.installType === "unsupported") return false;
  if (args.suppressed) return false;
  return true;
}
