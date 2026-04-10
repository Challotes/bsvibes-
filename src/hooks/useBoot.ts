"use client";

import { useCallback, useState } from "react";
import { bootPost } from "@/app/actions";
import { clientSideBoot, consolidateUtxos } from "@/services/bsv/client-boot";

export type BootPhase = "idle" | "preparing" | "booting";

export interface BootResult {
  success: boolean;
  isFree?: boolean;
  needsFund?: { address: string; balance?: number };
}

interface UseBootOptions {
  onBooted?: () => void;
  onFreeBootUsed?: () => void;
  onFundNeeded?: (address: string, balance?: number) => void;
}

/**
 * Shared boot logic: free → server pays, paid → client trustless tx with consolidation.
 * Returns boot phase state + a trigger function.
 */
export function useBoot(opts: UseBootOptions = {}) {
  const [isBooting, setIsBooting] = useState(false);
  const [bootPhase, setBootPhase] = useState<BootPhase>("idle");

  const boot = useCallback(
    async (
      postId: number,
      identity: { wif: string; address: string; name: string }
    ): Promise<BootResult> => {
      if (isBooting) return { success: false };

      setIsBooting(true);
      setBootPhase("booting");

      try {
        // Try server-side boot first (handles free boots)
        const result = await bootPost(postId, identity.address, identity.name);

        if (result.error) {
          return { success: false };
        }

        if (result.success && result.isFree) {
          opts.onFreeBootUsed?.();
          opts.onBooted?.();
          return { success: true, isFree: true };
        }

        if (result.requiresPayment) {
          // Sync free boot state immediately
          opts.onFreeBootUsed?.();

          // Paid boot — client builds trustless tx
          setBootPhase("booting");
          const sharesRes = await fetch(
            `/api/boot-shares?postId=${postId}&pubkey=${encodeURIComponent(identity.address)}`
          );
          if (!sharesRes.ok) return { success: false };
          const sharesData = await sharesRes.json();

          let bootResult = await clientSideBoot(
            identity.wif,
            identity.address,
            postId,
            sharesData.shares,
            sharesData.bootPrice
          );

          // Wallet too fragmented — consolidate first, then retry
          if (bootResult.status === "needs_consolidation") {
            setBootPhase("preparing");
            const consolidateResult = await consolidateUtxos(identity.wif, identity.address);
            if (consolidateResult.status !== "success") {
              console.error("[useBoot] consolidation failed:", consolidateResult.error);
              return { success: false };
            }
            setBootPhase("booting");
            bootResult = await clientSideBoot(
              identity.wif,
              identity.address,
              postId,
              sharesData.shares,
              sharesData.bootPrice
            );
          }

          if (bootResult.status === "insufficient_funds") {
            opts.onFundNeeded?.(identity.address, bootResult.balance);
            return {
              success: false,
              needsFund: { address: identity.address, balance: bootResult.balance },
            };
          }

          if (bootResult.status === "error" || bootResult.status === "broadcast_failed") {
            console.error("[useBoot] clientSideBoot failed:", bootResult.status, bootResult.error);
            return { success: false };
          }

          if (bootResult.status === "success" && bootResult.txid) {
            await fetch("/api/boot-confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                postId,
                txid: bootResult.txid,
                booterPubkey: identity.address,
                booterName: identity.name,
              }),
            });
            opts.onBooted?.();
            return { success: true };
          }

          return { success: false };
        }

        // Free boot success (no requiresPayment flag)
        opts.onBooted?.();
        return { success: true };
      } finally {
        setIsBooting(false);
        setBootPhase("idle");
      }
    },
    [isBooting, opts]
  );

  return { boot, isBooting, bootPhase };
}
