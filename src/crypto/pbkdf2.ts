/**
 * Quack - PBKDF2 Password Derivation
 */

import { base64Encode, base64Decode, bufferToUint8Array } from '@/utils/helpers';
import { PBKDF2_ITERATIONS } from '@/utils/constants';

/**
 * Derive encryption key from password using PBKDF2
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // Import password as key material
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  // Derive AES-256 key
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate random salt for PBKDF2
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Encrypt vault data with password-derived key
 */
export async function encryptVault(
  data: string,
  password: string
): Promise<{ salt: string; iv: string; encrypted: string }> {
  const salt = generateSalt();
  const key = await deriveKeyFromPassword(password, salt);
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  
  return {
    salt: base64Encode(salt),
    iv: base64Encode(iv),
    encrypted: base64Encode(bufferToUint8Array(encrypted)),
  };
}

/**
 * Decrypt vault data with password-derived key
 */
export async function decryptVault(
  encrypted: string,
  iv: string,
  salt: string,
  password: string
): Promise<string | null> {
  try {
    const saltBytes = base64Decode(salt);
    const ivBytes = base64Decode(iv);
    const encryptedBytes = base64Decode(encrypted);
    
    const key = await deriveKeyFromPassword(password, saltBytes);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
      key,
      encryptedBytes.buffer as ArrayBuffer
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    // Wrong password or corrupted data
    return null;
  }
}

