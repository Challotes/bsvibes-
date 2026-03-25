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

/**
 * Cached BSV SDK module promise — imported once, reused everywhere.
 * The chunk starts downloading the first time getBsvSdk() is called.
 */
let _bsvSdkPromise: Promise<typeof import('@bsv/sdk')> | null = null;

function getBsvSdk(): Promise<typeof import('@bsv/sdk')> {
  if (!_bsvSdkPromise) {
    _bsvSdkPromise = import('@bsv/sdk');
  }
  return _bsvSdkPromise;
}

/**
 * Cached PrivateKey — WIF never changes for a session, so parse it once.
 */
let _cachedWif: string | null = null;
let _cachedPrivateKey: import('@bsv/sdk').PrivateKey | null = null;

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
  if (!parsed.wif) return null;
  return parsed as StoredIdentity;
}

/** Check for old identity format (just a name string, no keypair). */
function getOldIdentityName(): string | null {
  if (typeof window === 'undefined') return null;
  const oldName = localStorage.getItem(OLD_IDENTITY_KEY);
  if (oldName && /^anon_[a-z0-9]{4}$/.test(oldName)) return oldName;
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
    // Kick off SDK download now so it's ready when user posts
    getBsvSdk();
    return { name: stored.name, address: stored.address, wif: stored.wif };
  }

  const oldName = getOldIdentityName();

  const { PrivateKey } = await getBsvSdk();
  const key = PrivateKey.fromRandom();
  const address = key.toAddress().toString();
  const name = oldName ?? generateAnonName();
  const wif = key.toWif();

  const raceCheck = getStoredIdentity();
  if (raceCheck) {
    return { name: raceCheck.name, address: raceCheck.address, wif: raceCheck.wif };
  }

  const store: StoredIdentity = { wif, name, address };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (err) {
    console.warn('BSVibes: could not persist identity to localStorage', err);
  }

  if (oldName) {
    try {
      localStorage.removeItem(OLD_IDENTITY_KEY);
    } catch {
      // Non-critical
    }
  }

  return { name, address, wif };
}

/** Sign post content. Returns signature + pubkey hex. */
export async function signPost(content: string): Promise<{ signature: string; pubkey: string } | null> {
  if (typeof window === 'undefined') return null;

  const stored = getStoredIdentity();
  if (!stored) return null;

  const { PrivateKey } = await getBsvSdk();

  // Cache the parsed key — fromWif() is expensive BigNumber work
  if (_cachedWif !== stored.wif || !_cachedPrivateKey) {
    _cachedWif = stored.wif;
    _cachedPrivateKey = PrivateKey.fromWif(stored.wif);
  }

  const messageBytes = Array.from(new TextEncoder().encode(content));
  const sig = _cachedPrivateKey.sign(messageBytes);

  return {
    signature: sig.toDER('hex') as string,
    pubkey: _cachedPrivateKey.toPublicKey().toString(),
  };
}

/** Pre-warm the BSV SDK by starting the download early. */
export function preWarmBsvSdk(): void {
  getBsvSdk();
}
