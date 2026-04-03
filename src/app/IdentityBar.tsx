'use client';

import { useState, useEffect, useRef } from 'react';
import { useIdentityContext } from '@/contexts/IdentityContext';
import {
  isIdentityEncrypted,
  upgradeIdentity,
  commitUpgrade,
  unlockIdentity,
  importIdentity,
  signPost,
} from '@/services/bsv/identity';
import { encryptWif, decryptWif } from '@/services/bsv/crypto';
import { generateBackupHtml, type BackupData } from '@/services/bsv/backup-template';
import { migrateIdentity, cleanupMigrations } from './actions';
import { AnimatedBalance } from '@/components/AnimatedBalance';
import { useBsvPrice, satsToDollars } from '@/hooks/useBsvPrice';
import { useCurrencyMode } from '@/hooks/useCurrencyMode';
import { EarningsSparkline } from '@/components/EarningsSparkline';
import { FundAddress } from './FundAddress';
import type { Identity } from '@/types';

const BACKED_UP_KEY = 'bsvibes_identity_backed_up';

// ─── Utilities ────────────────────────────────────────────────────────────────

function getStoredHint(): string | undefined {
  try {
    const raw = localStorage.getItem('bfn_keypair_enc');
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { hint?: string };
    return parsed.hint || undefined;
  } catch {
    return undefined;
  }
}

function downloadBackup(data: BackupData, filename: string): void {
  const html = generateBackupHtml(data);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Shared PassphrasePrompt ───────────────────────────────────────────────

interface PassphrasePromptProps {
  context: string;
  placeholder?: string;
  error: string;
  loading: boolean;
  onConfirm: (passphrase: string) => void;
  onCancel: () => void;
  confirmLabel?: string;
  hint?: string | null;
}

function PassphrasePrompt({
  context,
  placeholder = 'Passphrase',
  error,
  loading,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  hint,
}: PassphrasePromptProps): React.JSX.Element {
  const [value, setValue] = useState('');

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-zinc-400 leading-relaxed">{context}</p>
      <input
        type="password"
        placeholder={placeholder}
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && value) onConfirm(value); }}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
      />
      {hint && (
        <div className="border-l-2 border-amber-500/60 pl-2 py-0.5">
          <span className="text-[11px] text-amber-400/90">💡 {hint}</span>
        </div>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => { if (value) onConfirm(value); }}
          disabled={!value || loading}
          className="flex-1 bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Working...' : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// ─── UpgradeModal ──────────────────────────────────────────────────────────

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newIdentity: Identity, transferMsg: string | null) => void;
  currentIdentity: Identity;
}

function UpgradeModal({ isOpen, onClose, onSuccess, currentIdentity }: UpgradeModalProps): React.JSX.Element | null {
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const { isGoat, toggle: toggleCurrency } = useCurrencyMode();

  function handleClose() {
    setPassphrase('');
    setConfirmPass('');
    setHint('');
    setError('');
    onClose();
  }

  async function handleUpgrade() {
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters');
      return;
    }
    if (passphrase !== confirmPass) {
      setError("Passphrases don't match");
      return;
    }
    setUpgrading(true);
    setError('');
    try {
      const result = await upgradeIdentity(passphrase, currentIdentity.wif, currentIdentity.name, hint.trim() || undefined);

      const migrationResult = await migrateIdentity(
        result.migration.oldPubkey,
        result.migration.newPubkey,
        result.migration.migrationSignature,
        result.migration.migrationMessage,
      );

      if (!migrationResult.success) {
        throw new Error('Migration failed — your posts would be orphaned. Upgrade aborted.');
      }

      commitUpgrade(result.encStore);

      // B2 fix: reuse the already-encrypted value from result.encStore instead of calling encryptWif again
      const newIdentity = result.identity;
      let encryptedWif: string;
      try {
        const parsedStore = JSON.parse(result.encStore) as { encrypted?: string };
        encryptedWif = parsedStore.encrypted ?? await encryptWif(newIdentity.wif, passphrase);
      } catch {
        encryptedWif = await encryptWif(newIdentity.wif, passphrase);
      }
      const backupPayload: BackupData = {
        name: newIdentity.name,
        address: newIdentity.address,
        wif_encrypted: encryptedWif,
        createdAt: new Date().toISOString(),
        note: 'Use your passphrase to restore.',
      };
      if (hint.trim()) backupPayload.hint = hint.trim();
      // Include old WIF encrypted — useful for fund recovery
      backupPayload.oldWif_encrypted = await encryptWif(currentIdentity.wif, passphrase);

      downloadBackup(backupPayload, `bsvibes-${newIdentity.name}-${new Date().toISOString().slice(0, 10)}.html`);

      let transferMsg: string | null = null;
      if (result.fundTransfer.txid) {
        const sats = result.fundTransfer.transferredSats.toLocaleString();
        transferMsg = `Transferred ${sats} sats to your new address.`;
      } else if (result.fundTransfer.error) {
        transferMsg = `Note: fund transfer failed — ${result.fundTransfer.error}. Your previous key is in the recovery file.`;
      }

      if (!isGoat) toggleCurrency();
      onSuccess(newIdentity, transferMsg);
      handleClose();
    } catch (e) {
      setError('Something went wrong — try again');
      console.error('BSVibes: upgrade failed', e);
    } finally {
      setUpgrading(false);
    }
  }

  if (!isOpen) return null;

  const canUpgrade = passphrase.length >= 8 && passphrase === confirmPass && !upgrading;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-700 shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#18181b' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Secure your identity</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Add a passphrase so you can recover from any device</p>
          </div>
          <button
            onClick={handleClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none ml-3"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          <input
            type="password"
            placeholder="Passphrase (min 8 characters)"
            value={passphrase}
            autoFocus
            onChange={(e) => { setPassphrase(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && canUpgrade) handleUpgrade(); }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <input
            type="password"
            placeholder="Confirm passphrase"
            value={confirmPass}
            onChange={(e) => { setConfirmPass(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && canUpgrade) handleUpgrade(); }}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />

          {/* Memory clue — always visible, amber accent */}
          <div className="border-l-2 border-amber-500/60 pl-2.5 space-y-1">
            <label className="text-[11px] text-amber-400/80 font-medium block">Memory clue (recommended)</label>
            <input
              type="text"
              placeholder={`e.g. "blue house + 2019"`}
              value={hint}
              maxLength={100}
              onChange={(e) => setHint(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
            <p className="text-[10px] text-zinc-600">A hint to help you remember — stored as plain text, not part of your passphrase.</p>
          </div>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleClose}
              className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpgrade}
              disabled={!canUpgrade}
              className="flex-1 bg-red-500 text-white rounded-lg px-3 py-2 text-xs font-medium hover:bg-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {upgrading ? 'Securing...' : 'Secure identity'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ChangePassphraseModal ─────────────────────────────────────────────────

interface ChangePassphraseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newIdentity: Identity, transferMsg: string | null) => void;
  currentIdentity: Identity;
}

