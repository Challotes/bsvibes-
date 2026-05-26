"use client";

import { useEffect, useRef, useState } from "react";
import { PassphrasePrompt } from "@/components/PassphrasePrompt";
import { useInstallContext } from "@/contexts/InstallContext";
import { decryptWif } from "@/services/bsv/crypto";
import { derivePubkeyFromWif } from "@/services/bsv/identity";
import { parseRecoveryFile } from "@/services/bsv/restore-from-file";
import type { Identity } from "@/types";

interface HomeScreenWelcomeGateProps {
  /**
   * SINGLE entry point for restore — `IdentityContext.acceptRestoredIdentity`
   * branches internally: with `passphrase` it calls `importEncryptedIdentity`
   * (preserves the file's passphrase + hint as the new identity's protection);
   * without `passphrase` it calls `importIdentity` (plaintext path). The gate
   * never calls those underlying functions directly. (E28c — earlier the gate
   * dropped the typed passphrase, landing every encrypted-file restore as
   * plaintext.)
   */
  onRestore: (wif: string, name?: string, passphrase?: string, hint?: string) => Promise<Identity>;
}

type Mode = "buttons" | "passphrase" | "no-file" | "blocked";

/**
 * Full-screen takeover fired by `IdentityProvider` when standalone mode + no
 * identity (per LAUNCH_PLAN.md sequencing revision 2026-05-11). Not dismissable —
 * it's a routing decision, not a dialog.
 *
 * **Restore-only by design.** There is no "Start with a new identity" path in
 * standalone mode. Auto-gen NEVER fires in a PWA sandbox — that would silently
 * spawn a new identity per home-screen icon (the exact bug we're solving). Users
 * without a recovery file are routed to Safari to set up first, then come back.
 *
 * Two visible paths:
 * 1. **Restore from saved file** → file picker → optional passphrase → import
 * 2. **I don't have a recovery file** → instructional screen explaining the path
 *    (set up in Safari, save a file, return). Pure-render — NO localStorage
 *    writes. A stray setItem here would reintroduce the silent-multi-identity
 *    bug we're fixing.
 */
