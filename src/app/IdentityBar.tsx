'use client';

import { useState, useEffect, useRef } from 'react';
import { useIdentityContext } from '@/contexts/IdentityContext';
import { isIdentityEncrypted, upgradeIdentity, commitUpgrade, unlockIdentity, importIdentity, signPost } from '@/services/bsv/identity';
import { encryptWif, decryptWif } from '@/services/bsv/crypto';
import { generateBackupHtml, type BackupData } from '@/services/bsv/backup-template';
import { migrateIdentity, cleanupMigrations } from './actions';
import { AnimatedBalance } from '@/components/AnimatedBalance';
import { useBsvPrice, satsToDollars } from '@/hooks/useBsvPrice';
import { useCurrencyMode } from '@/hooks/useCurrencyMode';
import { EarningsSparkline } from '@/components/EarningsSparkline';

const BACKED_UP_KEY = 'bsvibes_identity_backed_up';

function maskWif(wif: string): string {
  return `\u2022\u2022\u2022\u2022\u2022\u2022${wif.slice(-4)}`;
}

/** Download a BackupData object as a self-contained HTML recovery file. */
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

export function IdentityChip(): React.JSX.Element | null {
  const { identity, isLoading, needsUnlock, updateIdentity } = useIdentityContext();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [backedUp, setBackedUp] = useState<boolean | null>(null);
  const [isProtected, setIsProtected] = useState(false);
  const [earnedSats, setEarnedSats] = useState<number | null>(null);
  const [balanceSats, setBalanceSats] = useState<number | null>(null);
  const bsvPrice = useBsvPrice();
  const { mode, toggle: toggleCurrency, isGoat } = useCurrencyMode();
  const [activity, setActivity] = useState<Array<{ amount: number; direction: 'in' | 'out'; label: string; created_at: string; txid?: string }>>([]);
  const [earningsHistory, setEarningsHistory] = useState<Array<{ t: string; cumulative: number }>>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [hint, setHint] = useState('');
  const [upgradeError, setUpgradeError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);

  // Re-auth state (Change 1)
  const [reAuthTime, setReAuthTime] = useState(0);
  const [reAuthAction, setReAuthAction] = useState<(() => void) | null>(null);
  const [reAuthPassphrase, setReAuthPassphrase] = useState('');
  const [reAuthError, setReAuthError] = useState('');
  // Ref to carry passphrase into doImport without state lag (Change 5)
  const reAuthPassphraseRef = useRef('');

  // Save-file encrypt state (Change 6)
  const [showSaveEncrypt, setShowSaveEncrypt] = useState(false);
  const [saveEncryptPassphrase, setSaveEncryptPassphrase] = useState('');
  const [saveEncryptError, setSaveEncryptError] = useState('');
  const [savingEncrypted, setSavingEncrypted] = useState(false);

  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<'file' | 'wif'>('file');
  const [importWif, setImportWif] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
  // Encrypted file import state (Change 7)
  const [encryptedImportData, setEncryptedImportData] = useState<{ wif_encrypted: string; name?: string } | null>(null);
  const [encryptedImportPassphrase, setEncryptedImportPassphrase] = useState('');
  const [encryptedImportError, setEncryptedImportError] = useState('');
  const [decryptingImport, setDecryptingImport] = useState(false);
  // Protected restore confirmation state (Change 5)
  const [pendingRestoreWif, setPendingRestoreWif] = useState<string | null>(null);
  const [pendingRestoreName, setPendingRestoreName] = useState<string | undefined>(undefined);

  // Hint display state (Change 8)
  const [showHint, setShowHint] = useState(false);
  const [storedHint, setStoredHint] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // Unlock state (shown when needsUnlock === true)
  const [unlockPassphrase, setUnlockPassphrase] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(!isProtected);

  useEffect(() => {
    setBackedUp(localStorage.getItem(BACKED_UP_KEY) === '1');
    const encrypted = isIdentityEncrypted();
    setIsProtected(encrypted);
    setRecoveryOpen(!encrypted);
    // Load hint from encrypted store if present (Change 8)
    try {
      const raw = localStorage.getItem('bfn_keypair_enc');
      if (raw) {
        const parsed = JSON.parse(raw) as { hint?: string };
        setStoredHint(parsed.hint ?? null);
      }
    } catch { /* non-critical */ }
  }, []);

  // Re-check encryption status whenever the identity changes (import/upgrade/unlock)
  useEffect(() => {
    if (!identity) return;
    const encrypted = isIdentityEncrypted();
    setIsProtected(encrypted);
    // Default: expanded when unprotected, collapsed when protected
    setRecoveryOpen(!encrypted);
    // Reload hint
    try {
      const raw = localStorage.getItem('bfn_keypair_enc');
      if (raw) {
        const parsed = JSON.parse(raw) as { hint?: string };
        setStoredHint(parsed.hint ?? null);
      }
    } catch { /* non-critical */ }
  }, [identity?.address, identity?.wif]);

  // Live balance polling
  useEffect(() => {
    if (!identity?.address) return;

    function fetchLiveBalance() {
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

  // Earnings + activity
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

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowUpgrade(false);
        resetImport();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (isLoading) return null;

  // ── Unlock prompt ──
  if (needsUnlock && !identity) {
    async function handleUnlock(): Promise<void> {
      if (!unlockPassphrase) return;
      setUnlocking(true);
      setUnlockError('');
      try {
        const unlocked = await unlockIdentity(unlockPassphrase);
        if (!unlocked) {
          setUnlockError('Wrong passphrase — try again');
        } else {
          setReAuthTime(Date.now()); // grant grace window on successful unlock
          updateIdentity(unlocked);
          setUnlockPassphrase('');
        }
      } catch {
        setUnlockError('Something went wrong — try again');
      } finally {
        setUnlocking(false);
      }
    }

    return (
      <div className="relative">
        <div className="w-[calc(100vw-2rem)] sm:w-72 max-w-72 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden" style={{ backgroundColor: '#18181b' }}>
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
            {unlockError && <p className="text-[11px] text-red-400">{unlockError}</p>}
            {/* Hint display (Change 8) */}
            {storedHint && (
              <div className="text-[10px] text-zinc-600">
                {showHint ? (
                  <span className="text-zinc-400">Clue: {storedHint}</span>
                ) : (
                  <button
                    onClick={() => setShowHint(true)}
                    className="hover:text-zinc-400 transition-colors underline underline-offset-2"
                  >
                    Need a reminder?
                  </button>
                )}
              </div>
            )}
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

  // ── Change 1: Re-auth helpers ──

  function isRecentlyAuthed(): boolean {
    return Date.now() - reAuthTime <= 60_000;
  }

  function requireReAuth(action: () => void): void {
    if (!isProtected || isRecentlyAuthed()) {
      action();
      return;
    }
    // Capture action as a stable callback — use a wrapper to avoid setState callable form
    setReAuthAction(() => action);
    setReAuthPassphrase('');
    setReAuthError('');
  }

  async function handleReAuthConfirm(): Promise<void> {
    if (!reAuthPassphrase) return;
    setReAuthError('');
    try {
      const unlocked = await unlockIdentity(reAuthPassphrase);
      if (!unlocked) {
        setReAuthError('Wrong passphrase');
        return;
      }
      const ts = Date.now();
      setReAuthTime(ts);
      reAuthPassphraseRef.current = reAuthPassphrase;
      const pendingAction = reAuthAction;
      setReAuthAction(null);
      setReAuthPassphrase('');
      if (pendingAction) pendingAction();
    } catch {
      setReAuthError('Something went wrong — try again');
    }
  }

  function cancelReAuth(): void {
    setReAuthAction(null);
    setReAuthPassphrase('');
    setReAuthError('');
  }

  // ── Event handlers ──

  function handleOpen(): void {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen) setShowUpgrade(false);
  }

  function handleCopy(): void {
    requireReAuth(() => {
      if (!identity) return;
      navigator.clipboard.writeText(identity.wif);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      if (!backedUp) {
        localStorage.setItem(BACKED_UP_KEY, '1');
        setBackedUp(true);
      }
    });
  }

  function handleToggleReveal(): void {
    requireReAuth(() => setRevealed((v) => !v));
  }

  function handleDownload(): void {
    if (isProtected) {
      // Change 6: show inline encrypt + save UI
      requireReAuth(() => {
        setShowSaveEncrypt(true);
        setSaveEncryptPassphrase('');
        setSaveEncryptError('');
      });
      return;
    }
    // Unprotected: plaintext download (Change 4)
    if (!identity) return;
    downloadBackup({
      name: identity.name,
      address: identity.address,
      wif: identity.wif,
      createdAt: new Date().toISOString(),
    }, `bsvibes-${identity.name}-recovery-key.html`);
    if (!backedUp) {
      localStorage.setItem(BACKED_UP_KEY, '1');
      setBackedUp(true);
    }
  }

  async function handleSaveEncrypted(): Promise<void> {
    if (!identity || !saveEncryptPassphrase) return;
    setSavingEncrypted(true);
    setSaveEncryptError('');
    try {
      const unlocked = await unlockIdentity(saveEncryptPassphrase);
      if (!unlocked) {
        setSaveEncryptError('Wrong passphrase');
        setSavingEncrypted(false);
        return;
      }
      const encrypted = await encryptWif(identity.wif, saveEncryptPassphrase);
      const date = new Date().toISOString().slice(0, 10);
      downloadBackup({
        name: identity.name,
        address: identity.address,
        wif_encrypted: encrypted,
        createdAt: new Date().toISOString(),
        note: 'Encrypted recovery key. Use your passphrase to restore.',
      }, `bsvibes-${identity.name}-${date}.html`);
      if (!backedUp) {
        localStorage.setItem(BACKED_UP_KEY, '1');
        setBackedUp(true);
      }
      setShowSaveEncrypt(false);
      setSaveEncryptPassphrase('');
    } catch {
      setSaveEncryptError('Something went wrong — try again');
    } finally {
      setSavingEncrypted(false);
    }
  }

  function handleRecoveryToggle(): void {
    requireReAuth(() => setRecoveryOpen((v) => !v));
  }

  function handleShowImport(): void {
    requireReAuth(() => setShowImport(true));
  }

  async function handleUpgrade(): Promise<void> {
    if (!identity) return;
    if (passphrase.length < 8) {
      setUpgradeError('Passphrase must be at least 8 characters');
      return;
    }
    if (passphrase !== confirmPass) {
      setUpgradeError('Passphrases don\'t match');
      return;
    }

    setUpgrading(true);
    setUpgradeError('');
    setTransferStatus(null);

    try {
      // Phase 1: generate keys, sign migration, transfer funds
      const result = await upgradeIdentity(passphrase, identity.wif, identity.name, hint.trim() || undefined);

      // Phase 2: register migration on the server BEFORE committing locally
      await migrateIdentity(
        result.migration.oldPubkey,
        result.migration.newPubkey,
        result.migration.migrationSignature,
        result.migration.migrationMessage
      );

      // Phase 3: server confirmed — commit encrypted key to localStorage
      commitUpgrade(result.encStore);

      // Phase 4: force auto-download backup of the NEW identity (Change 2 & 3)
      const newIdentity = result.identity;
      const date = new Date().toISOString().slice(0, 10);
      const backupPayload: BackupData = {
        name: newIdentity.name,
        address: newIdentity.address,
        wif_encrypted: await encryptWif(newIdentity.wif, passphrase), // Change 2
        createdAt: new Date().toISOString(),
        note: 'Encrypted recovery key. Use your passphrase to restore.',
      };
      if (hint.trim()) {
        backupPayload.hint = hint.trim();
      }
      if (result.fundTransfer.error) {
        // Change 3: encrypt the old WIF in the backup too
        backupPayload.oldWif_encrypted = await encryptWif(identity.wif, passphrase);
      }
      downloadBackup(backupPayload, `bsvibes-${newIdentity.name}-${date}.html`);

      // Update context
      updateIdentity(newIdentity);
      setReAuthTime(Date.now()); // grant grace window after successful upgrade

      if (result.fundTransfer.txid) {
        const sats = result.fundTransfer.transferredSats.toLocaleString();
        setTransferStatus(`Transferred ${sats} sats to your new address (${newIdentity.address.slice(0, 8)}…${newIdentity.address.slice(-6)}).`);
      } else if (result.fundTransfer.error) {
        setTransferStatus(`Note: fund transfer failed — ${result.fundTransfer.error}. Your previous recovery key is saved (encrypted) in the backup file.`);
      }

      setBackupConfirmed(true);
      setIsProtected(true);
      setShowUpgrade(false);
      setPassphrase('');
      setConfirmPass('');
      setHint('');
      if (!isGoat) toggleCurrency();
    } catch (e) {
      setUpgradeError('Something went wrong — try again');
      console.error('BSVibes: upgrade failed', e);
    } finally {
      setUpgrading(false);
    }
  }

  function resetImport(): void {
    setShowImport(false);
    setImportWif('');
    setImportError('');
    setImportSuccess(false);
    setImportMode('file');
    setEncryptedImportData(null);
    setEncryptedImportPassphrase('');
    setEncryptedImportError('');
    setPendingRestoreWif(null);
    setPendingRestoreName(undefined);
  }

  async function doImport(wif: string, name?: string): Promise<void> {
    setImporting(true);
    setImportError('');
    try {
      // Change 5: if protected, auto-download backup first (encrypted if passphrase available,
      // plaintext fallback if within the re-auth grace window where passphrase was not re-entered)
      if (isProtected && identity) {
        const passForBackup = reAuthPassphraseRef.current;
        reAuthPassphraseRef.current = ''; // clear after use
        const date = new Date().toISOString().slice(0, 10);
        if (passForBackup) {
          // Preferred path: encrypted backup using the re-auth passphrase
          const encBackup = await encryptWif(identity.wif, passForBackup);
          downloadBackup({
            name: identity.name,
            address: identity.address,
            wif_encrypted: encBackup,
            createdAt: new Date().toISOString(),
            note: 'Automatic encrypted backup saved before importing a different identity.',
          }, `bsvibes-${identity.name}-${date}-backup.html`);
        } else {
          // Fallback: grace window was active so passphrase was not re-entered — use plaintext backup
          // so the user still has a recovery file before their identity is replaced.
          downloadBackup({
            name: identity.name,
            address: identity.address,
            wif: identity.wif,
            createdAt: new Date().toISOString(),
            note: 'Automatic backup saved before importing a different identity. Store this file securely.',
          }, `bsvibes-${identity.name}-${date}-backup.html`);
        }
        // Show confirmation before proceeding (both paths)
        setPendingRestoreWif(wif);
        setPendingRestoreName(name);
        setImporting(false);
        return;
      }

      // Change 4: unprotected plaintext auto-backup
      if (!isProtected && identity) {
        downloadBackup({
          name: identity.name,
          address: identity.address,
          wif: identity.wif,
          createdAt: new Date().toISOString(),
          note: 'Automatic backup saved before importing a different identity.',
        }, `bsvibes-${identity.name}-recovery-key.html`);
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
      signPost(cleanupMsg).then((sig) => {
        if (sig) {
          return cleanupMigrations(imported.pubkey, sig.signature, cleanupTs);
        }
      }).catch((err) => {
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

  function cancelPendingRestore(): void {
    setPendingRestoreWif(null);
    setPendingRestoreName(undefined);
    setImporting(false);
  }

  // Change 7: handle encrypted backup files (JSON and HTML formats)
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = (ev.target?.result as string) ?? '';

      let parsed: { wif?: string; wif_encrypted?: string; name?: string; oldWif_encrypted?: string } | null = null;

      // HTML backup: extract BACKUP_DATA JSON block
      const trimmed = text.trimStart();
      if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || text.includes('BACKUP_DATA')) {
        const match = text.match(/const BACKUP_DATA\s*=\s*(\{[\s\S]*?\});/);
        if (match) {
          try {
            parsed = JSON.parse(match[1]);
          } catch {
            setImportError('Could not read HTML backup — file may be corrupted');
            return;
          }
        } else {
          setImportError('Could not find backup data in this HTML file');
          return;
        }
      } else if (trimmed.startsWith('{')) {
        // Legacy JSON backup
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          setImportError('Could not read file — make sure it is a BSVibes backup (.html or .json)');
          return;
        }
      } else {
        setImportError('Could not read file — make sure it is a BSVibes backup (.html or .json)');
        return;
      }

      if (!parsed) {
        setImportError('File does not contain a valid recovery key');
        return;
      }

      if (parsed.wif_encrypted) {
        // Encrypted backup: show inline passphrase prompt
        setEncryptedImportData({ wif_encrypted: parsed.wif_encrypted, name: parsed.name });
        setEncryptedImportPassphrase('');
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

  async function handleDecryptAndImport(): Promise<void> {
    if (!encryptedImportData || !encryptedImportPassphrase) return;
    setDecryptingImport(true);
    setEncryptedImportError('');
    try {
      const wif = await decryptWif(encryptedImportData.wif_encrypted, encryptedImportPassphrase);
      if (!wif) {
        setEncryptedImportError('Wrong passphrase — try again');
        setDecryptingImport(false);
        return;
      }
      setEncryptedImportData(null);
      await doImport(wif, encryptedImportData.name);
    } catch {
      setEncryptedImportError('Something went wrong — try again');
    } finally {
      setDecryptingImport(false);
    }
  }

  async function handleImportWif(): Promise<void> {
    await doImport(importWif);
  }

  const showWarningDot = backedUp === false;
  const canUpgrade = passphrase.length >= 8 && passphrase === confirmPass && !upgrading;

  return (
    <div ref={dropdownRef} className="relative">
      {/* Chip */}
      <button
        onClick={handleOpen}
        className="relative flex items-center gap-1.5 sm:gap-2 rounded-full bg-zinc-900 border border-zinc-800 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm hover:border-zinc-700 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full ${isProtected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        <span className="text-zinc-300">{identity.name}</span>
        {balanceSats !== null && balanceSats > 0 && (
          <AnimatedBalance sats={balanceSats} bsvPrice={bsvPrice} isGoat={isGoat} className="text-[10px]" />
        )}
        {showWarningDot && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-80 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden max-h-[85vh] overflow-y-auto" style={{ backgroundColor: '#18181b' }}>

          {/* ── Section 1: Security ── */}
          {isProtected ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/30 border-b border-emerald-900/30">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span className="text-[11px] text-emerald-500 font-medium">Identity protected</span>
            </div>
          ) : (
            <div className={`flex items-center gap-2 px-3 py-2.5 border-b border-red-900/40 ${showUpgrade ? 'bg-red-950/30' : 'bg-red-950/20'}`}>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-xs text-red-400 font-medium flex-1">Not protected</span>
              {!showUpgrade && (
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="text-[11px] bg-red-500 text-white rounded-md px-2 py-0.5 font-medium hover:bg-red-400 transition-colors shrink-0"
                >
                  Secure now
                </button>
              )}
            </div>
          )}

          {/* Upgrade form */}
          {showUpgrade && !isProtected && (
            <div className="px-3 py-3 border-b border-zinc-800 space-y-2 bg-zinc-900/50">
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Add a passphrase so your name is saved even if you clear your browser.
              </p>
              <input
                type="password"
                placeholder="Passphrase (min 8 characters)"
                value={passphrase}
                autoFocus
                onChange={(e) => { setPassphrase(e.target.value); setUpgradeError(''); }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <input
                type="password"
                placeholder="Confirm passphrase"
                value={confirmPass}
                onChange={(e) => { setConfirmPass(e.target.value); setUpgradeError(''); }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              {/* Change 8: optional hint */}
              <input
                type="text"
                placeholder={`Memory clue (optional) — e.g. "blue house + 2019"`}
                value={hint}
                maxLength={100}
                onChange={(e) => setHint(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <p className="text-[10px] text-zinc-600 leading-relaxed">Clue is stored as plaintext — do not include password fragments.</p>
              {upgradeError && <p className="text-[11px] text-red-400">{upgradeError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowUpgrade(false); setPassphrase(''); setConfirmPass(''); setHint(''); setUpgradeError(''); }}
                  className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpgrade}
                  disabled={!canUpgrade}
                  className="flex-1 bg-red-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {upgrading ? 'Securing...' : 'Secure identity'}
                </button>
              </div>
            </div>
          )}

          {/* Backup confirmation banner */}
          {backupConfirmed && (
            <div className="px-3 py-2.5 border-b border-emerald-800/60 bg-emerald-950/40">
              <div className="flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 shrink-0 mt-0.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-emerald-300 font-semibold leading-snug">Recovery key saved to your device</p>
                  <p className="text-[11px] text-emerald-500/90 leading-relaxed mt-0.5">
                    Your new identity has been downloaded as an encrypted recovery key file. Keep it safe — it is the only copy.
                  </p>
                </div>
                <button
                  onClick={() => setBackupConfirmed(false)}
                  className="shrink-0 text-emerald-700 hover:text-emerald-400 transition-colors text-[11px] leading-none pt-0.5"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Fund transfer status */}
          {transferStatus && (
            <div className={`px-3 py-2 border-b text-[11px] leading-relaxed ${
              transferStatus.startsWith('Note:')
                ? 'border-amber-900/40 bg-amber-950/20 text-amber-400'
                : 'border-emerald-900/30 bg-emerald-950/20 text-emerald-400'
            }`}>
              {transferStatus}
              <button
                onClick={() => setTransferStatus(null)}
                className="ml-2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* ── Section 2: Balance + Currency toggle ── */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-0.5">Balance</span>
              <span className="text-sm text-emerald-400 font-medium tabular-nums">
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
              {isGoat ? (
                <span>🐐 Goat</span>
              ) : (
                <span>💵 Noob</span>
              )}
            </button>
          </div>

          {/* ── Section 3: Earnings Chart + Activity ── */}
          <div className="px-3 py-2.5 border-b border-zinc-800">
            <EarningsSparkline
              history={earningsHistory}
              totalSats={earnedSats ?? 0}
              isGoat={isGoat}
              bsvPrice={bsvPrice}
            />
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1.5">Activity</span>
            {activity.length === 0 ? (
              <p className="text-[11px] text-zinc-600 py-1 leading-relaxed">Nothing yet — when your posts get featured, earnings appear here</p>
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

          {/* ── Section 4: Recovery key ── */}
          <div className="border-b border-zinc-800">
            {/* Change 1: re-auth gate on toggle */}
            <button
              onClick={handleRecoveryToggle}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-zinc-800/40 transition-colors"
            >
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Recovery key</span>
              <svg
                width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                className={`text-zinc-600 transition-transform duration-200 ${recoveryOpen ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Change 1: inline re-auth prompt */}
            {reAuthAction !== null && (
              <div className="px-3 pb-3 space-y-2 bg-zinc-900/70">
                <p className="text-[11px] text-zinc-400">Confirm your passphrase to continue.</p>
                <input
                  type="password"
                  placeholder="Passphrase"
                  value={reAuthPassphrase}
                  autoFocus
                  onChange={(e) => { setReAuthPassphrase(e.target.value); setReAuthError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleReAuthConfirm(); }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                />
                {reAuthError && <p className="text-[11px] text-red-400">{reAuthError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={cancelReAuth}
                    className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReAuthConfirm}
                    disabled={!reAuthPassphrase}
                    className="flex-1 bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}

            {recoveryOpen && reAuthAction === null && (
              <div className="px-3 pb-2.5 space-y-2">
                <div className="flex items-center gap-1.5 bg-zinc-800/60 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-zinc-400">
                  <span className="flex-1 break-all leading-relaxed">
                    {revealed ? identity.wif : maskWif(identity.wif)}
                  </span>
                  {/* Change 1: gate show/hide behind re-auth */}
                  <button
                    onClick={handleToggleReveal}
                    className="shrink-0 text-[10px] text-zinc-500 hover:text-amber-400 transition-colors px-1"
                  >
                    {revealed ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="flex gap-2">
                  {/* Change 1: gate copy behind re-auth */}
                  <button
                    onClick={handleCopy}
                    className="flex-1 bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  {/* Change 6: gate save file behind re-auth */}
                  <button
                    onClick={handleDownload}
                    className="flex-1 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
                  >
                    Save file
                  </button>
                </div>

                {/* Change 6: inline encrypted save form for protected users */}
                {showSaveEncrypt && isProtected && (
                  <div className="space-y-2 pt-1 border-t border-zinc-700/60">
                    <p className="text-[11px] text-zinc-400">Enter your passphrase to save an encrypted backup.</p>
                    <input
                      type="password"
                      placeholder="Passphrase"
                      value={saveEncryptPassphrase}
                      autoFocus
                      onChange={(e) => { setSaveEncryptPassphrase(e.target.value); setSaveEncryptError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEncrypted(); }}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                    />
                    {saveEncryptError && <p className="text-[11px] text-red-400">{saveEncryptError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowSaveEncrypt(false); setSaveEncryptPassphrase(''); setSaveEncryptError(''); }}
                        className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveEncrypted}
                        disabled={!saveEncryptPassphrase || savingEncrypted}
                        className="flex-1 bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {savingEncrypted ? 'Saving...' : 'Save encrypted'}
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  {isProtected
                    ? 'Your backup will be encrypted with your passphrase.'
                    : 'Save your recovery key to restore access from any device.'}
                </p>
              </div>
            )}
          </div>

          {/* ── Section 5: Import identity ── */}
          <div className="px-3 py-2.5">
            {!showImport ? (
              /* Change 1: gate "Restore from another device" behind re-auth */
              <button
                onClick={handleShowImport}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors py-0.5"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Restore from another device
              </button>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Restore from another device</span>
                  <button
                    onClick={resetImport}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                <p className="text-[11px] text-amber-400/80 leading-relaxed">
                  This will replace your current identity. Make sure you have your current key backed up first.
                </p>

                {/* Change 5: protected restore confirmation */}
                {pendingRestoreWif !== null ? (
                  <div className="space-y-2 bg-zinc-800/40 rounded-lg p-2.5 border border-zinc-700/60">
                    <p className="text-[11px] text-zinc-300 leading-relaxed font-medium">Your encrypted backup has been saved.</p>
                    <p className="text-[11px] text-zinc-500 leading-relaxed">Continue with restore? This will replace your current identity.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={cancelPendingRestore}
                        className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmPendingRestore}
                        disabled={importing}
                        className="flex-1 bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {importing ? 'Restoring...' : 'Continue'}
                      </button>
                    </div>
                  </div>
                ) : encryptedImportData !== null ? (
                  /* Change 7: encrypted file passphrase prompt */
                  <div className="space-y-2">
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      This backup is encrypted. Enter the passphrase you used when creating it.
                    </p>
                    <input
                      type="password"
                      placeholder="Passphrase for this backup"
                      value={encryptedImportPassphrase}
                      autoFocus
                      onChange={(e) => { setEncryptedImportPassphrase(e.target.value); setEncryptedImportError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleDecryptAndImport(); }}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                    />
                    {encryptedImportError && <p className="text-[11px] text-red-400">{encryptedImportError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEncryptedImportData(null); setEncryptedImportPassphrase(''); setEncryptedImportError(''); }}
                        className="flex-1 bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDecryptAndImport}
                        disabled={!encryptedImportPassphrase || decryptingImport}
                        className="flex-1 bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {decryptingImport ? 'Decrypting...' : 'Restore'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Mode toggle */}
                    <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-[11px]">
                      <button
                        onClick={() => { setImportMode('file'); setImportError(''); }}
                        className={`flex-1 py-1.5 font-medium transition-colors ${importMode === 'file' ? 'bg-zinc-700 text-white' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}
                      >
                        Backup file
                      </button>
                      <button
                        onClick={() => { setImportMode('wif'); setImportError(''); }}
                        className={`flex-1 py-1.5 font-medium transition-colors ${importMode === 'wif' ? 'bg-zinc-700 text-white' : 'bg-transparent text-zinc-500 hover:text-zinc-300'}`}
                      >
                        Paste key
                      </button>
                    </div>

                    {importMode === 'file' ? (
                      <>
                        <p className="text-[11px] text-zinc-500 leading-relaxed">
                          Select the <span className="font-mono text-zinc-400">.html</span> file you downloaded when you backed up your identity.
                        </p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".html,.json,text/html,application/json"
                          onChange={handleImportFile}
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={importing}
                          className="w-full bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {importing ? 'Restoring...' : 'Choose backup file'}
                        </button>
                      </>
                    ) : (
                      <>
                        <textarea
                          placeholder="Paste your key here..."
                          value={importWif}
                          onChange={(e) => { setImportWif(e.target.value); setImportError(''); }}
                          rows={3}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-none leading-relaxed"
                        />
                        <button
                          onClick={handleImportWif}
                          disabled={!importWif.trim() || importing}
                          className="w-full bg-zinc-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {importing ? 'Restoring...' : 'Restore from key'}
                        </button>
                      </>
                    )}
                  </>
                )}

                {importError && (
                  <p className="text-[11px] text-red-400 leading-relaxed">{importError}</p>
                )}
                {importSuccess && (
                  <p className="text-[11px] text-emerald-400 font-medium">Identity restored.</p>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
