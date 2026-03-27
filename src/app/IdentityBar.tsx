'use client';

import { useState, useEffect, useRef } from 'react';
import { useIdentityContext } from '@/contexts/IdentityContext';
import { isIdentityEncrypted, upgradeIdentity } from '@/services/bsv/identity';
import { migrateIdentity } from './actions';
import { AnimatedBalance } from '@/components/AnimatedBalance';

const BACKED_UP_KEY = 'bsvibes_identity_backed_up';

function maskWif(wif: string): string {
  return `\u2022\u2022\u2022\u2022\u2022\u2022${wif.slice(-4)}`;
}

export function IdentityChip(): React.JSX.Element | null {
  const { identity, isLoading } = useIdentityContext();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [backedUp, setBackedUp] = useState<boolean | null>(null);
  const [isProtected, setIsProtected] = useState(false);
  const [earnedSats, setEarnedSats] = useState<number | null>(null);
  const [balanceSats, setBalanceSats] = useState<number | null>(null);
  const [activity, setActivity] = useState<Array<{ amount: number; direction: 'in' | 'out'; label: string; created_at: string; txid?: string }>>([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [upgradeError, setUpgradeError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBackedUp(localStorage.getItem(BACKED_UP_KEY) === '1');
    setIsProtected(isIdentityEncrypted());
  }, []);

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
    const interval = setInterval(fetchLiveBalance, 5_000);
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
      })
      .catch(() => setEarnedSats(0));
  }, [identity?.address, open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowUpgrade(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (isLoading || !identity) return null;

  function handleOpen(): void {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (!nextOpen) setShowUpgrade(false);
    if (nextOpen && !backedUp) {
      localStorage.setItem(BACKED_UP_KEY, '1');
      setBackedUp(true);
    }
  }

  function handleCopy(): void {
    if (!identity) return;
    navigator.clipboard.writeText(identity.wif);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
    a.download = `bsvibes-identity-${identity.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

    try {
      const result = await upgradeIdentity(passphrase, identity.wif, identity.name);

      // Register migration on the server
      await migrateIdentity(
        result.migration.oldPubkey,
        result.migration.newPubkey,
        result.migration.migrationSignature,
        result.migration.migrationMessage
      );

      setIsProtected(true);
      setShowUpgrade(false);
      setPassphrase('');
      setConfirmPass('');
    } catch (e) {
      setUpgradeError('Upgrade failed — try again');
      console.error('BSVibes: upgrade failed', e);
    } finally {
      setUpgrading(false);
    }
  }

  const showWarningDot = backedUp === false;
  const canUpgrade = passphrase.length >= 8 && passphrase === confirmPass && !upgrading;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={handleOpen}
        className="relative flex items-center gap-1.5 sm:gap-2 rounded-full bg-zinc-900 border border-zinc-800 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm hover:border-zinc-700 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full ${isProtected ? 'bg-emerald-500' : 'bg-emerald-500'}`} />
        <span className="text-zinc-300">{identity.name}</span>
        {balanceSats !== null && balanceSats > 0 && (
          <AnimatedBalance sats={balanceSats} className="text-[10px]" />
        )}

        {showWarningDot && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-80 p-3 border border-zinc-800 rounded-xl shadow-2xl z-50" style={{ backgroundColor: '#18181b' }}>
          <p className="text-sm text-zinc-400 mb-2">
            This is your identity. Save it somewhere safe — if you lose it, your posts can't be linked back to you.
          </p>
          <div className="bg-zinc-800 rounded-lg px-3 py-2 font-mono text-xs text-zinc-300 break-all mb-2">
            {revealed ? identity.wif : maskWif(identity.wif)}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={handleCopy}
              className="bg-white text-black rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-zinc-200 transition-colors"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleDownload}
              className="bg-zinc-800 text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-zinc-700 transition-colors"
            >
              Download
            </button>
            <button
              onClick={() => setRevealed(!revealed)}
              className="ml-auto bg-zinc-800 text-amber-400 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-zinc-700 hover:text-amber-300 transition-colors"
            >
              {revealed ? 'Hide' : 'Reveal'}
            </button>
          </div>

          {/* Activity feed */}
          <div className="py-2 border-t border-zinc-800">
            {balanceSats !== null && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400">Balance</span>
                <span className="text-xs text-emerald-400 font-medium">{balanceSats.toLocaleString()} sats</span>
              </div>
            )}
            {activity.length > 0 && (
              <div className="max-h-[140px] overflow-y-auto scrollbar-hide space-y-1" style={{ scrollbarWidth: 'none' }}>
                {activity.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500 truncate mr-2">{a.label}</span>
                    <span className={`font-mono shrink-0 ${a.direction === 'in' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {a.direction === 'in' ? '+' : '-'}{a.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {earnedSats !== null && earnedSats > 0 && (
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-zinc-800/60">
                <span className="text-[10px] text-zinc-500">Total earned</span>
                <span className="text-[10px] text-zinc-400">{earnedSats.toLocaleString()} sats</span>
              </div>
            )}
          </div>

          {/* Security status */}
          <div className="flex items-center gap-2 py-2 border-t border-zinc-800">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isProtected ? 'text-emerald-500' : 'text-amber-500'}>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              {isProtected && <path d="m9 12 2 2 4-4" />}
            </svg>
            <span className={`text-xs ${isProtected ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isProtected ? 'Protected' : 'Unprotected'}
            </span>
            {!isProtected && !showUpgrade && (
              <button
                onClick={() => setShowUpgrade(true)}
                className="ml-auto text-xs bg-amber-500 text-black rounded-lg px-2.5 py-1 font-medium hover:bg-amber-400 transition-colors"
              >
                Upgrade Security
              </button>
            )}
          </div>

          {/* Upgrade form */}
          {showUpgrade && !isProtected && (
            <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
              <p className="text-xs text-zinc-400">
                This creates a new, stronger identity protected by a passphrase. Your name stays the same.
              </p>
              <input
                type="password"
                placeholder="Passphrase (min 8 characters)"
                value={passphrase}
                onChange={(e) => { setPassphrase(e.target.value); setUpgradeError(''); }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              <input
                type="password"
                placeholder="Confirm passphrase"
                value={confirmPass}
                onChange={(e) => { setConfirmPass(e.target.value); setUpgradeError(''); }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
              />
              {upgradeError && (
                <p className="text-xs text-red-400">{upgradeError}</p>
              )}
              <button
                onClick={handleUpgrade}
                disabled={!canUpgrade}
                className="w-full bg-amber-500 text-black rounded-lg px-3 py-2 text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {upgrading ? 'Upgrading...' : 'Upgrade'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
