'use client';

import { useState, useEffect, useRef } from 'react';
import { useIdentityContext } from '@/contexts/IdentityContext';
import { isIdentityEncrypted, upgradeIdentity } from '@/services/bsv/identity';
import { migrateIdentity } from './actions';
import { AnimatedBalance } from '@/components/AnimatedBalance';
import { useBsvPrice, satsToDollars } from '@/hooks/useBsvPrice';
import { useCurrencyMode } from '@/hooks/useCurrencyMode';
import { EarningsSparkline } from '@/components/EarningsSparkline';

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
  const bsvPrice = useBsvPrice();
  const { mode, toggle: toggleCurrency, isGoat } = useCurrencyMode();
  const [activity, setActivity] = useState<Array<{ amount: number; direction: 'in' | 'out'; label: string; created_at: string; txid?: string }>>([]);
  const [earningsHistory, setEarningsHistory] = useState<Array<{ t: string; cumulative: number }>>([]);
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
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-80 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden" style={{ backgroundColor: '#18181b' }}>

          {/* ── Section 1: Security ── */}
          {isProtected ? (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-950/40 border-b border-emerald-900/40">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span className="text-xs text-emerald-400 font-medium">Identity protected</span>
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
                Creates a new passphrase-protected identity. Your name stays the same.
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

          {/* ── Section 2: Balance + Currency toggle ── */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-0.5">Balance</span>
              <span className="text-sm text-emerald-400 font-medium tabular-nums">
                {balanceSats !== null
                  ? isGoat
                    ? `${balanceSats.toLocaleString()} sats`
                    : satsToDollars(balanceSats, bsvPrice)
                  : '—'}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); toggleCurrency(); }}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 hover:bg-zinc-800 transition-colors"
              title={isGoat ? 'Switch to Noob Mode ($)' : 'Switch to Goat Mode (sats)'}
            >
              {isGoat ? (
                <>
                  <span>🐐</span>
                  <span>Goat</span>
                </>
              ) : (
                <>
                  <span>💵</span>
                  <span>Noob</span>
                </>
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
              <p className="text-[11px] text-zinc-600 py-1">No activity yet</p>
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

          {/* ── Section 4: Identity backup ── */}
          <div className="px-3 py-2.5">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide block mb-1.5">Keep your name</span>
            <div className="flex items-center gap-1.5 bg-zinc-800/60 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-zinc-400 mb-2">
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
                Download
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
              Save this to keep your name if you clear your browser data.
            </p>
          </div>

        </div>
      )}
    </div>
  );
}
