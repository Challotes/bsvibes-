'use client';

import { useEffect, useState, useCallback } from 'react';
import { getIdentity, signPost, type Identity } from '@/services/bsv/identity';

interface UseIdentityReturn {
  identity: Identity | null;
  isLoading: boolean;
  sign: (content: string) => Promise<{ signature: string; pubkey: string } | null>;
}

export function useIdentity(): UseIdentityReturn {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getIdentity().then((id) => {
      setIdentity(id);
      setIsLoading(false);
    });
  }, []);

  const sign = useCallback(async (content: string) => {
    return signPost(content);
  }, []);

  return { identity, isLoading, sign };
}
