/**
 * Quack - Post-Quantum Cryptography (ML-KEM / Kyber)
 * 
 * Real implementation using mlkem library (NIST FIPS 203 compliant).
 * Using ML-KEM-768 (recommended security level).
 */

import { MlKem768 } from 'mlkem';
import { base64Encode, base64Decode } from '@/utils/helpers';

// ML-KEM-768 key sizes
export const KYBER_PUBLIC_KEY_BYTES = 1184;
export const KYBER_SECRET_KEY_BYTES = 2400;
export const KYBER_CIPHERTEXT_BYTES = 1088;
export const KYBER_SHARED_SECRET_BYTES = 32;

/**
 * Generate ML-KEM-768 key pair
 * @returns Base64 encoded public and secret keys
 */
export async function generateKyberKeyPair(): Promise<{
  publicKey: string;
  secretKey: string;
}> {
  const kem = new MlKem768();
  const [publicKey, secretKey] = await kem.generateKeyPair();
  
  return {
    publicKey: base64Encode(publicKey),
    secretKey: base64Encode(secretKey),
  };
}

/**
 * Encapsulate - Generate shared secret using recipient's public key
 * @param publicKeyBase64 Recipient's public key (base64)
 * @returns Ciphertext (to send to recipient) and shared secret (32 bytes, base64)
 */
export async function encapsulate(publicKeyBase64: string): Promise<{
  ciphertext: string;
  sharedSecret: string;
}> {
  const publicKey = base64Decode(publicKeyBase64);
  
  if (publicKey.length !== KYBER_PUBLIC_KEY_BYTES) {
    throw new Error(`Invalid public key size: expected ${KYBER_PUBLIC_KEY_BYTES}, got ${publicKey.length}`);
  }
  
  const kem = new MlKem768();
  const [ciphertext, sharedSecret] = await kem.encap(publicKey);
  
  return {
    ciphertext: base64Encode(ciphertext),
    sharedSecret: base64Encode(sharedSecret),
  };
}

/**
 * Decapsulate - Recover shared secret using your secret key
 * @param secretKeyBase64 Your secret key (base64)
 * @param ciphertextBase64 Ciphertext from sender (base64)
 * @returns Shared secret (32 bytes, base64)
 */
export async function decapsulate(
  secretKeyBase64: string,
  ciphertextBase64: string
): Promise<string> {
  const secretKey = base64Decode(secretKeyBase64);
  const ciphertext = base64Decode(ciphertextBase64);
  
  if (secretKey.length !== KYBER_SECRET_KEY_BYTES) {
    throw new Error(`Invalid secret key size: expected ${KYBER_SECRET_KEY_BYTES}, got ${secretKey.length}`);
  }
  
  if (ciphertext.length !== KYBER_CIPHERTEXT_BYTES) {
    throw new Error(`Invalid ciphertext size: expected ${KYBER_CIPHERTEXT_BYTES}, got ${ciphertext.length}`);
  }
  
  const kem = new MlKem768();
  const sharedSecret = await kem.decap(ciphertext, secretKey);
  
  return base64Encode(sharedSecret);
}

/**
 * Generate fingerprint from public key
 * Uses SHA-256 hash, returns first 16 bytes as hex with colons
 * Format: "4F:A2:B9:C1:8E:3D:7A:2F:B5:C8:D1:E4:F7:09:1B:2E"
 * @param publicKeyBase64 Public key (base64)
 * @returns Fingerprint string (32 chars + 15 colons = 47 chars total)
 */
export async function generateFingerprint(publicKeyBase64: string): Promise<string> {
  const publicKey = base64Decode(publicKeyBase64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', publicKey.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer).slice(0, 16);
  
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

/**
 * Generate short fingerprint (for display)
 * First 4 bytes only: "4F:A2:B9:C1"
 * @param publicKeyBase64 Public key (base64)
 * @returns Short fingerprint string (8 chars + 3 colons = 11 chars)
 */
export async function generateShortFingerprint(publicKeyBase64: string): Promise<string> {
  const publicKey = base64Decode(publicKeyBase64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', publicKey.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer).slice(0, 4);
  
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

/**
 * Verify that a public/secret key pair is valid
 * Tests by doing a round-trip encapsulation/decapsulation
 * @param publicKeyBase64 Public key (base64)
 * @param secretKeyBase64 Secret key (base64)
 * @returns true if keys are a valid pair
 */
export async function verifyKyberKeyPair(
  publicKeyBase64: string,
  secretKeyBase64: string
): Promise<boolean> {
  try {
    // Test round-trip
    const { ciphertext, sharedSecret: ssEnc } = await encapsulate(publicKeyBase64);
    const ssDec = await decapsulate(secretKeyBase64, ciphertext);
    
    return ssEnc === ssDec;
  } catch {
    return false;
  }
}

/**
 * Validate public key format
 * @param publicKeyBase64 Public key (base64)
 * @returns true if valid format
 */
export function isValidPublicKey(publicKeyBase64: string): boolean {
  try {
    const decoded = base64Decode(publicKeyBase64);
    return decoded.length === KYBER_PUBLIC_KEY_BYTES;
  } catch {
    return false;
  }
}

/**
 * Validate secret key format
 * @param secretKeyBase64 Secret key (base64)
 * @returns true if valid format
 */
export function isValidSecretKey(secretKeyBase64: string): boolean {
  try {
    const decoded = base64Decode(secretKeyBase64);
    return decoded.length === KYBER_SECRET_KEY_BYTES;
  } catch {
    return false;
  }
}
