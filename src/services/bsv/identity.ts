/**
 * BSV identity management for BSVibes.
 * Auto-generates a keypair on first visit.
 * Private key never leaves the browser.
 */

const STORAGE_KEY = 'bfn_keypair';
const OLD_IDENTITY_KEY = 'bfn_identity';

interface StoredIdentity {
  wif: string;
  name: string;
  address: string;
}

import type { Identity } from '@/types';
export type { Identity };

import { generateAnonName } from '@/lib/utils';

/** Get existing identity from storage (no BSV SDK needed). */
function getStoredIdentity(): StoredIdentity | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  let parsed: StoredIdentity;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  // Check if it has a valid wif (old format may not)
  if (!parsed.wif) return null;
  return parsed as StoredIdentity;
}

/** Check for old identity format (just a name string, no keypair). */
function getOldIdentityName(): string | null {
  if (typeof window === 'undefined') return null;
  // Old format: bfn_identity stored just the name string
  const oldName = localStorage.getItem(OLD_IDENTITY_KEY);
  if (oldName && /^anon_[a-z0-9]{4}$/.test(oldName)) return oldName;
  // Old format: bfn_keypair stored without a wif
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    let parsed: StoredIdentity;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed.wif && parsed.name) return parsed.name;
  }
  return null;
}

/** Get or create the user's identity. Returns null on server. */
export async function getIdentity(): Promise<Identity | null> {
  if (typeof window === 'undefined') return null;

  const stored = getStoredIdentity();
  if (stored) {
    return { name: stored.name, address: stored.address, wif: stored.wif };
  }

  // Check for old identity to preserve the anon name
  const oldName = getOldIdentityName();

  // Generate keypair (dynamic import to avoid bundling issues)
  const { PrivateKey } = await import('@bsv/sdk');
  const key = PrivateKey.fromRandom();
  const address = key.toAddress().toString();
  const name = oldName ?? generateAnonName();
  const wif = key.toWif();

  // Re-read localStorage before writing — another tab may have raced and written first
  const raceCheck = getStoredIdentity();
  if (raceCheck) {
    return { name: raceCheck.name, address: raceCheck.address, wif: raceCheck.wif };
  }

  const store: StoredIdentity = { wif, name, address };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn('BSVibes: could not persist identity to localStorage (private mode or storage full). Identity is valid for this session only.', err);
  }

  // Clean up old key
  if (oldName) {
    try {
      localStorage.removeItem(OLD_IDENTITY_KEY);
    } catch {
      // Non-critical — ignore
    }
  }

  return { name, address, wif };
}

/** Sign post content. Returns signature + pubkey hex. */
export async function signPost(content: string): Promise<{ signature: string; pubkey: string } | null> {
  if (typeof window === 'undefined') return null;

  const stored = getStoredIdentity();
  if (!stored) return null;

  const { PrivateKey } = await import('@bsv/sdk');
  const key = PrivateKey.fromWif(stored.wif);
  const messageBytes = Array.from(new TextEncoder().encode(content));
  const sig = key.sign(messageBytes);

  return {
    signature: sig.toDER('hex') as string,
    pubkey: key.toPublicKey().toString(),
  };
}
