'use client';

import { useState } from 'react';
import { useIdentity } from '@/hooks/useIdentity';

export function IdentityChip(): React.JSX.Element | null {
  const { identity, isLoading } = useIdentity();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
        className="flex items-center gap-2 rounded-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-sm hover:border-zinc-700 transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="text-zinc-300">{identity.name}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 p-3 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50">
          <p className="text-sm text-zinc-400 mb-2">
            This key proves you wrote your posts. Save it somewhere safe.
          </p>
          <div className="bg-zinc-800 rounded-lg px-3 py-2 font-mono text-xs text-zinc-300 break-all mb-2">
            {identity.wif}
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
          </div>
        </div>
      )}
    </div>
  );
}
