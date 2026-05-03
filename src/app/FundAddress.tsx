"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

interface FundAddressProps {
  address: string;
  bootPrice?: number;
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
  const shortfall =
    bootPrice && balance !== undefined && balance < bootPrice ? bootPrice - balance : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
    >
      {/* Backdrop click closes */}
      <button
        type="button"
        className="absolute inset-0 w-full cursor-default"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="relative z-10 w-full flex items-center justify-center">
        <div
          className="w-full max-w-sm rounded-xl border border-amber-400/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden"
          style={{ backgroundColor: "#0f0f0f" }}
        >
          {/* Gold top stripe */}
          <div className="h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-400/10">
            <p className="text-sm font-semibold text-zinc-100">Deposit</p>
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-200 transition-colors ml-3"
              aria-label="Close"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-4 space-y-3">
            {/* QR hero — high-contrast white square scans reliably across all wallets */}
            <div className="flex justify-center">
              <div className="bg-white rounded-lg p-2">
                <QRCodeSVG value={address} size={180} bgColor="#ffffff" fgColor="#000000" />
              </div>
            </div>

            {/* Balance + boot cost breakdown (only when boot context exists) */}
            {bootPrice ? (
              balance !== undefined ? (
                <div className="bg-zinc-800/60 rounded-lg px-3 py-2.5 text-xs space-y-1">
                  <div className="flex justify-between text-zinc-400">
                    <span>Your balance</span>
                    <span className="font-mono text-zinc-200">{balance.toLocaleString()} sats</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Boot costs</span>
                    <span className="font-mono text-zinc-200">
                      {bootPrice.toLocaleString()} sats
                    </span>
                  </div>
                  {shortfall !== null && (
                    <div className="flex justify-between text-amber-400 pt-1 border-t border-zinc-700/60">
                      <span>Top up needed</span>
                      <span className="font-mono">{shortfall.toLocaleString()} sats</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-400">
                  Send BSV to this address to keep booting posts.
                </p>
              )
            ) : (
              <p className="text-xs text-zinc-400">Send BSV to your address below.</p>
            )}

            {/* Address (click-to-copy) */}
            <button
              type="button"
              onClick={handleCopy}
              className="w-full text-left bg-zinc-900 border border-amber-400/15 rounded-lg px-3 py-3 font-mono text-xs text-zinc-200 break-all cursor-pointer hover:bg-zinc-800 transition-colors"
            >
              {address}
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="w-full bg-amber-400 text-black rounded-lg px-3 py-2 text-xs font-medium hover:bg-amber-300 transition-colors"
            >
              {copied ? "Copied!" : "Copy Address"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
