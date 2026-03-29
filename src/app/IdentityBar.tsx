'use client';

import { useState, useEffect, useRef } from 'react';
import { useIdentityContext } from '@/contexts/IdentityContext';
import { isIdentityEncrypted, upgradeIdentity, commitUpgrade, unlockIdentity, importIdentity, signPost } from '@/services/bsv/identity';
import { migrateIdentity, cleanupMigrations } from './actions';
import { AnimatedBalance } from '@/components/AnimatedBalance';
import { useBsvPrice, satsToDollars } from '@/hooks/useBsvPrice';
import { useCurrencyMode } from '@/hooks/useCurrencyMode';
import { EarningsSparkline } from '@/components/EarningsSparkline';

const BACKED_UP_KEY = 'bsvibes_identity_backed_up';

function maskWif(wif: string): string {
  return `\u2022\u2022\u2022\u2022\u2022\u2022${wif.slice(-4)}`;
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
  const [upgradeError, setUpgradeError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [transferStatus, setTransferStatus] = useState<string | null>(null);
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  // Import state
  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<'file' | 'wif'>('file');
  const [importWif, setImportWif] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);
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
  }, []);

  // Re-check encryption status whenever the identity changes (import/upgrade/unlock)
  useEffect(() => {
    if (!identity) return;
    const encrypted = isIdentityEncrypted();
    setIsProtected(encrypted);
    // Default: expanded when unprotected, collapsed when protected
    setRecoveryOpen(!encrypted);
  }, [identity?.address, identity?.wif]);

  // Live balance: poll WhatsOnChain every 5s (client-side, per-user, no server cost).
  // Earnings: refresh on dropdown open (less frequent, server call).
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

  // Earnings + activity: fetch on mount + each time dropdown opens
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

  // Encrypted identity needs passphrase to unlock — show unlock prompt instead of null
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

  function handleOpen(): void {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen) setShowUpgrade(false);
  }

  function handleCopy(): void {
    if (!identity) return;
    navigator.clipboard.writeText(identity.wif);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (!backedUp) {
      localStorage.setItem(BACKED_UP_KEY, '1');
      setBackedUp(true);
    }
  }

  function handleDownload(): void {
    if (!identity) return;
    const backup = JSON.stringify({
      name: identity.name,
      address: identity.address,
      wif: identity.wif,
      createdAt: new Date().toISOString(),
      app: 'BSVibes',
    }, null, 2);
    const blob = new Blob([backup], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bsvibes-${identity.name}-recovery-key.json`;
    a.click();
    URL.revokeObjectURL(url);
    if (!backedUp) {
      localStorage.setItem(BACKED_UP_KEY, '1');
      setBackedUp(true);
    }
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
      // Phase 1: generate keys, sign migration, transfer funds — but do NOT write to localStorage yet
      const result = await upgradeIdentity(passphrase, identity.wif, identity.name);

      // Phase 2: register migration on the server BEFORE committing locally
      // If this fails, we have not overwritten localStorage — user is still on old key
      await migrateIdentity(
        result.migration.oldPubkey,
        result.migration.newPubkey,
        result.migration.migrationSignature,
        result.migration.migrationMessage
      );

      // Phase 3: server confirmed — now safe to commit encrypted key to localStorage
      commitUpgrade(result.encStore);

      // FORCE auto-download backup of the NEW identity before marking upgrade complete.
      // This is the critical safety gate — the user must have the file before we proceed.
      // If the fund transfer failed, also include the OLD key so stranded funds can be recovered.
      const newIdentity = result.identity;
      const backupPayload: Record<string, string> = {
        name: newIdentity.name,
        address: newIdentity.address,
        wif: newIdentity.wif,
        createdAt: new Date().toISOString(),
        app: 'BSVibes',
        note: 'New identity created during security upgrade. Keep this file safe.',
      };
      if (result.fundTransfer.error) {
        // Transfer failed — old key may still hold funds. Include it so the user
        // can recover from the old address using any standard BSV wallet.
        backupPayload.oldWif = identity.wif;
        backupPayload.oldAddress = identity.address;
        backupPayload.oldKeyNote =
          'Fund transfer failed. Import oldWif into a BSV wallet to recover any balance from oldAddress.';
      }
      const backupData = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([backupData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bsvibes-${newIdentity.name}-recovery-key-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // Update context so UI reflects the new identity (same name, new address)
      updateIdentity(newIdentity);

      // Surface fund transfer result to the user — include new address so they know where funds went
      if (result.fundTransfer.txid) {
        const sats = result.fundTransfer.transferredSats.toLocaleString();
        setTransferStatus(`Transferred ${sats} sats to your new address (${newIdentity.address.slice(0, 8)}…${newIdentity.address.slice(-6)}).`);
        console.log(`[BSVibes] Funds transferred: ${result.fundTransfer.transferredSats} sats to ${newIdentity.address}, txid: ${result.fundTransfer.txid}`);
      } else if (result.fundTransfer.error) {
        // Non-fatal: identity is upgraded, but funds need manual recovery
        setTransferStatus(`Note: fund transfer failed — ${result.fundTransfer.error}. Your previous recovery key is saved in the backup file.`);
        console.error('[BSVibes] Fund transfer failed:', result.fundTransfer.error);
      }
      // If no error and no txid, there were simply no funds — no message needed

      setBackupConfirmed(true);
      setIsProtected(true);
      setShowUpgrade(false);
      setPassphrase('');
      setConfirmPass('');
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
  }

  async function doImport(wif: string, name?: string): Promise<void> {
    setImporting(true);
    setImportError('');
    try {
      // Auto-backup the CURRENT identity before replacing it.
      // This is a silent safety net — the file lands in Downloads with no extra clicks.
      if (identity) {
        const preImportBackup = JSON.stringify({
          name: identity.name,
          address: identity.address,
          wif: identity.wif,
          createdAt: new Date().toISOString(),
          app: 'BSVibes',
          note: 'Automatic backup saved before importing a different identity.',
        }, null, 2);
        const backupBlob = new Blob([preImportBackup], { type: 'application/json' });
        const backupUrl = URL.createObjectURL(backupBlob);
        const backupAnchor = document.createElement('a');
        backupAnchor.href = backupUrl;
        backupAnchor.download = `bsvibes-${identity.name}-recovery-key-pre-restore.json`;
        backupAnchor.click();
        URL.revokeObjectURL(backupUrl);
      }

      const imported = await importIdentity(wif, name);
      updateIdentity(imported);

      // Clean up any stale migration pointing away from this key.
      // If the user previously upgraded (creating a migration A → B) and is now
      // re-importing key A, we must remove that migration so payouts go to A, not B.
      // Fire-and-forget: non-critical, failure should not block the import flow.
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

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      let parsed: { wif?: string; name?: string };
      try {
        parsed = JSON.parse(text);
      } catch {
        setImportError('Could not read file — make sure it is a BSVibes backup (.json)');
        return;
      }
      if (!parsed?.wif) {
        setImportError('File does not contain a valid recovery key');
        return;
      }
      await doImport(parsed.wif, parsed.name);
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
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

          {/* Upgrade form (inline, under security banner) */}
          {showUpgrade && !isProtected && (
            <div className="px-3 py-3 border-b border-zinc-800 space-y-2 bg-zinc-900/50">
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Add a passphrase so your name is saved even if you clear your browser.
              </p>
              <input
                type="password"
                placeholder="Passphrase (min 8 characters)"
                value={passphrase}
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
              {upgradeError && <p className="text-[11px] text-red-400">{upgradeError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowUpgrade(false); setPassphrase(''); setConfirmPass(''); setUpgradeError(''); }}
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

          {/* Backup confirmation banner (shown immediately after upgrade) */}
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
                    Your new identity has been downloaded as a recovery key file. Keep it safe — it is the only copy.
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

          {/* Fund transfer status message (shown after upgrade if relevant) */}
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
                <span>Switch to $ 💵</span>
              ) : (
                <span>Switch to sats 🐐</span>
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
            <button
              onClick={() => setRecoveryOpen((v) => !v)}
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
            {recoveryOpen && (
              <div className="px-3 pb-2.5 space-y-2">
                <div className="flex items-center gap-1.5 bg-zinc-800/60 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-zinc-400">
                  <span className="flex-1 break-all leading-relaxed">
                    {revealed ? identity.wif : maskWif(identity.wif)}
                  </span>
                  <button
                    onClick={() => setRevealed(!revealed)}
                    className="shrink-0 text-[10px] text-zinc-500 hover:text-amber-400 transition-colors px-1"
                  >
                    {revealed ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex-1 bg-white text-black rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={handleDownload}
                    className="flex-1 bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-zinc-700 transition-colors"
                  >
                    Save file
                  </button>
                </div>
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  Save your recovery key to restore access from any device.
                </p>
              </div>
            )}
          </div>

          {/* ── Section 5: Import identity ── */}
          <div className="px-3 py-2.5">
            {!showImport ? (
              <button
                onClick={() => setShowImport(true)}
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
                      Select the <span className="font-mono text-zinc-400">.json</span> file you downloaded when you backed up your identity.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
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