export function HomeScreenWelcomeGate({
  onRestore,
}: HomeScreenWelcomeGateProps): React.JSX.Element {
  const [mode, setMode] = useState<Mode>("buttons");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [encryptedPayload, setEncryptedPayload] = useState<{
    wif_encrypted: string;
    name?: string;
    hint?: string;
  } | null>(null);
  // E29: blocked-restore info. Populated when the eligibility check returns
  // `allowed: false` — the picked key has been rotated to a newer key.
  // Drives the explanation card rendered in `mode === "blocked"`.
  const [blockedInfo, setBlockedInfo] = useState<{
    rotatedAt: string;
    newAddrPrefix?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreButtonRef = useRef<HTMLButtonElement>(null);
  // AbortController for in-flight eligibility checks. Aborted on unmount or
  // when the user navigates away mid-check.
  const eligibilityAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      eligibilityAbortRef.current?.abort();
    };
  }, []);

  // E29 helper: check whether a WIF (and its derived pubkey) is allowed to be
  // restored. Returns `null` if eligible (proceed with restore); returns a
  // populated info object if blocked (caller switches to `mode === "blocked"`).
  // Throws on network / parse failure — fail-safe: block on inability to verify.
  async function checkEligibility(
    wif: string
  ): Promise<{ rotatedAt: string; newAddrPrefix?: string } | null> {
    eligibilityAbortRef.current?.abort();
    const ctrl = new AbortController();
    eligibilityAbortRef.current = ctrl;
    const pubkey = await derivePubkeyFromWif(wif);
    const res = await fetch(`/api/restore-eligibility?pubkey=${encodeURIComponent(pubkey)}`, {
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as {
      allowed: boolean;
      rotatedAt?: string;
      newAddrPrefix?: string;
    };
    if (data.allowed) return null;
    return { rotatedAt: data.rotatedAt ?? "", newAddrPrefix: data.newAddrPrefix };
  }

  // The file the user just restored from IS their backup by definition. Mark
  // backed up so the You modal doesn't bounce them into a redundant "Save your
  // recovery file" prompt (parity with RestoreModal.onSuccess).
  const { markBackedUp } = useInstallContext();

  // Auto-focus the primary action on mount. No focus trap needed — the gate IS
  // the full screen, there's nothing to escape to.
  useEffect(() => {
    restoreButtonRef.current?.focus();
  }, []);

  function handleRestoreClick(): void {
    setError("");
    fileInputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    // Clear so re-picking the same file fires onChange again.
    e.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const result = await parseRecoveryFile(file);
      if (!result.ok) {
        setError(
          result.error === "parse_failed"
            ? "Could not read this file — make sure it's a BSVibes recovery file (.html or .json)"
            : "File does not contain a valid recovery key"
        );
        return;
      }
      if (result.payload.kind === "encrypted") {
        setEncryptedPayload({
          wif_encrypted: result.payload.wif_encrypted,
          name: result.payload.name,
          hint: result.payload.hint,
        });
        setMode("passphrase");
        return;
      }
      // Plain WIF — gate on eligibility (E29) before importing.
      try {
        const blocked = await checkEligibility(result.payload.wif);
        if (blocked) {
          setBlockedInfo(blocked);
          setMode("blocked");
          return;
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Couldn't verify this key — check your connection and try again.");
        return;
      }
      // Import directly via the context single-entry point
      await onRestore(result.payload.wif, result.payload.name);
      markBackedUp();
    } catch {
      setError("Something went wrong — please try again");
    } finally {
      setBusy(false);
    }
  }

  async function handlePassphrase(passphrase: string): Promise<void> {
    if (!encryptedPayload || busy) return;
    setBusy(true);
    setError("");
    try {
      const wif = await decryptWif(encryptedPayload.wif_encrypted, passphrase);
      if (!wif) {
        setError("Wrong passphrase — try again");
        return;
      }
      // E29: gate on eligibility before any identity write. Same fail-safe
      // semantics as RestoreModal — any network/parse failure blocks.
      try {
        const blocked = await checkEligibility(wif);
        if (blocked) {
          setBlockedInfo(blocked);
          setEncryptedPayload(null);
          setMode("blocked");
          return;
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError("Couldn't verify this key — check your connection and try again.");
        return;
      }
      // E28c: forward the passphrase + hint so the new identity is protected
      // by the same passphrase the user just typed (with the file's hint
      // preserved). Without this the restored identity lands as plaintext.
      await onRestore(wif, encryptedPayload.name, passphrase, encryptedPayload.hint);
      markBackedUp();
    } catch {
      setError("Something went wrong — please try again");
    } finally {
      setBusy(false);
    }
  }

  function handlePassphraseCancel(): void {
    setEncryptedPayload(null);
    setError("");
    setMode("buttons");
  }

  function handleNoFileClick(): void {
    setError("");
    setMode("no-file");
  }

  function handleBackToButtons(): void {
    setError("");
    setMode("buttons");
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-[#0f0f0f] px-6 py-12"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-gate-headline"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".html,.json,text/html,application/json"
        onChange={handleFile}
        className="hidden"
      />

      <div className="w-full max-w-sm space-y-6">
        {mode === "blocked" && blockedInfo !== null ? (
          // E29: blocked-restore explanation card. Fires when the eligibility
          // check returns `allowed: false` — the picked key has been rotated
          // to a newer key on-chain. User must find their latest recovery
          // file (saved after the rotation date) to proceed.
          <>
            <div className="text-center space-y-2">
              <h1 id="welcome-gate-headline" className="text-lg font-semibold text-zinc-100">
                This is an older key
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                You moved to a newer key
                {blockedInfo.rotatedAt
                  ? ` on ${new Date(blockedInfo.rotatedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`
                  : " previously"}
                {blockedInfo.newAddrPrefix ? (
                  <>
                    {" "}
                    (address{" "}
                    <span className="font-mono text-amber-300">1{blockedInfo.newAddrPrefix}…</span>)
                  </>
                ) : null}
                . Find your most recent recovery file (the one saved after that date) and try again.
              </p>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Your posts and earnings are safe at the newer key. Any BSV at this old address can
                still be spent by importing the secret key into another BSV wallet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setBlockedInfo(null);
                setError("");
                setMode("buttons");
              }}
              className="w-full bg-amber-400 text-black rounded-xl px-4 py-3 text-sm font-medium hover:bg-amber-300 transition-colors"
            >
              Try a different file
            </button>
          </>
        ) : mode === "no-file" ? (
          <>
            <div className="text-center space-y-2">
              <h1 id="welcome-gate-headline" className="text-lg font-semibold text-zinc-100">
                Set up in Safari first
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed">
                On iPhone, Safari may clear app data after long inactivity. Your account lives in
                your recovery file — not just on this device.
              </p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Open <span className="text-zinc-200">bsvibes.com</span> in Safari, set up your
                identity, save your recovery file. Then come back to this app and restore.
              </p>
            </div>
            <button
              type="button"
              onClick={handleBackToButtons}
              className="w-full bg-transparent text-zinc-300 border border-zinc-700 rounded-xl px-4 py-3 text-sm font-medium hover:border-zinc-500 hover:text-zinc-100 transition-colors"
            >
              Back
            </button>
          </>
        ) : mode === "passphrase" ? (
          <>
            <div className="text-center space-y-2">
              <h1 id="welcome-gate-headline" className="text-lg font-semibold text-zinc-100">
                Welcome back
              </h1>
              <p className="text-sm text-zinc-400">
                Your recovery file is locked with a passphrase.
              </p>
            </div>
            <PassphrasePrompt
              context="Enter the passphrase you used when creating this recovery file."
              error={error}
              loading={busy}
              onConfirm={handlePassphrase}
              onCancel={handlePassphraseCancel}
              confirmLabel="Restore"
              hint={encryptedPayload?.hint}
            />
          </>
        ) : (
          <>
            <div className="text-center space-y-2">
              <h1 id="welcome-gate-headline" className="text-lg font-semibold text-zinc-100">
                Welcome back
              </h1>
              <p className="text-sm text-zinc-400">
                We couldn&apos;t find your identity on this device.
              </p>
            </div>

            <div className="space-y-3">
              <button
                ref={restoreButtonRef}
                type="button"
                onClick={handleRestoreClick}
                disabled={busy}
                className="w-full bg-amber-400 text-black rounded-xl px-4 py-3 text-left hover:bg-amber-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="text-sm font-semibold">Restore from your saved file</div>
                <div className="text-xs font-normal text-black/70 mt-0.5">
                  Use your most recent recovery file. Your posts and earnings come back.
                </div>
              </button>

              <button
                type="button"
                onClick={handleNoFileClick}
                disabled={busy}
                className="w-full bg-transparent text-zinc-300 border border-zinc-700 rounded-xl px-4 py-3 text-left hover:border-zinc-500 hover:text-zinc-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="text-sm font-medium">I don&apos;t have a recovery file</div>
                <div className="text-xs font-normal text-zinc-500 mt-0.5">
                  Set up your identity in Safari first, then come back here.
                </div>
              </button>

              {error && <p className="text-[11px] text-red-400 text-center pt-1">{error}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
