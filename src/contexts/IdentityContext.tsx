'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useIdentity } from '@/hooks/useIdentity';
import type { Identity } from '@/types';

interface IdentityContextValue {
  identity: Identity | null;
  isLoading: boolean;
  sign: (content: string) => Promise<{ signature: string; pubkey: string } | null>;
  updateIdentity: (newIdentity: Identity) => void;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const value = useIdentity();
  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentityContext(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error('useIdentityContext must be used inside <IdentityProvider>');
  }
  return ctx;
}
