"use client";

import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import { useIdentity } from "@/hooks/useIdentity";
import type { Identity } from "@/types";

interface IdentityContextValue {
  identity: Identity | null;
  isLoading: boolean;
  needsUnlock: boolean;
  sign: (content: string) => Promise<{ signature: string; pubkey: string } | null>;
  updateIdentity: (newIdentity: Identity) => void;
  // Sign-in modal
  signInOpen: boolean;
  openSignIn: () => void;
  closeSignIn: () => void;
  /**
   * Gate for any transaction-requiring action. Returns true if signed in,
   * otherwise opens <SignInModal> and returns false. Use at the top of every
   * handler that needs a signed BSV identity (post, boot, tip, future):
   *
   *   const { identity, requireIdentity } = useIdentityContext();
   *   if (!requireIdentity() || !identity) return;
   *   // identity is non-null here — proceed with sign / spend
   *
   * Do NOT call signPost, clientSideBoot, or any other wif-using service
   * from a UI handler without this gate. See CLAUDE.md "Universal pattern".
   */
  requireIdentity: () => boolean;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const identityValue = useIdentity();
  const [signInOpen, setSignInOpen] = useState(false);

  const openSignIn = useCallback(() => setSignInOpen(true), []);
  const closeSignIn = useCallback(() => setSignInOpen(false), []);

  const requireIdentity = useCallback((): boolean => {
    if (identityValue.identity) return true;
    setSignInOpen(true);
    return false;
  }, [identityValue.identity]);

  const contextValue: IdentityContextValue = {
    ...identityValue,
    signInOpen,
    openSignIn,
    closeSignIn,
    requireIdentity,
  };

  return <IdentityContext.Provider value={contextValue}>{children}</IdentityContext.Provider>;
}

export function useIdentityContext(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error("useIdentityContext must be used inside <IdentityProvider>");
  }
  return ctx;
}

/**
 * Ergonomic hook for components that need both the identity and a guard.
 * Usage:
 *   const { identity, requireIdentity } = useRequiresIdentity();
 *   function handleAction() {
 *     if (!requireIdentity()) return;   // opens modal if locked, returns false
 *     // identity is non-null here
 *   }
 */
export function useRequiresIdentity(): {
  identity: Identity | null;
  requireIdentity: () => boolean;
} {
  const ctx = useIdentityContext();
  return { identity: ctx.identity, requireIdentity: ctx.requireIdentity };
}
