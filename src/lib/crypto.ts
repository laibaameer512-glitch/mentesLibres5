/**
 * Client-Side Cryptographic Engine for Sakhi Vault
 * Implements AES-GCM 256-bit encryption with PBKDF2 (100,000 iterations) key derivation
 * using the browser's native Web Crypto API.
 * Never stores plain PINs; only salted verifier hashes.
 */

const PBKDF2_ITERATIONS = 600000;
const AES_KEY_LENGTH = 256;

// Convert ArrayBuffer to Hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert Hex string to Uint8Array
function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Generate cryptographically secure random bytes
export function getRandomBytes(len: number): Uint8Array {
  const array = new Uint8Array(len);
  window.crypto.getRandomValues(array);
  return array;
}

export interface PinVerifierData {
  saltHex: string;
  verifierHex: string;
}

/**
 * Derives a salted verifier hash for a PIN to securely verify entry without saving the PIN.
 */
export async function createPinVerifier(pin: string, customSalt?: Uint8Array): Promise<PinVerifierData> {
  const enc = new TextEncoder();
  const pinBuffer = enc.encode(pin);
  const salt = customSalt || getRandomBytes(16);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    pinBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return {
    saltHex: bytesToHex(salt),
    verifierHex: bytesToHex(new Uint8Array(derivedBits)),
  };
}

/**
 * Verifies if an entered PIN matches the stored salted verifier
 */
export async function verifyPin(pin: string, stored: PinVerifierData): Promise<boolean> {
  if (!stored || !stored.saltHex || !stored.verifierHex) return false;
  const saltBytes = hexToBuf(stored.saltHex);
  const testVerifier = await createPinVerifier(pin, saltBytes);
  return testVerifier.verifierHex === stored.verifierHex;
}

/**
 * Derives an active AES-GCM 256-bit CryptoKey in memory from the user's PIN and salt
 */
export async function deriveAesKey(pin: string, saltHex: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const pinBuffer = enc.encode(pin);
  const saltBytes = hexToBuf(saltHex);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    pinBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export interface PinAuthResult {
  match: 'real' | 'decoy' | 'none';
  key: CryptoKey | null;
}

/**
 * Authenticates an entered PIN against both real and decoy profiles with:
 * 1) Equal derivation cost (both slots are derived simultaneously via Promise.all)
 * 2) Fixed minimum wall-clock delay padding to eliminate timing side-channels
 */
export async function authenticatePinWithConstantCostAndDelay(
  pin: string,
  authConfig: { real?: PinVerifierData; decoy?: PinVerifierData },
  minDelayMs: number = 750
): Promise<PinAuthResult> {
  const startTime = performance.now();

  const [realResult, decoyResult] = await Promise.all([
    (async () => {
      if (!authConfig.real) return { matched: false, key: null };
      const saltBytes = hexToBuf(authConfig.real.saltHex);
      const test = await createPinVerifier(pin, saltBytes);
      if (test.verifierHex === authConfig.real.verifierHex) {
        const key = await deriveAesKey(pin, authConfig.real.saltHex);
        return { matched: true, key };
      }
      // Equal cost dummy derivation so failure path does same work
      await deriveAesKey(pin, authConfig.real.saltHex);
      return { matched: false, key: null };
    })(),
    (async () => {
      if (!authConfig.decoy) return { matched: false, key: null };
      const saltBytes = hexToBuf(authConfig.decoy.saltHex);
      const test = await createPinVerifier(pin, saltBytes);
      if (test.verifierHex === authConfig.decoy.verifierHex) {
        const key = await deriveAesKey(pin, authConfig.decoy.saltHex);
        return { matched: true, key };
      }
      // Equal cost dummy derivation so failure path does same work
      await deriveAesKey(pin, authConfig.decoy.saltHex);
      return { matched: false, key: null };
    })(),
  ]);

  // Enforce identical minimum wall-clock transition duration
  const elapsed = performance.now() - startTime;
  const paddingNeeded = Math.max(0, minDelayMs - elapsed);
  if (paddingNeeded > 0) {
    await new Promise((r) => setTimeout(r, paddingNeeded));
  }

  if (realResult.matched && realResult.key) {
    return { match: 'real', key: realResult.key };
  }
  if (decoyResult.matched && decoyResult.key) {
    return { match: 'decoy', key: decoyResult.key };
  }
  return { match: 'none', key: null };
}

export interface EncryptedPayload {
  ciphertext: string; // Base64
  iv: string; // Base64
}

/**
 * Encrypts an arbitrary object or string with AES-GCM using the active session key
 */
export async function encryptData(key: CryptoKey, data: any): Promise<EncryptedPayload> {
  const enc = new TextEncoder();
  const serialized = typeof data === 'string' ? data : JSON.stringify(data);
  const dataBuffer = enc.encode(serialized);
  const iv = getRandomBytes(12); // Standard 96-bit IV for AES-GCM

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    key,
    dataBuffer
  );

  // Convert to Base64 strings for compact storage
  const ciphertextBase64 = btoa(
    String.fromCharCode(...new Uint8Array(encryptedBuffer))
  );
  const ivBase64 = btoa(String.fromCharCode(...iv));

  return {
    ciphertext: ciphertextBase64,
    iv: ivBase64,
  };
}

/**
 * Decrypts an encrypted payload with the active session key
 */
export async function decryptData<T = any>(key: CryptoKey, payload: EncryptedPayload): Promise<T> {
  const ivBytes = Uint8Array.from(atob(payload.iv), (c) => c.charCodeAt(0));
  const cipherBytes = Uint8Array.from(atob(payload.ciphertext), (c) => c.charCodeAt(0));

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBytes as BufferSource,
    },
    key,
    cipherBytes
  );

  const dec = new TextDecoder();
  const decodedText = dec.decode(decryptedBuffer);

  try {
    return JSON.parse(decodedText) as T;
  } catch {
    return decodedText as unknown as T;
  }
}
