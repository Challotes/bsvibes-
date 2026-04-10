"use client";

import { useCallback, useEffect, useState } from "react";
import { getIdentity, type Identity, isIdentityEncrypted, signPost } from "@/services/bsv/identity";

interface UseIdentityReturn {
  identity: Identity | null;
  isLoading: boolean;
  needsUnlock: boolean;
  sign: (content: string) => Promise<{ signature: string; pubkey: string } | null>;
  updateIdentity: (newIdentity: Identity) => void;
}

export function useIdentity(): UseIdentityReturn {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  useEffect(() => {
    getIdentity()
      .then((id) => {
        if (id === null && isIdentityEncrypted()) {
          setNeedsUnlock(true);
        }
        setIdentity(id);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("BSVibes: failed to load identity (BSV SDK may not have loaded)", err);
        setIsLoading(false);
      });
  }, []);

  const sign = useCallback(async (content: string) => {
    return signPost(content);
  }, []);

  const updateIdentity = useCallback((newIdentity: Identity) => {
    setIdentity(newIdentity);
    setNeedsUnlock(false);
  }, []);

  return { identity, isLoading, needsUnlock, sign, updateIdentity };
}
