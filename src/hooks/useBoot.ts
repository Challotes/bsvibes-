"use client";

import { useCallback } from "react";
import { bootPost } from "@/app/actions";
import { useBootContext } from "@/contexts/BootContext";
import { clientSideBoot, consolidateUtxos } from "@/services/bsv/client-boot";

export type { BootStatus } from "@/contexts/BootContext";

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
 * Coordinates with BootContext for global "one boot at a time" state.
 */
export function useBoot(opts: UseBootOptions = {}) {
  const { onBooted, onFreeBootUsed, onFundNeeded } = opts;
  const {
    bootingPostId,
    bootStatus,
    bootError,
    claimBoot,
    setStatus,
    releaseBoot,
    failBoot,
    consolidationWarningDismissed,
    dismissConsolidationWarning,
  } = useBootContext();

  const isBooting = bootingPostId !== null;

  const boot = useCallback(
    async (
      postId: number,
      identity: { wif: string; address: string; name: string }
    ): Promise<BootResult> => {
      // Guard: only one boot globally at a time
      if (bootingPostId !== null) return { success: false };

      // Claim the global boot lock for this post
      setStatus("pending");
      // We set bootingPostId via claimBoot — but since React state is async,
      // we call setStatus first then immediately proceed (the claim is effectively
      // sequential because the mutex in client-boot.ts also guards concurrent builds).
      claimBoot(postId);

      // 2s timer: upgrade "pending" → "sending" if still pending
      const extendedTimer = setTimeout(() => {
        setStatus("sending");
      }, 2000);

      // 8s timer: upgrade to "preparing" to reset anxiety clock
      const preparingTimer = setTimeout(() => {
        setStatus("preparing");
      }, 8000);

      try {
        // Try server-side boot first (handles free boots)
        const result = await bootPost(postId, identity.address, identity.name);

        if (result.error) {
          clearTimeout(extendedTimer);
          clearTimeout(preparingTimer);
          failBoot("Boot failed, tap to retry.");
          return { success: false };
        }

        if (result.success && result.isFree) {
          clearTimeout(extendedTimer);
          clearTimeout(preparingTimer);
          onFreeBootUsed?.();
          onBooted?.();
          releaseBoot();
          return { success: true, isFree: true };
        }

        if (result.requiresPayment) {
          // Sync free boot state immediately
          onFreeBootUsed?.();

          setStatus("sending");
          clearTimeout(extendedTimer);

          const sharesRes = await fetch(
            `/api/boot-shares?postId=${postId}&pubkey=${encodeURIComponent(identity.address)}`
          );
          if (!sharesRes.ok) {
            clearTimeout(preparingTimer);
            failBoot("Boot failed, tap to retry.");
            return { success: false };
          }
          const sharesData = await sharesRes.json();

          let bootResult = await clientSideBoot(
            identity.wif,
            identity.address,
            postId,
            sharesData.shares,
            sharesData.bootPrice,
            (status) => setStatus(status)
          );

          // Wallet too fragmented — consolidate first, then retry
          if (bootResult.status === "needs_consolidation") {
            clearTimeout(preparingTimer);
            setStatus("preparing");
            // Show first-time consolidation warning
            const consolidateResult = await consolidateUtxos(identity.wif, identity.address, () =>
              setStatus("preparing")
            );
            if (consolidateResult.status !== "success") {
              console.error("[useBoot] consolidation failed:", consolidateResult.error);
              failBoot("Boot failed, tap to retry.");
              return { success: false };
            }
            dismissConsolidationWarning();
            setStatus("sending");
            bootResult = await clientSideBoot(
              identity.wif,
              identity.address,
              postId,
              sharesData.shares,
              sharesData.bootPrice,
              (status) => setStatus(status)
            );
          }

          clearTimeout(preparingTimer);

          if (bootResult.status === "insufficient_funds") {
            onFundNeeded?.(identity.address, bootResult.balance);
            releaseBoot();
            return {
              success: false,
              needsFund: { address: identity.address, balance: bootResult.balance },
            };
          }

          if (bootResult.status === "error" || bootResult.status === "broadcast_failed") {
            console.error("[useBoot] clientSideBoot failed:", bootResult.status, bootResult.error);
            failBoot("Boot failed, tap to retry.");
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
            onBooted?.();
            releaseBoot();
            return { success: true };
          }

          failBoot("Boot failed, tap to retry.");
          return { success: false };
        }

        // Free boot success (no requiresPayment flag)
        clearTimeout(extendedTimer);
        clearTimeout(preparingTimer);
        onBooted?.();
        releaseBoot();
        return { success: true };
      } catch {
        clearTimeout(extendedTimer);
        clearTimeout(preparingTimer);
        failBoot("Boot failed, tap to retry.");
        return { success: false };
      }
    },
    [
      bootingPostId,
      claimBoot,
      setStatus,
      releaseBoot,
      failBoot,
      dismissConsolidationWarning,
      onBooted,
      onFreeBootUsed,
      onFundNeeded,
    ]
  );

  return {
    boot,
    isBooting,
    bootStatus,
    bootError,
    bootingPostId,
    consolidationWarningDismissed,
  };
}
