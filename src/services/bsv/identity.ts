/**
 * BSV identity management for BSVibes.
 * Auto-generates a keypair on first visit.
 * Supports plaintext (Phase 1) and encrypted (Phase 4) storage.
 * Private key never leaves the browser.
 */

const STORAGE_KEY = 'bfn_keypair';
const OLD_IDENTITY_KEY = 'bfn_identity';
const ENCRYPTED_KEY = 'bfn_keypair_enc';

interface StoredIdentity {
  wif: string;
  name: string;
  address: string;
}

import type { Identity } from '@/types';
export type { Identity };

import { generateAnonName } from '@/lib/utils';
import { encryptWif, decryptWif, isEncrypted } from './crypto';

/**
 * Cached BSV SDK module promise — imported once, reused everywhere.
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

/**
 * Session-cached identity for encrypted mode — decrypted once per session.
 */
let _sessionIdentity: Identity | null = null;

/** Get existing identity from storage (plaintext only). */
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

/** Check if the identity is stored in encrypted format. */
export function isIdentityEncrypted(): boolean {
  if (typeof window === 'undefined') return false;
  const enc = localStorage.getItem(ENCRYPTED_KEY);
  return enc !== null && isEncrypted(enc);
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

/** Get or create the user's identity. Returns null if encrypted (needs unlock). */
export async function getIdentity(): Promise<Identity | null> {
  if (typeof window === 'undefined') return null;

  // If session has a decrypted identity, use it
  if (_sessionIdentity) return _sessionIdentity;

  // If encrypted, can't return identity without passphrase
  if (isIdentityEncrypted()) return null;

  const stored = getStoredIdentity();
  if (stored) {
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

/**
 * Unlock an encrypted identity with a passphrase.
 * Returns the identity if passphrase is correct, null if wrong.
 * Caches the decrypted identity in memory for the session.
 */
export async function unlockIdentity(passphrase: string): Promise<Identity | null> {
  if (typeof window === 'undefined') return null;

  const enc = localStorage.getItem(ENCRYPTED_KEY);
  if (!enc) return null;

  // The encrypted format stores: enc:<base64> with metadata as a JSON wrapper
  let encData: { encrypted: string; name: string; address: string };
  try {
    encData = JSON.parse(enc);
  } catch {
    return null;
  }

  const wif = await decryptWif(encData.encrypted, passphrase);
  if (!wif) return null;

  // Cache for session
  _sessionIdentity = { name: encData.name, address: encData.address, wif };

  // Pre-warm SDK and cache key
  const { PrivateKey } = await getBsvSdk();
  _cachedWif = wif;
  _cachedPrivateKey = PrivateKey.fromWif(wif);

  return _sessionIdentity;
}

/**
 * Upgrade identity: generate new key, encrypt it, sign migration.
 * Returns the new identity + migration data for on-chain posting.
 */
export async function upgradeIdentity(
  passphrase: string,
  oldWif: string,
  currentName: string
): Promise<{
  identity: Identity;
  migration: {
    oldPubkey: string;
    newPubkey: string;
    migrationMessage: string;
    migrationSignature: string;
  };
}> {
  const { PrivateKey } = await getBsvSdk();

  // Generate new keypair
  const newKey = PrivateKey.fromRandom();
  const newWif = newKey.toWif();
  const newAddress = newKey.toPublicKey().toAddress().toString();
  const newPubkey = newKey.toPublicKey().toString();

  // Old key signs migration message
  const oldKey = PrivateKey.fromWif(oldWif);
  const oldPubkey = oldKey.toPublicKey().toString();

  const migrationMessage = JSON.stringify({
    app: 'bsvibes',
    type: 'migration',
    from_pubkey: oldPubkey,
    to_pubkey: newPubkey,
    ts: Date.now(),
  });

  const msgBytes = Array.from(new TextEncoder().encode(migrationMessage));
  const sig = oldKey.sign(msgBytes);
  const migrationSignature = sig.toDER('hex') as string;

  // Encrypt new WIF
  const encrypted = await encryptWif(newWif, passphrase);

  // Store encrypted identity
  const encStore = JSON.stringify({
    encrypted,
    name: currentName,
    address: newAddress,
  });

  try {
    localStorage.setItem(ENCRYPTED_KEY, encStore);
    // Remove plaintext key
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('BSVibes: could not store encrypted identity', err);
  }

  // Cache for session
  const identity = { name: currentName, address: newAddress, wif: newWif };
  _sessionIdentity = identity;
  _cachedWif = newWif;
  _cachedPrivateKey = newKey;

  return {
    identity,
    migration: {
      oldPubkey,
      newPubkey,
      migrationMessage,
      migrationSignature,
    },
  };
}

/** Sign post content. Returns signature + pubkey hex. */
export async function signPost(content: string): Promise<{ signature: string; pubkey: string } | null> {
  if (typeof window === 'undefined') return null;

  // Try session identity first (encrypted mode), then stored (plaintext mode)
  const wif = _sessionIdentity?.wif ?? getStoredIdentity()?.wif;
  if (!wif) return null;

  const { PrivateKey } = await getBsvSdk();

  if (_cachedWif !== wif || !_cachedPrivateKey) {
    _cachedWif = wif;
    _cachedPrivateKey = PrivateKey.fromWif(wif);
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
