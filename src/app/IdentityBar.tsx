'use client';

import { useState, useEffect } from 'react';
import { useIdentityContext } from '@/contexts/IdentityContext';

const BACKED_UP_KEY = 'bsvibes_identity_backed_up';

function maskWif(wif: string): string {
  return `\u2022\u2022\u2022\u2022\u2022\u2022${wif.slice(-4)}`;
}

export function IdentityChip(): React.JSX.Element | null {
  const { identity, isLoading } = useIdentityContext();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // null = not yet hydrated (avoid SSR mismatch)
  const [backedUp, setBackedUp] = useState<boolean | null>(null);

  // Hydrate from localStorage after mount
  useEffect(() => {
    setBackedUp(localStorage.getItem(BACKED_UP_KEY) === '1');
  }, []);

  if (isLoading || !identity) return null;

  function handleOpen(): void {
    const nextOpen = !open;
    setOpen(nextOpen);
    // First time the dropdown is opened — mark as backed-up-aware
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

  // Show the amber dot only once we've hydrated and the user hasn't opened the
  // dropdown yet.
  const showWarningDot = backedUp === false;

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative flex items-center gap-1.5 sm:gap-2 rounded-full bg-zinc-900 border border-zinc-800 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm hover:border-zinc-700 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-zinc-300">{identity.name}</span>

        {/* Amber dot — nudges user to save their identity at least once */}
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
          <div className="flex gap-2">
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
        </div>
      )}
    </div>
  );
}
