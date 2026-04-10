"use client";

import { useState } from "react";
import { migrateIdentity } from "@/app/actions";
import { type BackupData, downloadBackup, getStoredHint } from "@/services/bsv/backup-template";
import { encryptWif } from "@/services/bsv/crypto";
import { commitUpgrade, unlockIdentity, upgradeIdentity } from "@/services/bsv/identity";
import type { Identity } from "@/types";

interface ChangePassphraseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newIdentity: Identity, transferMsg: string | null) => void;
  currentIdentity: Identity;
}

export function ChangePassphraseModal({
  isOpen,
  onClose,
  onSuccess,
  currentIdentity,
}: ChangePassphraseModalProps): React.JSX.Element | null {
  const [step, setStep] = useState<"verify" | "newpass">("verify");
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  function handleClose() {
    setStep("verify");
    setCurrentPass("");
    setNewPass("");
    setConfirmPass("");
    setHint("");
    setError("");
    onClose();
  }

  async function handleVerify() {
    setWorking(true);
    setError("");
    try {
      const unlocked = await unlockIdentity(currentPass);
      if (!unlocked) {
        setError("Wrong passphrase");
        setWorking(false);
        return;
      }
      setStep("newpass");
    } catch {
      setError("Something went wrong");
    } finally {
      setWorking(false);
    }
  }

  async function handleChange() {
    if (newPass.length < 8) {
      setError("Passphrase must be at least 8 characters");
      return;
    }
    if (newPass !== confirmPass) {
      setError("Passphrases don't match");
      return;
    }
    if (newPass === currentPass) {
      setError("New passphrase must be different");
      return;
    }
    setWorking(true);
    setError("");
    try {
      const result = await upgradeIdentity(
        newPass,
        currentIdentity.wif,
        currentIdentity.name,
        hint.trim() || undefined
      );

      const migrationResult = await migrateIdentity(
        result.migration.oldPubkey,
        result.migration.newPubkey,
        result.migration.migrationSignature,
        result.migration.migrationMessage
      );

      if (!migrationResult.success) {
        throw new Error("Migration failed — passphrase change aborted.");
      }

      commitUpgrade(result.encStore);

      const newIdentity = result.identity;
      let encryptedWif: string;
      try {
        const parsedStore = JSON.parse(result.encStore) as { encrypted?: string };
        encryptedWif = parsedStore.encrypted ?? (await encryptWif(newIdentity.wif, newPass));
      } catch {
        encryptedWif = await encryptWif(newIdentity.wif, newPass);
      }
      const backupPayload: BackupData = {
        name: newIdentity.name,
        address: newIdentity.address,
        wif_encrypted: encryptedWif,
        createdAt: new Date().toISOString(),
        note: "Use your new passphrase to restore.",
      };
      if (hint.trim()) backupPayload.hint = hint.trim();
      backupPayload.oldWif_encrypted = await encryptWif(currentIdentity.wif, newPass);

      downloadBackup(
        backupPayload,
        `bsvibes-${newIdentity.name}-${new Date().toISOString().slice(0, 10)}.html`
      );

      let transferMsg: string | null = null;
      if (result.fundTransfer.txid) {
        const sats = result.fundTransfer.transferredSats.toLocaleString();
        transferMsg = `Transferred ${sats} sats to your new address.`;
      } else if (result.fundTransfer.error) {
        transferMsg = `Note: fund transfer failed — ${result.fundTransfer.error}. Your previous key is in the recovery file.`;
      }

      onSuccess(newIdentity, transferMsg);
      handleClose();
    } catch (e) {
      setError("Something went wrong — try again");
      console.error("BSVibes: passphrase change failed", e);
    } finally {
      setWorking(false);
    }
  }

  if (!isOpen) return null;

  const storedHint = getStoredHint();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
    >
      <button
        type="button"
        className="absolute inset-0 w-full cursor-default"
        aria-label="Close modal"
        onClick={handleClose}
      />
      <div
        className="relative z-10 w-full max-w-sm rounded-xl border border-zinc-700 shadow-2xl overflow-hidden"
        style={{ backgroundColor: "#18181b" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Change passphrase</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {step === "verify"
                ? "Verify your current passphrase first"
                : "A new recovery file will be downloaded"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none ml-3"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          {step === "verify" ? (
            <>
              <input
                type="password"
                placeholder="Current passphrase"
                value={currentPass}
                onChange={(e) => {
                  setCurrentPass(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && currentPass) handleVerify();
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              {storedHint && (
                <div className="border-l-2 border-amber-500/60 pl-2 py-0.5">
                  <span className="text-[11px] text-amber-400/90">💡 {storedHint}</span>
                </div>
              )}
              {error && <p className="text-[11px] text-red-400">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={!currentPass || working}
                  className="flex-1 bg-white text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {working ? "Checking..." : "Continue"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] text-amber-400/80 leading-relaxed">
                Your old recovery file will stop working. A new one will be downloaded.
              </p>
              <input
                type="password"
                placeholder="New passphrase (min 8 characters)"
                value={newPass}
                onChange={(e) => {
                  setNewPass(e.target.value);
                  setError("");
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <input
                type="password"
                placeholder="Confirm new passphrase"
                value={confirmPass}
                onChange={(e) => {
                  setConfirmPass(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    newPass.length >= 8 &&
                    newPass === confirmPass &&
                    !working
                  )
                    handleChange();
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />

              {/* Memory clue — always visible, amber accent */}
              <div className="border-l-2 border-amber-500/60 pl-2.5 space-y-1">
                <label
                  htmlFor="change-hint"
                  className="text-[11px] text-amber-400/80 font-medium block"
                >
                  Memory clue (recommended)
                </label>
                <input
                  id="change-hint"
                  type="text"
                  placeholder={`e.g. "blue house + 2019"`}
                  value={hint}
                  maxLength={100}
                  onChange={(e) => setHint(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                />
                <p className="text-[10px] text-zinc-600">
                  A hint to help you remember — stored as plain text, not part of your passphrase.
                </p>
              </div>

              {error && <p className="text-[11px] text-red-400">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleChange}
                  disabled={newPass.length < 8 || newPass !== confirmPass || working}
                  className="flex-1 bg-white text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {working ? "Changing..." : "Change passphrase"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
