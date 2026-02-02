/**
 * Quack - AES-256-GCM Encryption/Decryption
 */

import { base64Encode, base64Decode, bufferToUint8Array } from '@/utils/helpers';
import { AES_IV_SIZE, QUACK_PREFIX } from '@/utils/constants';

/**
 * Encrypt plaintext using AES-256-GCM
 * Format: Quack://[base64([IV (12 bytes)] + [ciphertext + auth_tag])]
 */
export async function encryptMessage(
  plaintext: string,
  aesKey: CryptoKey
): Promise<string> {
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_SIZE));
  
  // Encode plaintext
  const encoded = new TextEncoder().encode(plaintext);
  
  // Encrypt with AES-GCM (produces ciphertext + auth tag)
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );
  
  // Concatenate: [IV (12 bytes)] + [encrypted_data + auth_tag]
  const blob = new Uint8Array(AES_IV_SIZE + encryptedData.byteLength);
  blob.set(iv, 0);
  blob.set(bufferToUint8Array(encryptedData), AES_IV_SIZE);
  
  // Base64 encode the entire blob
  const ciphertext = base64Encode(blob);
  
  return `${QUACK_PREFIX}${ciphertext}`;
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * Tries a single key
 */
export async function decryptMessage(
  encrypted: string,
  aesKey: CryptoKey
): Promise<string | null> {
  try {
    // Remove Quack:// prefix
    const match = encrypted.match(/^Quack:\/\/(.+)$/);
    if (!match) return null;
    
    const ciphertext = match[1];
    const blob = base64Decode(ciphertext);
    
    // Extract IV from first 12 bytes
    const iv = blob.slice(0, AES_IV_SIZE);
    const encryptedData = blob.slice(AES_IV_SIZE);
    
    // Decrypt with AES-GCM
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      encryptedData
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    // Decryption failed (wrong key or corrupted data)
    return null;
  }
}

/**
 * Try to decrypt with multiple keys
 * Returns plaintext and the key ID that worked
 */
export async function decryptWithKeys(
  encrypted: string,
  keys: Array<{ id: string; aesKey: CryptoKey }>
): Promise<{ plaintext: string; keyId: string } | null> {
  for (const { id, aesKey } of keys) {
    const plaintext = await decryptMessage(encrypted, aesKey);
    if (plaintext !== null) {
      return { plaintext, keyId: id };
    }
  }
  return null;
}

/**
 * Generate AES-256 key
 */
export async function generateAESKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Export AES key to base64
 */
export async function exportAESKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return base64Encode(bufferToUint8Array(exported));
}

/**
 * Import AES key from base64
 */
export async function importAESKey(base64Key: string): Promise<CryptoKey> {
  const keyData = base64Decode(base64Key);
  return await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

