'use client';

import { useState } from 'react';
import { useIdentityContext } from '@/contexts/IdentityContext';

function maskWif(wif: string): string {
  return `\u2022\u2022\u2022\u2022\u2022\u2022${wif.slice(-4)}`;
}

export function IdentityChip(): React.JSX.Element | null {
  const { identity, isLoading } = useIdentityContext();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  if (isLoading || !identity) return null;

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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 sm:gap-2 rounded-full bg-zinc-900 border border-zinc-800 px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm hover:border-zinc-700 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-zinc-300">{identity.name}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-w-80 p-3 border border-zinc-800 rounded-xl shadow-2xl z-50" style={{ backgroundColor: '#18181b' }}>
          <p className="text-sm text-zinc-400 mb-2">
            This key proves you wrote your posts. Save it somewhere safe.
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
