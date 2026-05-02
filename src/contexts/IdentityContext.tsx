"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useIdentity } from "@/hooks/useIdentity";
import type { Identity } from "@/types";

interface IdentityContextValue {
  identity: Identity | null;
  isLoading: boolean;
  needsUnlock: boolean;
  sign: (content: string) => Promise<{ signature: string; pubkey: string } | null>;
  updateIdentity: (newIdentity: Identity) => void;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

// Two sibling contexts so producers (PostForm, BootButton, every history row)
// subscribe only to the stable signaller and don't re-render every time the
// chip shakes. Only IdentityChip subscribes to the counter context.
interface IdentityShakeSignalContextValue {
  signalLockedAttempt: () => void;
}
interface IdentityShakeKeyContextValue {
  shakeKey: number;
}
const IdentityShakeSignalContext = createContext<IdentityShakeSignalContextValue | null>(null);
const IdentityShakeKeyContext = createContext<IdentityShakeKeyContextValue | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const value = useIdentity();
  const [shakeKey, setShakeKey] = useState(0);
  const signalLockedAttempt = useCallback(() => setShakeKey((k) => k + 1), []);
  const signalValue = useMemo<IdentityShakeSignalContextValue>(
    () => ({ signalLockedAttempt }),
    [signalLockedAttempt]
  );
  const keyValue = useMemo<IdentityShakeKeyContextValue>(() => ({ shakeKey }), [shakeKey]);
  return (
    <IdentityContext.Provider value={value}>
      <IdentityShakeSignalContext.Provider value={signalValue}>
        <IdentityShakeKeyContext.Provider value={keyValue}>
          {children}
        </IdentityShakeKeyContext.Provider>
      </IdentityShakeSignalContext.Provider>
    </IdentityContext.Provider>
  );
}

export function useIdentityContext(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error("useIdentityContext must be used inside <IdentityProvider>");
  }
  return ctx;
}

/**
 * Subscribe to shake signals (PostForm, BootButton, etc.).
 * Stable across renders — never re-renders consumers when a shake fires.
 */
export function useIdentityShake(): IdentityShakeSignalContextValue {
  const ctx = useContext(IdentityShakeSignalContext);
  if (!ctx) {
    throw new Error("useIdentityShake must be used inside <IdentityProvider>");
  }
  return ctx;
}

/**
 * Read the shake counter (IdentityChip only). Re-renders the consumer on
 * every shake, so don't use this from a list-rendered component.
 */
export function useIdentityShakeKey(): IdentityShakeKeyContextValue {
  const ctx = useContext(IdentityShakeKeyContext);
  if (!ctx) {
    throw new Error("useIdentityShakeKey must be used inside <IdentityProvider>");
  }
  return ctx;
}
