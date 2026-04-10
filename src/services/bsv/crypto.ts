/**
 * AES-256-GCM encryption for BSV WIF keys.
 * Uses Web Crypto API — no external dependencies.
 * The passphrase is never stored — only used to derive the AES key.
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const ENCRYPTED_PREFIX = "enc:";

/**
 * Derive an AES-256 key from a passphrase and salt using PBKDF2.
 */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a WIF string with a passphrase.
 * Returns a prefixed base64 string: "enc:<base64(salt + iv + ciphertext)>"
 */
export async function encryptWif(wif: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    key,
    new TextEncoder().encode(wif) as BufferSource
  );

  // Concatenate: salt (16) + iv (12) + ciphertext
  const combined = new Uint8Array(SALT_BYTES + IV_BYTES + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_BYTES);
  combined.set(new Uint8Array(ciphertext), SALT_BYTES + IV_BYTES);

  return ENCRYPTED_PREFIX + btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a WIF string with a passphrase.
 * Returns the WIF on success, null if the passphrase is wrong.
 */
export async function decryptWif(encrypted: string, passphrase: string): Promise<string | null> {
  if (!encrypted.startsWith(ENCRYPTED_PREFIX)) return null;

  try {
    const data = encrypted.slice(ENCRYPTED_PREFIX.length);
    const combined = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

    const salt = combined.slice(0, SALT_BYTES);
    const iv = combined.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const ciphertext = combined.slice(SALT_BYTES + IV_BYTES);

    const key = await deriveKey(passphrase, salt);

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    // Wrong passphrase or corrupted data
    return null;
  }
}

/**
 * Check if a stored value is in encrypted format.
 */
export function isEncrypted(stored: string): boolean {
  return stored.startsWith(ENCRYPTED_PREFIX);
}
