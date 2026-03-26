'use client';

import { useState } from 'react';

interface FundAddressProps {
  address: string;
  bootPrice: number;
  onClose: () => void;
}

export function FundAddress({ address, bootPrice, onClose }: FundAddressProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:w-96 max-w-96 bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Fund your deposit slot</h3>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-zinc-400 mb-3">
          Send BSV to this address to keep booting posts. Each boot costs {bootPrice.toLocaleString()} sats.
        </p>

        {/* Address display */}
        <div
          onClick={handleCopy}
          className="bg-zinc-800 rounded-lg px-3 py-3 font-mono text-xs text-zinc-200 break-all mb-3 cursor-pointer hover:bg-zinc-700 transition-colors"
        >
          {address}
        </div>

        <button
          onClick={handleCopy}
          className="w-full bg-amber-500 text-black rounded-lg px-3 py-2 text-sm font-medium hover:bg-amber-400 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy Address'}
        </button>

        <p className="text-[10px] text-zinc-600 text-center mt-2">
          Even 10,000 sats covers many boots
        </p>
      </div>
    </div>
  );
}
