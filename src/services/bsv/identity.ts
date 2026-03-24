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

export interface Identity {
  name: string;
  address: string;
  wif: string;
}

function generateAnonName(): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `anon_${suffix}`;
}

/** Get existing identity from storage (no BSV SDK needed). */
function getStoredIdentity(): StoredIdentity | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
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
    const parsed = JSON.parse(raw);
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

  const store: StoredIdentity = { wif, name, address };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

  // Clean up old key
  if (oldName) localStorage.removeItem(OLD_IDENTITY_KEY);

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
