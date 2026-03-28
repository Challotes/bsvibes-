'use client';

import { useEffect, useState, useCallback } from 'react';
import { getIdentity, signPost, type Identity } from '@/services/bsv/identity';

interface UseIdentityReturn {
  identity: Identity | null;
  isLoading: boolean;
  sign: (content: string) => Promise<{ signature: string; pubkey: string } | null>;
  updateIdentity: (newIdentity: Identity) => void;
}

export function useIdentity(): UseIdentityReturn {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getIdentity()
      .then((id) => {
        setIdentity(id);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('BSVibes: failed to load identity (BSV SDK may not have loaded)', err);
        setIsLoading(false);
      });
  }, []);

  const sign = useCallback(async (content: string) => {
    return signPost(content);
  }, []);

  const updateIdentity = useCallback((newIdentity: Identity) => {
    setIdentity(newIdentity);
  }, []);

  return { identity, isLoading, sign, updateIdentity };
}
