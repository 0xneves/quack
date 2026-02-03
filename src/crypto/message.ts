/**
 * Quack - Message Encryption/Decryption
 * 
 * Primary: Group-based encryption (shared AES keys)
 * Legacy: 1-to-1 Kyber-based encryption (backwards compatibility)
 * 
 * Message Formats:
 * - Group:  Quack://[group_fp]:[iv]:[ciphertext]
 * - Legacy: Quack://MSG:[recipient_fp]:[kyber_ct]:[aes_data]:[iv]
 * - Key:    Quack://KEY:[public_key_b64]
 * - Invite: Quack://INV:[recipient_fp]:[kyber_ct]:[encrypted_group_data]
 */

import { encapsulate, decapsulate } from './kyber';
import { 
  encryptGroupMessage, 
  decryptWithGroups, 
  isGroupMessage,
  isInvitation,
  extractQuackStrings as extractQuackStringsFromGroup
} from './group';
import { base64Encode, base64Decode } from '@/utils/helpers';
import type { 
  PersonalKey, 
  ContactKey, 
  QuackGroup,
  EncryptedMessage
} from '@/types';

const AES_IV_BYTES = 12;
const LEGACY_MESSAGE_PREFIX = 'Quack://MSG:';
const KEY_PREFIX = 'Quack://KEY:';

// Re-export group functions for external use
export { 
  encryptGroupMessage, 
  decryptWithGroups,
  parseGroupMessage,
  isGroupMessage,
  createGroupInvitation,
  parseInvitation,
  acceptInvitation,
  isInvitation,
  tryAcceptInvitation,
  extractQuackStrings
} from './group';

// ============================================================================
// Main Encryption Interface
// ============================================================================

/**
 * Encrypt a message to a group
 * This is the primary encryption method in Quack v2
 */
export async function encryptMessage(
  plaintext: string,
  group: QuackGroup
): Promise<string> {
  return encryptGroupMessage(plaintext, group);
}

/**
 * Decrypt a message using available groups
 * Tries each group until one works
 */
export async function decryptMessage(
  messageString: string,
  groups: QuackGroup[],
  personalKeys?: PersonalKey[]
): Promise<{ plaintext: string; groupId?: string; keyId?: string } | null> {
  // Try group message first (new format)
  if (isGroupMessage(messageString)) {
    const result = await decryptWithGroups(messageString, groups);
    if (result) {
      return { plaintext: result.plaintext, groupId: result.group.id };
    }
  }
  
  // Try legacy 1-to-1 format (backwards compatibility)
  if (messageString.startsWith(LEGACY_MESSAGE_PREFIX) && personalKeys) {
    const result = await decryptLegacyMessage(messageString, personalKeys);
    if (result) {
      return { plaintext: result.plaintext, keyId: result.keyId };
    }
  }
  
  return null;
}

// ============================================================================
// Legacy 1-to-1 Encryption (Backwards Compatibility)
// ============================================================================

/**
 * Encrypt a message to a contact (legacy 1-to-1 format)
 * @deprecated Use encryptGroupMessage instead
 */
export async function encryptToContact(
  plaintext: string,
  contactKey: ContactKey
): Promise<string> {
  const { ciphertext: kyberCiphertext, sharedSecret } = await encapsulate(contactKey.publicKey);
  
  const sharedSecretBytes = base64Decode(sharedSecret);
  const aesKey = await crypto.subtle.importKey(
    'raw',
    sharedSecretBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );
  const encryptedData = new Uint8Array(encryptedBuffer);
  
  return [
    LEGACY_MESSAGE_PREFIX.slice(0, -1),
    contactKey.shortFingerprint.replace(/:/g, ''),
    kyberCiphertext,
    base64Encode(encryptedData),
    base64Encode(iv)
  ].join(':');
}

/**
 * Parse a legacy encrypted message string
 */
export function parseLegacyMessage(messageString: string): EncryptedMessage | null {
  const match = messageString.match(
    /^Quack:\/\/MSG:([A-Fa-f0-9]{8}):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/
  );
  
  if (!match) return null;
  
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
 * Decrypt a legacy message using personal key
 */
export async function decryptWithPersonalKey(
  encryptedMessage: EncryptedMessage,
  personalKey: PersonalKey
): Promise<string | null> {
  if (encryptedMessage.recipientFingerprint !== personalKey.shortFingerprint) {
    return null;
  }
  
  try {
    const sharedSecret = await decapsulate(
      personalKey.secretKey,
      encryptedMessage.kyberCiphertext
    );
    
    const sharedSecretBytes = base64Decode(sharedSecret);
    const aesKey = await crypto.subtle.importKey(
      'raw',
      sharedSecretBytes.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const encryptedData = base64Decode(encryptedMessage.encryptedData);
    const iv = base64Decode(encryptedMessage.iv);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      aesKey,
      encryptedData.buffer as ArrayBuffer
    );
    
    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error('Legacy decryption failed:', error);
    return null;
  }
}

/**
 * Decrypt a legacy message with multiple personal keys
 */
export async function decryptLegacyMessage(
  messageString: string,
  personalKeys: PersonalKey[]
): Promise<{ plaintext: string; keyId: string } | null> {
  const parsed = parseLegacyMessage(messageString);
  if (!parsed) return null;
  
  for (const key of personalKeys) {
    const plaintext = await decryptWithPersonalKey(parsed, key);
    if (plaintext !== null) {
      return { plaintext, keyId: key.id };
    }
  }
  
  return null;
}

// ============================================================================
// Detection & Extraction
// ============================================================================

/**
 * Check if a string looks like a Quack encrypted message (any format)
 */
export function isQuackMessage(text: string): boolean {
  return isGroupMessage(text) || text.startsWith(LEGACY_MESSAGE_PREFIX);
}

/**
 * Check if a string looks like a Quack key share
 */
export function isQuackKey(text: string): boolean {
  return text.startsWith(KEY_PREFIX);
}

/**
 * Detect what type of Quack string this is
 */
export function detectQuackType(text: string): 'group' | 'legacy' | 'key' | 'invitation' | null {
  if (isGroupMessage(text)) return 'group';
  if (text.startsWith(LEGACY_MESSAGE_PREFIX)) return 'legacy';
  if (text.startsWith(KEY_PREFIX)) return 'key';
  if (isInvitation(text)) return 'invitation';
  return null;
}

/**
 * Find all decryptable messages in text
 * Works with both group and legacy formats
 */
export async function findDecryptableMessages(
  text: string,
  groups: QuackGroup[],
  personalKeys?: PersonalKey[]
): Promise<Array<{ 
  original: string; 
  plaintext: string; 
  type: 'group' | 'legacy';
  groupId?: string;
  keyId?: string 
}>> {
  const quackStrings = extractQuackStringsFromGroup(text);
  const results: Array<{ 
    original: string; 
    plaintext: string; 
    type: 'group' | 'legacy';
    groupId?: string;
    keyId?: string 
  }> = [];
  
  for (const qs of quackStrings) {
    const decrypted = await decryptMessage(qs, groups, personalKeys);
    if (decrypted) {
      results.push({
        original: qs,
        plaintext: decrypted.plaintext,
        type: decrypted.groupId ? 'group' : 'legacy',
        groupId: decrypted.groupId,
        keyId: decrypted.keyId
      });
    }
  }
  
  return results;
}
