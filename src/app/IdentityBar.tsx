'use client';

import { useState } from 'react';
import { useIdentity } from '@/hooks/useIdentity';

export function IdentityBar(): React.JSX.Element | null {
  const { identity, isLoading } = useIdentity();
  const [showKey, setShowKey] = useState(false);
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
      app: 'Build From Nothing',
    }, null, 2);
    const blob = new Blob([backup], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bfn-identity-${identity.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="w-full max-w-2xl mt-3">
      <div className="text-sm text-zinc-500">
        <span className="text-zinc-400">{identity.name}</span>
        <span className="mx-1.5">·</span>
        <button
          onClick={() => setShowKey(!showKey)}
          className="text-zinc-500 hover:text-zinc-400 transition-colors"
        >
          {showKey ? 'hide key' : 'save your key'}
        </button>
      </div>

      {showKey && (
        <div className="mt-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
          <p className="text-sm text-zinc-400 mb-2">
            This key proves you wrote your posts. Save it somewhere safe — if you clear your browser, it's gone.
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
              Download backup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
