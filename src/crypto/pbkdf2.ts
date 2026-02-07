/**
 * Quack - PBKDF2 Password Derivation
 * 
 * ARCHITECTURE (v3 - Separated Storage):
 * 
 * vault_meta (rarely changes):
 *   - salt: For key derivation
 *   - passwordHash: Quick password verification
 * 
 * vault_data (changes every save):
 *   - iv: New each save (required for AES-GCM security)
 *   - data: Encrypted vault content
 * 
 * This separation means:
 * 1. Salt survives data corruption
 * 2. We can distinguish "wrong password" from "corrupted data"
 * 3. Recovery is more likely if only vault_data is damaged
 */

import { base64Encode, base64Decode, bufferToUint8Array } from '@/utils/helpers';

// Re-export for vault.ts
export { base64Encode };
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
 * Generate a password verification hash
 * Uses a different derivation path than encryption to avoid leaking key info
 * 
 * @param password - User's master password
 * @param salt - The vault's salt (base64)
 * @returns Base64-encoded hash for storage
 */
export async function generatePasswordHash(
  password: string,
  salt: string
): Promise<string> {
  // Use "verify:" prefix to create different derivation path
  const verifySalt = new TextEncoder().encode('verify:' + salt);
  
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  // Derive 256 bits for verification
  const hashBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: verifySalt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    256
  );
  
  return base64Encode(new Uint8Array(hashBits));
}

/**
 * Verify password against stored hash
 * 
 * @param password - Password to verify
 * @param salt - The vault's salt (base64)
 * @param storedHash - The stored password hash (base64)
 * @returns true if password is correct
 */
export async function verifyPassword(
  password: string,
  salt: string,
  storedHash: string
): Promise<boolean> {
  const computedHash = await generatePasswordHash(password, salt);
  // Constant-time comparison would be ideal, but for client-side this is fine
  return computedHash === storedHash;
}

/**
 * Encrypt data with an existing derived key (no new salt)
 * Used for saving vault data without regenerating salt
 * 
 * @param data - Plaintext JSON string
 * @param key - Already-derived CryptoKey
 * @returns IV and encrypted data (both base64)
 */
export async function encryptWithKey(
  data: string,
  key: CryptoKey
): Promise<{ iv: string; encrypted: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  
  return {
    iv: base64Encode(iv),
    encrypted: base64Encode(bufferToUint8Array(encrypted)),
  };
}

/**
 * Decrypt data with an existing derived key
 * 
 * @param encrypted - Encrypted data (base64)
 * @param iv - Initialization vector (base64)
 * @param key - Already-derived CryptoKey
 * @returns Decrypted string or null if decryption fails
 */
export async function decryptWithKey(
  encrypted: string,
  iv: string,
  key: CryptoKey
): Promise<string | null> {
  try {
    const ivBytes = base64Decode(iv);
    const encryptedBytes = base64Decode(encrypted);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
      key,
      encryptedBytes.buffer as ArrayBuffer
    );
    
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

// ============================================================================
// Legacy functions (for v2 migration and backward compatibility)
// ============================================================================

/**
 * Encrypt vault data with password-derived key (LEGACY - generates new salt)
 * @deprecated Use encryptWithKey() with separated storage instead
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
 * Decrypt vault data with password-derived key (LEGACY)
 * @deprecated Use decryptWithKey() with separated storage instead
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
  } catch {
    // Wrong password or corrupted data
    return null;
  }
}

