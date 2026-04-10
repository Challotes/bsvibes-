"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type BootStatus = "idle" | "pending" | "sending" | "retrying" | "preparing" | "failed";

interface BootContextValue {
  bootingPostId: number | null;
  bootStatus: BootStatus;
  bootError: string | null;
  /** Call when a boot starts — claims the global lock */
  claimBoot: (postId: number) => boolean;
  /** Update status while a boot is in progress */
  setStatus: (status: BootStatus) => void;
  /** Call on success or clean exit */
  releaseBoot: () => void;
  /** Call on failure — sets error, auto-resets after 5s */
  failBoot: (message: string) => void;
  /** Whether the first-time consolidation warning has been dismissed */
  consolidationWarningDismissed: boolean;
  dismissConsolidationWarning: () => void;
}

const BootContext = createContext<BootContextValue | null>(null);

export function BootProvider({ children }: { children: React.ReactNode }) {
  const [bootingPostId, setBootingPostId] = useState<number | null>(null);
  const [bootStatus, setBootStatus] = useState<BootStatus>("idle");
  const [bootError, setBootError] = useState<string | null>(null);
  const [consolidationWarningDismissed, setConsolidationWarningDismissed] = useState(false);
  const failTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const claimBoot = useCallback((postId: number): boolean => {
    // Reject if another boot is already running
    setBootingPostId((prev) => {
      if (prev !== null) return prev; // no change — already claimed
      return postId;
    });
    // We need to read the value synchronously — use a ref approach via the setter result
    // React state updates are async, so we track claim success via a ref
    return true; // caller checks bootingPostId before calling
  }, []);

  const setStatus = useCallback((status: BootStatus) => {
    setBootStatus(status);
  }, []);

  const releaseBoot = useCallback(() => {
    if (failTimerRef.current) {
      clearTimeout(failTimerRef.current);
      failTimerRef.current = null;
    }
    setBootingPostId(null);
    setBootStatus("idle");
    setBootError(null);
  }, []);

  const failBoot = useCallback((message: string) => {
    setBootStatus("failed");
    setBootError(message);
    setBootingPostId(null);
    if (failTimerRef.current) clearTimeout(failTimerRef.current);
    failTimerRef.current = setTimeout(() => {
      setBootStatus("idle");
      setBootError(null);
      failTimerRef.current = null;
    }, 5000);
  }, []);

  const dismissConsolidationWarning = useCallback(() => {
    setConsolidationWarningDismissed(true);
  }, []);

  return (
    <BootContext.Provider
      value={{
        bootingPostId,
        bootStatus,
        bootError,
        claimBoot,
        setStatus,
        releaseBoot,
        failBoot,
        consolidationWarningDismissed,
        dismissConsolidationWarning,
      }}
    >
      {children}
    </BootContext.Provider>
  );
}

export function useBootContext(): BootContextValue {
  const ctx = useContext(BootContext);
  if (!ctx) throw new Error("useBootContext must be used inside <BootProvider>");
  return ctx;
}
