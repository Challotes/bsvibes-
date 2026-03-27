'use client';

import { useState } from 'react';

interface FundAddressProps {
  address: string;
  bootPrice: number;
  balance?: number;
  onClose: () => void;
}

export function FundAddress({ address, bootPrice, balance, onClose }: FundAddressProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // How much more the user needs to top up (at minimum enough for one boot + small buffer)
  const shortfall = balance !== undefined && balance < bootPrice
    ? bootPrice - balance
    : null;

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

        {/* Balance breakdown when we know the user's current balance */}
        {balance !== undefined ? (
          <div className="bg-zinc-800/60 rounded-lg px-3 py-2.5 mb-3 text-xs space-y-1">
            <div className="flex justify-between text-zinc-400">
              <span>Your balance</span>
              <span className="font-mono text-zinc-200">{balance.toLocaleString()} sats</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Boot costs</span>
              <span className="font-mono text-zinc-200">{bootPrice.toLocaleString()} sats</span>
            </div>
            {shortfall !== null && (
              <div className="flex justify-between text-amber-400 pt-1 border-t border-zinc-700/60">
                <span>Top up needed</span>
                <span className="font-mono">{shortfall.toLocaleString()} sats</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-400 mb-3">
            Send BSV to this address to keep booting posts. Each boot costs {bootPrice.toLocaleString()} sats.
          </p>
        )}

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
          {balance !== undefined && balance > 0
            ? `Deposit at least ${shortfall !== null ? shortfall.toLocaleString() : bootPrice.toLocaleString()} more sats to this address`
            : 'Even 10,000 sats covers many boots'}
        </p>
      </div>
    </div>
  );
}