function ChangePassphraseModal({ isOpen, onClose, onSuccess, currentIdentity }: ChangePassphraseModalProps): React.JSX.Element | null {
  const [step, setStep] = useState<'verify' | 'newpass'>('verify');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  function handleClose() {
    setStep('verify');
    setCurrentPass('');
    setNewPass('');
    setConfirmPass('');
    setHint('');
    setError('');
    onClose();
  }

  async function handleVerify() {
    setWorking(true);
    setError('');
    try {
      const unlocked = await unlockIdentity(currentPass);
      if (!unlocked) {
        setError('Wrong passphrase');
        setWorking(false);
        return;
      }
      setStep('newpass');
    } catch {
      setError('Something went wrong');
    } finally {
      setWorking(false);
    }
  }

  async function handleChange() {
    if (newPass.length < 8) {
      setError('Passphrase must be at least 8 characters');
      return;
    }
    if (newPass !== confirmPass) {
      setError("Passphrases don't match");
      return;
    }
    if (newPass === currentPass) {
      setError('New passphrase must be different');
      return;
    }
    setWorking(true);
    setError('');
    try {
      const result = await upgradeIdentity(newPass, currentIdentity.wif, currentIdentity.name, hint.trim() || undefined);

      const migrationResult = await migrateIdentity(
        result.migration.oldPubkey,
        result.migration.newPubkey,
        result.migration.migrationSignature,
        result.migration.migrationMessage,
      );

      if (!migrationResult.success) {
        throw new Error('Migration failed — passphrase change aborted.');
      }

      commitUpgrade(result.encStore);

      const newIdentity = result.identity;
      let encryptedWif: string;
      try {
        const parsedStore = JSON.parse(result.encStore) as { encrypted?: string };
        encryptedWif = parsedStore.encrypted ?? await encryptWif(newIdentity.wif, newPass);
      } catch {
        encryptedWif = await encryptWif(newIdentity.wif, newPass);
      }
      const backupPayload: BackupData = {
        name: newIdentity.name,
        address: newIdentity.address,
        wif_encrypted: encryptedWif,
        createdAt: new Date().toISOString(),
        note: 'Use your new passphrase to restore.',
      };
      if (hint.trim()) backupPayload.hint = hint.trim();
      backupPayload.oldWif_encrypted = await encryptWif(currentIdentity.wif, newPass);

      downloadBackup(backupPayload, `bsvibes-${newIdentity.name}-${new Date().toISOString().slice(0, 10)}.html`);

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
      setError('Something went wrong — try again');
      console.error('BSVibes: passphrase change failed', e);
    } finally {
      setWorking(false);
    }
  }

  if (!isOpen) return null;

  const storedHint = getStoredHint();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-zinc-700 shadow-2xl overflow-hidden"
        style={{ backgroundColor: '#18181b' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Change passphrase</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {step === 'verify' ? 'Verify your current passphrase first' : 'A new recovery file will be downloaded'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none ml-3"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-3">
          {step === 'verify' ? (
            <>
              <input
                type="password"
                placeholder="Current passphrase"
                value={currentPass}
                autoFocus
                onChange={(e) => { setCurrentPass(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && currentPass) handleVerify(); }}
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
                  onClick={handleClose}
                  className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleVerify}
                  disabled={!currentPass || working}
                  className="flex-1 bg-white text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {working ? 'Checking...' : 'Continue'}
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
                autoFocus
                onChange={(e) => { setNewPass(e.target.value); setError(''); }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <input
                type="password"
                placeholder="Confirm new passphrase"
                value={confirmPass}
                onChange={(e) => { setConfirmPass(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && newPass.length >= 8 && newPass === confirmPass && !working) handleChange(); }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />

              {/* Memory clue — always visible, amber accent */}
              <div className="border-l-2 border-amber-500/60 pl-2.5 space-y-1">
                <label className="text-[11px] text-amber-400/80 font-medium block">Memory clue (recommended)</label>
                <input
                  type="text"
                  placeholder={`e.g. "blue house + 2019"`}
                  value={hint}
                  maxLength={100}
                  onChange={(e) => setHint(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                />
                <p className="text-[10px] text-zinc-600">A hint to help you remember — stored as plain text, not part of your passphrase.</p>
              </div>

              {error && <p className="text-[11px] text-red-400">{error}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleClose}
                  className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChange}
                  disabled={newPass.length < 8 || newPass !== confirmPass || working}
                  className="flex-1 bg-white text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {working ? 'Changing...' : 'Change passphrase'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main IdentityChip ─────────────────────────────────────────────────────

export function IdentityChip(): React.JSX.Element | null {
  const { identity, isLoading, needsUnlock, updateIdentity } = useIdentityContext();
  const [open, setOpen] = useState(false);

  // Security state
  const [isProtected, setIsProtected] = useState(false);
  const [backedUp, setBackedUp] = useState<boolean | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showChangePassModal, setShowChangePassModal] = useState(false);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);

  // Balance / earnings
  const [earnedSats, setEarnedSats] = useState<number | null>(null);
  const [balanceSats, setBalanceSats] = useState<number | null>(null);
  const [activity, setActivity] = useState<Array<{ amount: number; direction: 'in' | 'out'; label: string; created_at: string; txid?: string }>>([]);
  const [earningsHistory, setEarningsHistory] = useState<Array<{ t: string; cumulative: number }>>([]);
  const bsvPrice = useBsvPrice();
  const { toggle: toggleCurrency, isGoat } = useCurrencyMode();

  // Save recovery file state
  const [downloading, setDownloading] = useState(false);
  // For protected users: prompt passphrase before saving
  const [showSavePassphrase, setShowSavePassphrase] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savingEncrypted, setSavingEncrypted] = useState(false);

  // Re-auth grace window (for actions that need passphrase confirmation)
  const [reAuthTime, setReAuthTime] = useState(0);
  const reAuthPassphraseRef = useRef('');

  // Re-auth prompt
  const [reAuthAction, setReAuthAction] = useState<(() => void) | null>(null);
  const [reAuthError, setReAuthError] = useState('');
  const [reAuthLoading, setReAuthLoading] = useState(false);

  // Import / restore state
  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  const [encryptedImportData, setEncryptedImportData] = useState<{ wif_encrypted: string; name?: string; hint?: string } | null>(null);
  const [encryptedImportError, setEncryptedImportError] = useState('');
  const [decryptingImport, setDecryptingImport] = useState(false);
  const [pendingRestoreWif, setPendingRestoreWif] = useState<string | null>(null);
  const [pendingRestoreName, setPendingRestoreName] = useState<string | undefined>(undefined);

  // Advanced section (Show/Copy/Paste key)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [showPasteKey, setShowPasteKey] = useState(false);
  const [pasteKeyValue, setPasteKeyValue] = useState('');

  // Unlock state (when needsUnlock)
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [storedHint, setStoredHint] = useState<string | null>(null);
  const [showUnlockHint, setShowUnlockHint] = useState(false);

  // Deposit modal
  const [showDeposit, setShowDeposit] = useState(false);
  // Manage identity modal
  const [showManage, setShowManage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    setBackedUp(localStorage.getItem(BACKED_UP_KEY) === '1');
    const encrypted = isIdentityEncrypted();
    setIsProtected(encrypted);
    loadStoredHint();
  }, []);

  useEffect(() => {
    if (!identity) return;
    const encrypted = isIdentityEncrypted();
    setIsProtected(encrypted);
    loadStoredHint();
  }, [identity?.address, identity?.wif]);

  function loadStoredHint() {
    try {
      const raw = localStorage.getItem('bfn_keypair_enc');
      if (raw) {
        const parsed = JSON.parse(raw) as { hint?: string };
        setStoredHint(parsed.hint ?? null);
      }
    } catch { /* non-critical */ }
  }

  useEffect(() => {
    if (!identity?.address) return;
    function fetchLiveBalance() {
      if (document.visibilityState !== 'visible') return;
      fetch(`https://api.whatsonchain.com/v1/bsv/main/address/${identity!.address}/unspent`)
        .then((res) => res.json())
        .then((utxos) => {
          const total = Array.isArray(utxos) ? utxos.reduce((s: number, u: { value: number }) => s + u.value, 0) : 0;
          setBalanceSats(total);
        })
        .catch(() => {});
    }
    fetchLiveBalance();
    const interval = setInterval(fetchLiveBalance, 15_000);
    return () => clearInterval(interval);
  }, [identity?.address]);

  useEffect(() => {
    if (!identity?.address) return;
    fetch(`/api/earnings?address=${encodeURIComponent(identity.address)}`)
      .then((res) => res.json())
      .then((data) => {
        setEarnedSats(data.totalEarned ?? 0);
        setActivity(data.recentActivity ?? []);
        setEarningsHistory(data.earningsHistory ?? []);
      })
      .catch(() => setEarnedSats(0));
  }, [identity?.address, open]);

  // Background earnings poll (30s) — drives the chip flash for real earnings only
  useEffect(() => {
    if (!identity?.address) return;
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      fetch(`/api/earnings?address=${encodeURIComponent(identity.address)}&summary=1`)
        .then((res) => res.json())
        .then((data) => {
          if (typeof data.totalEarned === 'number') setEarnedSats(data.totalEarned);
        })
        .catch(() => {});
    };
    const interval = setInterval(poll, 30_000);
    poll(); // initial fetch
    return () => clearInterval(interval);
  }, [identity?.address]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      // Don't close the dropdown if the upgrade modal is open — the modal renders
      // outside dropdownRef so every click inside it would otherwise trigger this.
      if (showUpgradeModal || showChangePassModal) return;
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, showUpgradeModal, showChangePassModal]);

  // ── Helpers ────────────────────────────────────────────────────────────

  function resetManageState() {
    setShowSavePassphrase(false);
    setSaveError('');
    setReAuthAction(null);
    setReAuthError('');
    setShowAdvanced(false);
    setKeyRevealed(false);
    setCopied(false);
    setShowPasteKey(false);
    setPasteKeyValue('');
    resetImport();
    setImportSuccess(false);
  }

  function closeManageModal() {
    setShowManage(false);
    resetManageState();
  }

  function closeDropdown() {
    setOpen(false);
    resetManageState();
  }

  function isRecentlyAuthed(): boolean {
    return Date.now() - reAuthTime <= 60_000;
  }

  function requireReAuth(action: () => void): void {
    if (!isProtected || isRecentlyAuthed()) {
      action();
      return;
    }
    setReAuthAction(() => action);
    setReAuthError('');
  }

  async function handleReAuthConfirm(passphrase: string): Promise<void> {
    setReAuthLoading(true);
    setReAuthError('');
    try {
      const unlocked = await unlockIdentity(passphrase);
      if (!unlocked) {
        setReAuthError('Wrong passphrase');
        setReAuthLoading(false);
        return;
      }
      setReAuthTime(Date.now());
      reAuthPassphraseRef.current = passphrase;
      const pendingAction = reAuthAction;
      setReAuthAction(null);
      if (pendingAction) pendingAction();
    } catch {
      setReAuthError('Something went wrong — try again');
    } finally {
      setReAuthLoading(false);
    }
  }

  // ── Unlock ──────────────────────────────────────────────────────────────

  async function handleUnlock(): Promise<void> {
    if (!unlockPassphrase) return;
    setUnlocking(true);
    setUnlockError('');
    try {
      const unlocked = await unlockIdentity(unlockPassphrase);
      if (!unlocked) {
        setUnlockError('Wrong passphrase — try again');
      } else {
        setReAuthTime(Date.now());
        reAuthPassphraseRef.current = unlockPassphrase;
        updateIdentity(unlocked);
        setUnlockPassphrase('');
      }
    } catch {
      setUnlockError('Something went wrong — try again');
    } finally {
      setUnlocking(false);
    }
  }

  // ── Save recovery file ─────────────────────────────────────────────────

  function handleSaveFile(): void {
    if (isProtected) {
      // Single passphrase entry: re-auth captures passphrase, then save directly
      if (isRecentlyAuthed() && reAuthPassphraseRef.current) {
        void handleSaveEncrypted(reAuthPassphraseRef.current);
        return;
      }
      requireReAuth(() => {
        if (reAuthPassphraseRef.current) {
          void handleSaveEncrypted(reAuthPassphraseRef.current);
        }
      });
      return;
    }
    // Unprotected: plaintext download
    if (!identity) return;
    doDownloadPlaintext();
  }

  function doDownloadPlaintext() {
    if (!identity) return;
    setDownloading(true);
    downloadBackup(
      {
        name: identity.name,
        address: identity.address,
        wif: identity.wif,
        createdAt: new Date().toISOString(),
        hint: getStoredHint(),
      },
      `bsvibes-${identity.name}-${new Date().toISOString().slice(0, 10)}.html`,
    );
    markBackedUp();
    setTimeout(() => setDownloading(false), 1000);
  }

  async function handleSaveEncrypted(passphrase: string): Promise<void> {
    if (!identity) return;
    setDownloading(true);
    try {
      // Read already-encrypted value from the local store if available (avoids double-encrypting)
      let encryptedWif: string;
      try {
        const raw = localStorage.getItem('bfn_keypair_enc');
        if (raw) {
          const parsed = JSON.parse(raw) as { encrypted?: string };
          encryptedWif = parsed.encrypted ?? await encryptWif(identity.wif, passphrase);
        } else {
          encryptedWif = await encryptWif(identity.wif, passphrase);
        }
      } catch {
        encryptedWif = await encryptWif(identity.wif, passphrase);
      }

      downloadBackup(
        {
          name: identity.name,
          address: identity.address,
          wif_encrypted: encryptedWif,
          createdAt: new Date().toISOString(),
          note: 'Use your passphrase to restore.',
          hint: getStoredHint(),
        },
        `bsvibes-${identity.name}-${new Date().toISOString().slice(0, 10)}.html`,
      );
      markBackedUp();
    } catch {
      console.error('BSVibes: save encrypted failed');
    } finally {
      setTimeout(() => setDownloading(false), 1000);
    }
  }

  function markBackedUp() {
    if (!backedUp) {
      localStorage.setItem(BACKED_UP_KEY, '1');
      setBackedUp(true);
    }
  }

  // ── Advanced: Show/Copy key ────────────────────────────────────────────

  function handleCopy(): void {
    requireReAuth(() => {
      if (!identity) return;
      navigator.clipboard.writeText(identity.wif);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      markBackedUp();
    });
  }

  function handleRevealKey(): void {
    requireReAuth(() => setKeyRevealed((v) => !v));
  }

  // ── Import / Restore ───────────────────────────────────────────────────

  function resetImport(): void {
    setShowImport(false);
    setImportError('');
    setImportSuccess(false);
    setEncryptedImportData(null);
    setEncryptedImportError('');
    setPendingRestoreWif(null);
    setPendingRestoreName(undefined);
    setShowPasteKey(false);
    setPasteKeyValue('');
  }

  function handleShowImport(): void {
    requireReAuth(() => {
      setShowImport(true);
      // B5 fix: close upgrade modal when import opens
      setShowUpgradeModal(false);
    });
  }

  // B5 fix: close import when upgrade modal opens
  function openUpgradeModal(): void {
    setShowUpgradeModal(true);
    resetImport();
  }

  async function doImport(wif: string, name?: string): Promise<void> {
    setImporting(true);
    setImportError('');
    try {
      if (isProtected && identity) {
        const passForBackup = reAuthPassphraseRef.current;
        reAuthPassphraseRef.current = '';
        const date = new Date().toISOString().slice(0, 10);
        if (passForBackup) {
          const encBackup = await encryptWif(identity.wif, passForBackup);
          downloadBackup(
            {
              name: identity.name,
              address: identity.address,
              wif_encrypted: encBackup,
              createdAt: new Date().toISOString(),
              note: 'Previous identity saved before switching.',
              hint: getStoredHint(),
            },
            `bsvibes-${identity.name}-${date}.html`,
          );
        } else {
          // B1 fix: within grace window but passphrase ref is empty — still prompt before replacing
          // We'll set pending restore and show a "download your current key first" prompt
          setPendingRestoreWif(wif);
          setPendingRestoreName(name);
          setImporting(false);
          return;
        }
        setPendingRestoreWif(wif);
        setPendingRestoreName(name);
        setImporting(false);
        return;
      }

      if (!isProtected && identity) {
        downloadBackup(
          {
            name: identity.name,
            address: identity.address,
            wif: identity.wif,
            createdAt: new Date().toISOString(),
            note: 'Previous identity saved before switching.',
            hint: getStoredHint(),
          },
          `bsvibes-${identity.name}-${new Date().toISOString().slice(0, 10)}.html`,
        );
      }

      await performImport(wif, name);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Restore failed');
      setImporting(false);
    }
  }

  async function performImport(wif: string, name?: string): Promise<void> {
    try {
      const imported = await importIdentity(wif, name);
      updateIdentity(imported);

      const cleanupTs = Date.now();
      const cleanupMsg = `cleanup:${imported.pubkey}:${cleanupTs}`;
      signPost(cleanupMsg)
        .then((sig) => {
          if (sig) return cleanupMigrations(imported.pubkey, sig.signature, cleanupTs);
        })
        .catch((err) => {
          console.warn('[BSVibes] doImport: cleanupMigrations failed (non-critical)', err);
        });

      setImportSuccess(true);
      setTimeout(() => {
        resetImport();
        setOpen(false);
      }, 1200);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setImporting(false);
    }
  }

  async function confirmPendingRestore(): Promise<void> {
    if (!pendingRestoreWif) return;
    const wif = pendingRestoreWif;
    const name = pendingRestoreName;
    setPendingRestoreWif(null);
    setPendingRestoreName(undefined);
    setImporting(true);
    await performImport(wif, name);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = (ev.target?.result as string) ?? '';
      let parsed: { wif?: string; wif_encrypted?: string; name?: string; hint?: string } | null = null;

      const trimmed = text.trimStart();
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || text.includes('BACKUP_DATA')) {
        // B3 fix: use unique markers for robust extraction
        const markerMatch = text.match(/@BACKUP_DATA_START[\s\S]*?const BACKUP_DATA\s*=\s*(\{[\s\S]*?\});\s*\/\/\s*@BACKUP_DATA_END/);
        if (markerMatch) {
          try {
            parsed = JSON.parse(markerMatch[1]);
          } catch {
            // Fall back to legacy regex
            const legacyMatch = text.match(/const BACKUP_DATA\s*=\s*(\{[\s\S]*?\});/);
            if (legacyMatch) {
              try { parsed = JSON.parse(legacyMatch[1]); } catch { /* fall through */ }
            }
          }
        } else {
          // Legacy recovery files without markers
          const legacyMatch = text.match(/const BACKUP_DATA\s*=\s*(\{[\s\S]*?\});/);
          if (legacyMatch) {
            try { parsed = JSON.parse(legacyMatch[1]); } catch { /* fall through */ }
          }
        }
        if (!parsed) {
          setImportError('Could not read this recovery file — it may be corrupted');
          return;
        }
      } else if (trimmed.startsWith('{')) {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          setImportError('Could not read file — make sure it is a BSVibes recovery file (.html or .json)');
          return;
        }
      } else {
        setImportError('Could not read file — make sure it is a BSVibes recovery file (.html or .json)');
        return;
      }

      if (!parsed) {
        setImportError('File does not contain a valid recovery key');
        return;
      }

      if (parsed.wif_encrypted) {
        setEncryptedImportData({ wif_encrypted: parsed.wif_encrypted, name: parsed.name, hint: parsed.hint });
        setEncryptedImportError('');
        return;
      }

      if (parsed.wif) {
        await doImport(parsed.wif, parsed.name);
        return;
      }

      setImportError('File does not contain a valid recovery key');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleDecryptAndImport(passphrase: string): Promise<void> {
    if (!encryptedImportData) return;
    setDecryptingImport(true);
    setEncryptedImportError('');
    try {
      const wif = await decryptWif(encryptedImportData.wif_encrypted, passphrase);
      if (!wif) {
        setEncryptedImportError('Wrong passphrase — try again');
        setDecryptingImport(false);
        return;
      }
      const name = encryptedImportData.name;
      setEncryptedImportData(null);
      await doImport(wif, name);
    } catch {
      setEncryptedImportError('Something went wrong — try again');
    } finally {
      setDecryptingImport(false);
    }
  }

  async function handlePasteKeyImport(): Promise<void> {
    if (!pasteKeyValue.trim()) return;
    await doImport(pasteKeyValue.trim());
  }

  // ── Loading / identity guards ──────────────────────────────────────────

  if (isLoading) return null;

  // ── Unlock prompt ──────────────────────────────────────────────────────

  if (needsUnlock && !identity) {
    return (
      <div className="relative">
        <div
          className="w-[calc(100vw-2rem)] sm:w-72 max-w-72 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden"
          style={{ backgroundColor: '#18181b' }}
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="text-xs text-zinc-300 font-medium">Enter your passphrase to unlock</span>
          </div>
          <div className="px-3 py-3 space-y-2">
            <input
              type="password"
              placeholder="Passphrase"
              value={unlockPassphrase}
              autoFocus
              onChange={(e) => { setUnlockPassphrase(e.target.value); setUnlockError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
            {storedHint && (
              <div className="text-[10px] text-zinc-600">
                {showUnlockHint ? (
                  <span className="text-zinc-400">Clue: {storedHint}</span>
                ) : (
                  <button
                    onClick={() => setShowUnlockHint(true)}
                    className="hover:text-zinc-400 transition-colors underline underline-offset-2"
                  >
                    Need a reminder?
                  </button>
                )}
              </div>
            )}
            {unlockError && <p className="text-[11px] text-red-400">{unlockError}</p>}
            <button
              onClick={handleUnlock}
              disabled={!unlockPassphrase || unlocking}
              className="w-full bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {unlocking ? 'Unlocking...' : 'Unlock'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!identity) return null;

  const showWarningDot = backedUp === false;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Modals — rendered at root level to avoid dropdown stacking context */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onSuccess={(newIdentity, transferMsg) => {
          updateIdentity(newIdentity);
          setReAuthTime(Date.now());
          setIsProtected(true);
          setBackupConfirmed(true);
          if (transferMsg) setTransferStatus(transferMsg);
        }}
        currentIdentity={identity}
      />
      <ChangePassphraseModal
        isOpen={showChangePassModal}
        onClose={() => setShowChangePassModal(false)}
        onSuccess={(newIdentity, transferMsg) => {
          updateIdentity(newIdentity);
          setReAuthTime(Date.now());
          setIsProtected(true);
          setBackupConfirmed(true);
          if (transferMsg) setTransferStatus(transferMsg);
        }}
        currentIdentity={identity}
      />
      {showDeposit && identity && (
        <FundAddress
          address={identity.address}
          balance={balanceSats ?? undefined}
          onClose={() => setShowDeposit(false)}
        />
      )}

      {/* ── Manage Identity modal ── */}
      {showManage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeManageModal(); }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-zinc-700 shadow-2xl overflow-hidden"
            style={{ backgroundColor: '#18181b' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <p className="text-sm font-semibold text-zinc-100">Manage identity</p>
              <button
                onClick={closeManageModal}
                className="text-zinc-600 hover:text-zinc-300 transition-colors text-lg leading-none ml-3"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="divide-y divide-zinc-800/60">
              {/* Save recovery file */}
              {reAuthAction !== null ? (
                <div className="px-4 py-3">
                  <PassphrasePrompt
                    context="Enter your passphrase to continue."
                    error={reAuthError}
                    loading={reAuthLoading}
                    onConfirm={handleReAuthConfirm}
                    onCancel={() => { setReAuthAction(null); setReAuthError(''); }}
                    confirmLabel="Continue"
                    hint={storedHint}
                  />
                </div>
              ) : (
                <button
                  onClick={handleSaveFile}
                  disabled={downloading}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left disabled:opacity-40"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={backedUp === false ? 'text-red-400' : 'text-zinc-400'}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-medium block ${backedUp === false ? 'text-red-400' : 'text-zinc-200'}`}>
                      {downloading ? 'Saving...' : 'Save recovery file'}
                    </span>
                    {backedUp === false && (
                      <span className="text-[10px] text-red-400/70 block mt-0.5">Not saved yet — save now to avoid losing access</span>
                    )}
                  </div>
                  {backedUp === false && (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                  )}
                </button>
              )}

              {/* Secure / Change passphrase */}
              <button
                onClick={() => {
                  closeManageModal();
                  if (isProtected) setShowChangePassModal(true);
                  else openUpgradeModal();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={isProtected ? 'text-emerald-500' : 'text-red-400'}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  {isProtected && <path d="m9 12 2 2 4-4" />}
                </svg>
                <div className="flex-1 min-w-0">
                  <span className={`text-xs font-medium block ${isProtected ? 'text-zinc-200' : 'text-red-400'}`}>
                    {isProtected ? 'Change passphrase' : 'Secure identity'}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">
                    {isProtected ? 'Update your passphrase and download a new recovery file' : 'Add a passphrase so you can recover from any device'}
                  </span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Deposit */}
              <button
                onClick={() => { closeManageModal(); setShowDeposit(true); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="8 12 12 16 16 12" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-zinc-200 block">Deposit</span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">Receive funds to your address</span>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 shrink-0">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {/* Restore from another device */}
              {!showImport ? (
                <button
                  onClick={() => setShowImport(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-zinc-200 block">Restore from another device</span>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">Import a recovery file</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ) : (
                <div className="px-4 py-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-200">Restore from another device</span>
                    <button onClick={resetImport} className="text-[10px] text-red-400/80 hover:text-red-300 transition-colors font-medium">Cancel</button>
                  </div>
                  <p className="text-[11px] text-amber-400/80 leading-relaxed">
                    This will replace your current identity. Make sure your current recovery file is saved first.
                  </p>
                  {pendingRestoreWif !== null ? (
                    <div className="space-y-2 bg-zinc-800/40 rounded-lg p-2.5 border border-zinc-700/60">
                      <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">Your recovery file has been saved.</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">Continue with restore? This will replace your current identity.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setPendingRestoreWif(null); setPendingRestoreName(undefined); setImporting(false); }}
                          className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
                        >Cancel</button>
                        <button
                          onClick={confirmPendingRestore}
                          disabled={importing}
                          className="flex-1 bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >{importing ? 'Restoring...' : 'Continue'}</button>
                      </div>
                    </div>
                  ) : encryptedImportData !== null ? (
                    <PassphrasePrompt
                      context="This recovery file is encrypted. Enter the passphrase you used when creating it."
                      error={encryptedImportError}
                      loading={decryptingImport}
                      onConfirm={handleDecryptAndImport}
                      onCancel={() => { setEncryptedImportData(null); setEncryptedImportError(''); }}
                      confirmLabel="Restore"
                      hint={encryptedImportData.hint}
                    />
                  ) : (
                    <>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">Choose your recovery file.</p>
                      <input ref={fileInputRef} type="file" accept=".html,.json,text/html,application/json" onChange={handleImportFile} className="hidden" />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={importing}
                        className="w-full bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg px-3 py-2 text-xs font-medium hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >{importing ? 'Restoring...' : 'Choose recovery file'}</button>
                    </>
                  )}
                  {importError && <p className="text-[11px] text-red-400 leading-relaxed">{importError}</p>}
                  {importSuccess && <p className="text-[11px] text-emerald-400 font-medium">Identity restored.</p>}
                </div>
              )}

              {/* Show recovery key (advanced) */}
              {!showAdvanced ? (
                <button
                  onClick={() => requireReAuth(() => setShowAdvanced(true))}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-zinc-400">Show recovery key</span>
                      <span className="text-[9px] font-medium text-zinc-500 bg-zinc-800 border border-zinc-700/60 rounded px-1 py-px uppercase tracking-wide">Advanced</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 block mt-0.5">View, copy, or manually paste your key</span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ) : (
                <div className="px-4 py-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-200">Recovery key</span>
                    <button onClick={() => { setShowAdvanced(false); setKeyRevealed(false); setShowPasteKey(false); setPasteKeyValue(''); }} className="text-[10px] text-red-400/80 hover:text-red-300 transition-colors font-medium">Cancel</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-zinc-800/60 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 break-all leading-relaxed">
                      {keyRevealed ? identity.wif : '\u2022'.repeat(12) + identity.wif.slice(-4)}
                    </div>
                    <button onClick={handleRevealKey} className="shrink-0 text-[10px] text-zinc-500 hover:text-amber-400 transition-colors px-1">
                      {keyRevealed ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCopy} className="flex-1 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors">
                      {copied ? 'Copied' : 'Copy key'}
                    </button>
                    <button onClick={() => { setShowPasteKey((v) => !v); setPasteKeyValue(''); }} className="flex-1 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors">
                      Paste key
                    </button>
                  </div>
                  {showPasteKey && (
                    <div className="space-y-2 pt-1">
                      <textarea
                        placeholder="Paste your key here..."
                        value={pasteKeyValue}
                        onChange={(e) => { setPasteKeyValue(e.target.value); setImportError(''); }}
                        rows={3}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none leading-relaxed"
                      />
                      {importError && <p className="text-[11px] text-red-400 leading-relaxed">{importError}</p>}
                      {importSuccess && <p className="text-[11px] text-emerald-400 font-medium">Identity restored.</p>}
                      <button
                        onClick={handlePasteKeyImport}
                        disabled={!pasteKeyValue.trim() || importing}
                        className="w-full bg-zinc-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >{importing ? 'Restoring...' : 'Restore from key'}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={dropdownRef} className="relative">
        {/* Chip */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative flex items-center gap-1.5 sm:gap-2 rounded-full bg-zinc-900 border border-zinc-800 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm hover:border-zinc-700 transition-colors"
        >
          <span className={`w-2 h-2 rounded-full ${isProtected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span className="text-zinc-300">{identity.name}</span>
          {balanceSats !== null && balanceSats > 0 && (
            <AnimatedBalance sats={balanceSats} bsvPrice={bsvPrice} isGoat={isGoat} className="text-[10px]" flashTrigger={earnedSats ?? 0} />
          )}
          {showWarningDot && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
          )}
        </button>

        {open && (
          <div
            className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-80 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden max-h-[85vh] overflow-y-auto"
            style={{ backgroundColor: '#18181b' }}
          >
            {/* ── Header: name + address + close ── */}
            <div className="px-3 py-2.5 border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isProtected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className="text-sm font-medium text-zinc-200">{identity.name}</span>
                </div>
                <button
                  onClick={closeDropdown}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors text-base leading-none"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(identity.address);
                  setAddressCopied(true);
                  setTimeout(() => setAddressCopied(false), 1500);
                }}
                className="flex items-center gap-1.5 ml-4 mt-1 group cursor-copy"
              >
                <span className={`text-xs font-mono ${addressCopied ? 'text-emerald-400' : 'text-zinc-400'} group-hover:text-zinc-200 transition-colors`}>
                  {addressCopied ? 'Copied!' : `${identity.address.slice(0, 6)}...${identity.address.slice(-4)}`}
                </span>
                {!addressCopied && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 group-hover:text-zinc-200 transition-colors">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>

            {/* ── Balance + currency toggle ── */}
            <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-800">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-0.5">Balance</span>
                <span className="text-base text-emerald-400 font-medium tabular-nums">
                  {isGoat
                    ? `${(balanceSats ?? 0).toLocaleString()} sats`
                    : satsToDollars(balanceSats ?? 0, bsvPrice)}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); toggleCurrency(); }}
                className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-800 transition-colors"
                title={isGoat ? 'Switch to dollar mode' : 'Switch to sats mode'}
              >
                {isGoat ? <span>🐐 Goat</span> : <span>💵 Noob</span>}
              </button>
            </div>

            {/* ── Earnings chart + activity ── */}
            <div className="px-3 py-2.5 border-b border-zinc-800">
              <EarningsSparkline
                history={earningsHistory}
                totalSats={earnedSats ?? 0}
                isGoat={isGoat}
                bsvPrice={bsvPrice}
              />
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1.5">Activity</span>
              {activity.length === 0 ? (
                <p className="text-[11px] text-zinc-600 py-1 leading-relaxed">
                  Nothing yet — when your posts get featured, earnings appear here
                </p>
              ) : (
                <div className="max-h-[120px] overflow-y-auto space-y-1" style={{ scrollbarWidth: 'none' }}>
                  {activity.map((a, i) => {
                    const isFree = a.amount === 0;
                    const isBoot = a.label.toLowerCase().includes('boot');
                    return (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="text-zinc-500 truncate mr-2">
                          {a.label}
                          {isBoot && (
                            <span className={`ml-1 text-[10px] ${isFree ? 'text-zinc-600' : 'text-amber-600'}`}>
                              {isFree
                                ? '· free'
                                : isGoat
                                  ? `· ${a.amount.toLocaleString()} sats`
                                  : `· ${satsToDollars(a.amount, bsvPrice)}`}
                            </span>
                          )}
                        </span>
                        <span className={`font-mono shrink-0 ${a.direction === 'in' ? 'text-emerald-400' : 'text-zinc-400'}`}>
                          {isFree ? (
                            <span className="text-zinc-600 text-[10px] font-sans">FREE</span>
                          ) : (
                            <>
                              {a.direction === 'in' ? '+' : '-'}
                              {isGoat ? a.amount.toLocaleString() : satsToDollars(a.amount, bsvPrice)}
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {earnedSats !== null && earnedSats > 0 && (
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-800/60">
                  <span className="text-[10px] text-zinc-500">Total earned</span>
                  <span className="text-[10px] text-emerald-500 font-medium tabular-nums">
                    {isGoat ? `${earnedSats.toLocaleString()} sats` : satsToDollars(earnedSats, bsvPrice)}
                  </span>
                </div>
              )}
            </div>

            {/* ── Security status bar ── */}
            <div className="border-b border-zinc-800">
              {isProtected ? (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-950/30">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                  <span className="text-[11px] text-emerald-500 font-medium">Identity protected</span>
                </div>
              ) : (
                <button
                  onClick={openUpgradeModal}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-red-950/20 hover:bg-red-950/40 transition-colors cursor-pointer text-left"
                >
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span className="text-[11px] text-red-400 font-medium flex-1">Not protected</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400/60 shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              )}
            </div>

            {/* ── Transient banners ── */}
            {backupConfirmed && (
              <div className="px-3 py-2 border-b border-emerald-800/60 bg-emerald-950/40">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-emerald-400 flex-1">Recovery file saved</span>
                  <button onClick={() => setBackupConfirmed(false)} className="text-emerald-700 hover:text-emerald-400 transition-colors text-[11px]" aria-label="Dismiss">✕</button>
                </div>
              </div>
            )}
            {transferStatus && (
              <div className={`px-3 py-2 border-b text-[11px] leading-relaxed ${
                transferStatus.startsWith('Note:')
                  ? 'border-amber-900/40 bg-amber-950/20 text-amber-400'
                  : 'border-emerald-900/30 bg-emerald-950/20 text-emerald-400'
              }`}>
                {transferStatus}
                <button onClick={() => setTransferStatus(null)} className="ml-2 text-zinc-500 hover:text-zinc-300 transition-colors">Dismiss</button>
              </div>
            )}

            {/* ── Manage identity button ── */}
            <div className="px-3 py-3">
              <button
                onClick={() => setShowManage(true)}
                className="w-full flex items-center justify-center gap-2 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg px-3 py-2.5 text-xs font-medium hover:bg-zinc-700 hover:text-white transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Your identity
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
