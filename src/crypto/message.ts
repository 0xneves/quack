/**
 * Quack - Message Encryption/Decryption
 * 
 * Combines ML-KEM (Kyber) for key encapsulation with AES-256-GCM for message encryption.
 * 
 * Message Format:
 * Quack://MSG:[recipient_short_fingerprint]:[kyber_ciphertext_b64]:[aes_encrypted_b64]:[aes_iv_b64]
 * 
 * Key Export Format:
 * Quack://KEY:[public_key_b64]
 */

import { encapsulate, decapsulate } from './kyber';
import { base64Encode, base64Decode } from '@/utils/helpers';
import type { PersonalKey, ContactKey, EncryptedMessage } from '@/types';

const AES_IV_BYTES = 12;
const MESSAGE_PREFIX = 'Quack://MSG:';
const KEY_PREFIX = 'Quack://KEY:';

/**
 * Encrypt a message to a contact
 * Uses their public key to encapsulate a shared secret, then AES-GCM to encrypt
 */
export async function encryptToContact(
  plaintext: string,
  contactKey: ContactKey
): Promise<string> {
  // 1. Encapsulate - generate shared secret using contact's public key
  const { ciphertext: kyberCiphertext, sharedSecret } = await encapsulate(contactKey.publicKey);
  
  // 2. Import shared secret as AES key
  const sharedSecretBytes = base64Decode(sharedSecret);
  const aesKey = await crypto.subtle.importKey(
    'raw',
    sharedSecretBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // 3. Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  
  // 4. Encrypt message with AES-GCM
  const encoded = new TextEncoder().encode(plaintext);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );
  const encryptedData = new Uint8Array(encryptedBuffer);
  
  // 5. Format message
  // Quack://MSG:[recipient_fingerprint]:[kyber_ct]:[aes_data]:[aes_iv]
  return [
    MESSAGE_PREFIX.slice(0, -1), // Remove trailing :
    contactKey.shortFingerprint.replace(/:/g, ''), // Compact fingerprint (no colons)
    kyberCiphertext,
    base64Encode(encryptedData),
    base64Encode(iv)
  ].join(':');
}

/**
 * Parse an encrypted message string
 */
export function parseEncryptedMessage(messageString: string): EncryptedMessage | null {
  // Quack://MSG:FINGERPRINT:KYBER_CT:AES_DATA:AES_IV
  const match = messageString.match(
    /^Quack:\/\/MSG:([A-Fa-f0-9]{8}):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/
  );
  
  if (!match) return null;
  
  // Restore fingerprint format with colons
  const fp = match[1];
  const shortFingerprint = `${fp.slice(0,2)}:${fp.slice(2,4)}:${fp.slice(4,6)}:${fp.slice(6,8)}`.toUpperCase();
  
  return {
    recipientFingerprint: shortFingerprint,
    kyberCiphertext: match[2],
    encryptedData: match[3],
    iv: match[4]
  };
}

/**
 * Decrypt a message using your personal key
 * Checks if the message is addressed to you (fingerprint match)
 */
export async function decryptWithPersonalKey(
  encryptedMessage: EncryptedMessage,
  personalKey: PersonalKey
): Promise<string | null> {
  // Check if message is for us
  if (encryptedMessage.recipientFingerprint !== personalKey.shortFingerprint) {
    return null; // Not for us
  }
  
  try {
    // 1. Decapsulate - recover shared secret using our secret key
    const sharedSecret = await decapsulate(
      personalKey.secretKey,
      encryptedMessage.kyberCiphertext
    );
    
    // 2. Import shared secret as AES key
    const sharedSecretBytes = base64Decode(sharedSecret);
    const aesKey = await crypto.subtle.importKey(
      'raw',
      sharedSecretBytes.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    // 3. Decrypt with AES-GCM
    const encryptedData = base64Decode(encryptedMessage.encryptedData);
    const iv = base64Decode(encryptedMessage.iv);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      aesKey,
      encryptedData.buffer as ArrayBuffer
    );
    
    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    // Decryption failed
    console.error('Decryption failed:', error);
    return null;
  }
}

/**
 * Try to decrypt a message with multiple personal keys
 */
export async function decryptMessage(
  messageString: string,
  personalKeys: PersonalKey[]
): Promise<{ plaintext: string; keyId: string } | null> {
  const parsed = parseEncryptedMessage(messageString);
  if (!parsed) return null;
  
  // Find the key that matches the fingerprint
  for (const key of personalKeys) {
    const plaintext = await decryptWithPersonalKey(parsed, key);
    if (plaintext !== null) {
      return { plaintext, keyId: key.id };
    }
  }
  
  return null;
}

/**
 * Check if a string looks like a Quack encrypted message
 */
export function isQuackMessage(text: string): boolean {
  return text.startsWith(MESSAGE_PREFIX);
}

/**
 * Check if a string looks like a Quack key share
 */
export function isQuackKey(text: string): boolean {
  return text.startsWith(KEY_PREFIX);
}

/**
 * Extract all Quack:// strings from text
 */
export function extractQuackStrings(text: string): string[] {
  const regex = /Quack:\/\/(?:MSG|KEY):[A-Za-z0-9+/=:]+/g;
  return text.match(regex) || [];
}

/**
 * Find Quack messages in text that we can decrypt
 */
export async function findDecryptableMessages(
  text: string,
  personalKeys: PersonalKey[]
): Promise<Array<{ original: string; plaintext: string; keyId: string }>> {
  const quackStrings = extractQuackStrings(text);
  const results: Array<{ original: string; plaintext: string; keyId: string }> = [];
  
  for (const qs of quackStrings) {
    if (isQuackMessage(qs)) {
      const decrypted = await decryptMessage(qs, personalKeys);
      if (decrypted) {
        results.push({
          original: qs,
          plaintext: decrypted.plaintext,
          keyId: decrypted.keyId
        });
      }
    }
  }
  
  return results;
}
