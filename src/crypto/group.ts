/**
 * Quack - Group Encryption
 * 
 * Handles group key generation, message encryption/decryption,
 * and secure group key distribution via Kyber encapsulation.
 */

import { encapsulate, decapsulate } from './kyber';
import { base64Encode, base64Decode, bufferToUint8Array } from '@/utils/helpers';
import type { 
  QuackGroup, 
  ContactKey, 
  PersonalKey,
  GroupMessage,
  StealthMessage,
  GroupInvitation,
  InvitationPayload 
} from '@/types';

const AES_KEY_BYTES = 32;        // AES-256
const AES_IV_BYTES = 12;         // GCM standard
const GROUP_MESSAGE_PREFIX = 'Quack://';
const STEALTH_MESSAGE_PREFIX = 'Quack://_:';  // Stealth mode - no fingerprint
const INVITATION_PREFIX = 'Quack://INV:';
const PERSONAL_AES_CONTEXT = 'quack-personal-aes-v1'; // Domain separation for key derivation

// ============================================================================
// Group Key Generation
// ============================================================================

/**
 * Generate a new AES-256 key for a group
 * @returns Base64 encoded AES key
 */
export async function generateGroupKey(): Promise<string> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(AES_KEY_BYTES));
  return base64Encode(keyBytes);
}

/**
 * Derive a personal AES-256 key from a Kyber secret key
 * Uses SHA-256 with domain separation for deterministic key derivation
 * @param secretKeyBase64 Kyber secret key (base64)
 * @returns Base64 encoded AES-256 key
 */
export async function derivePersonalAesKey(secretKeyBase64: string): Promise<string> {
  const secretKeyBytes = base64Decode(secretKeyBase64);
  const contextBytes = new TextEncoder().encode(PERSONAL_AES_CONTEXT);
  
  // Concatenate secret key + context for domain separation
  const combined = new Uint8Array(secretKeyBytes.length + contextBytes.length);
  combined.set(secretKeyBytes, 0);
  combined.set(contextBytes, secretKeyBytes.length);
  
  // SHA-256 hash → first 32 bytes = AES-256 key
  const hashBuffer = await crypto.subtle.digest('SHA-256', combined.buffer as ArrayBuffer);
  const aesKeyBytes = new Uint8Array(hashBuffer).slice(0, AES_KEY_BYTES);
  
  return base64Encode(aesKeyBytes);
}

/**
 * Generate fingerprint from AES key
 * Uses SHA-256 hash, returns first 16 bytes as hex with colons
 * @param aesKeyBase64 AES key (base64)
 * @returns Fingerprint string (47 chars: "4F:A2:B9:C1:8E:3D:7A:2F:B5:C8:D1:E4:F7:09:1B:2E")
 */
export async function generateGroupFingerprint(aesKeyBase64: string): Promise<string> {
  const keyBytes = base64Decode(aesKeyBase64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer).slice(0, 16);
  
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}

/**
 * Generate short fingerprint (for message format)
 * First 4 bytes: "4FA2B9C1" (no colons, used in Quack:// prefix)
 */
export async function generateGroupShortFingerprint(aesKeyBase64: string): Promise<string> {
  const keyBytes = base64Decode(aesKeyBase64);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyBytes.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer).slice(0, 4);
  
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
}

/**
 * Import AES key from base64 for encryption
 */
async function importAESKeyForEncrypt(aesKeyBase64: string): Promise<CryptoKey> {
  const keyBytes = base64Decode(aesKeyBase64);
  return await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
}

/**
 * Import AES key from base64 for decryption
 */
async function importAESKeyForDecrypt(aesKeyBase64: string): Promise<CryptoKey> {
  const keyBytes = base64Decode(aesKeyBase64);
  return await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

// ============================================================================
// Group Message Encryption/Decryption
// ============================================================================

/**
 * Encrypt a message to a group
 * Normal format: Quack://[group_short_fingerprint]:[iv_b64]:[ciphertext_b64]
 * Stealth format: Quack://_:[iv_b64]:[ciphertext_b64] (no fingerprint)
 * 
 * @param plaintext Message to encrypt
 * @param group The group to encrypt to
 * @param stealth If true, omit fingerprint (requires brute-force decryption)
 * @returns Encrypted message string
 */
export async function encryptGroupMessage(
  plaintext: string,
  group: QuackGroup,
  stealth: boolean = false
): Promise<string> {
  // Import AES key
  const aesKey = await importAESKeyForEncrypt(group.aesKey);
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  
  // Encrypt with AES-GCM
  const encoded = new TextEncoder().encode(plaintext);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );
  const ciphertext = new Uint8Array(encryptedBuffer);
  
  // Format depends on stealth mode
  if (stealth) {
    // Stealth: Quack://_:[iv]:[ciphertext] (no fingerprint)
    return `${STEALTH_MESSAGE_PREFIX}${base64Encode(iv)}:${base64Encode(ciphertext)}`;
  }
  // Normal: Quack://[fingerprint]:[iv]:[ciphertext]
  return `${GROUP_MESSAGE_PREFIX}${group.shortFingerprint}:${base64Encode(iv)}:${base64Encode(ciphertext)}`;
}

/**
 * Parse a group encrypted message string
 * Expected format: Quack://[8-char-hex]:[base64]:[base64]
 */
export function parseGroupMessage(messageString: string): GroupMessage | null {
  // Match: Quack://XXXXXXXX:base64:base64
  const match = messageString.match(
    /^Quack:\/\/([A-Fa-f0-9]{8}):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/
  );
  
  if (!match) return null;
  
  return {
    groupFingerprint: match[1].toUpperCase(),
    iv: match[2],
    ciphertext: match[3]
  };
}

/**
 * Decrypt a group message
 * @param message Parsed group message
 * @param group The group (must match fingerprint)
 * @returns Decrypted plaintext or null if failed
 */
export async function decryptGroupMessage(
  message: GroupMessage,
  group: QuackGroup
): Promise<string | null> {
  // Verify fingerprint match
  if (message.groupFingerprint !== group.shortFingerprint) {
    return null;
  }
  
  try {
    const aesKey = await importAESKeyForDecrypt(group.aesKey);
    const iv = base64Decode(message.iv);
    const ciphertext = base64Decode(message.ciphertext);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      aesKey,
      ciphertext.buffer as ArrayBuffer
    );
    
    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error('Group decryption failed:', error);
    return null;
  }
}

/**
 * Try to decrypt a message string with multiple groups
 * @param messageString The Quack:// message string
 * @param groups All groups to try
 * @returns Decrypted result with group info, or null
 */
export async function decryptWithGroups(
  messageString: string,
  groups: QuackGroup[]
): Promise<{ plaintext: string; group: QuackGroup } | null> {
  const parsed = parseGroupMessage(messageString);
  if (!parsed) return null;
  
  // Find matching group by fingerprint
  for (const group of groups) {
    if (group.shortFingerprint === parsed.groupFingerprint) {
      const plaintext = await decryptGroupMessage(parsed, group);
      if (plaintext !== null) {
        return { plaintext, group };
      }
    }
  }
  
  return null;
}

// ============================================================================
// Stealth Message Parsing & Decryption
// ============================================================================

/**
 * Check if a message string is in stealth format
 * Stealth format: Quack://_:[iv_b64]:[ciphertext_b64]
 */
export function isStealthMessage(messageString: string): boolean {
  return messageString.startsWith(STEALTH_MESSAGE_PREFIX);
}

/**
 * Parse a stealth encrypted message string
 * Expected format: Quack://_:[base64]:[base64]
 */
export function parseStealthMessage(messageString: string): StealthMessage | null {
  // Match: Quack://_:base64:base64
  const match = messageString.match(
    /^Quack:\/\/_:([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/
  );
  
  if (!match) return null;
  
  return {
    iv: match[1],
    ciphertext: match[2]
  };
}

/**
 * Try to decrypt a stealth message with a single AES key
 * @param message Parsed stealth message
 * @param aesKey Base64-encoded AES key to try
 * @returns Decrypted plaintext or null if failed
 */
async function tryDecryptStealth(
  message: StealthMessage,
  aesKey: string
): Promise<string | null> {
  try {
    const key = await importAESKeyForDecrypt(aesKey);
    const iv = base64Decode(message.iv);
    const ciphertext = base64Decode(message.ciphertext);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );
    
    return new TextDecoder().decode(decryptedBuffer);
  } catch {
    // AES-GCM decryption will fail with wrong key (auth tag mismatch)
    return null;
  }
}

/**
 * Brute-force decrypt a stealth message by trying all groups and personal keys
 * @param messageString The Quack://_: message string
 * @param groups All groups to try
 * @param personalKeys All personal keys to try
 * @returns Decrypted result with source info, or null
 */
export async function decryptStealthMessage(
  messageString: string,
  groups: QuackGroup[],
  personalKeys: PersonalKey[]
): Promise<{ plaintext: string; groupId?: string; keyId?: string } | null> {
  const parsed = parseStealthMessage(messageString);
  if (!parsed) return null;
  
  // Try all groups
  for (const group of groups) {
    const plaintext = await tryDecryptStealth(parsed, group.aesKey);
    if (plaintext !== null) {
      return { plaintext, groupId: group.id };
    }
  }
  
  // Try all personal keys (using derived AES keys)
  for (const key of personalKeys) {
    const derivedAesKey = await derivePersonalAesKey(key.secretKey);
    const plaintext = await tryDecryptStealth(parsed, derivedAesKey);
    if (plaintext !== null) {
      return { plaintext, keyId: key.id };
    }
  }
  
  return null;
}

// ============================================================================
// Personal Key Encryption (Self-Encryption using derived AES)
// ============================================================================

/**
 * Encrypt a message to a personal key (self-encryption)
 * Uses AES-256-GCM with a key derived from the Kyber secret key
 * Normal format: Quack://[personal_short_fingerprint]:[iv_b64]:[ciphertext_b64]
 * Stealth format: Quack://_:[iv_b64]:[ciphertext_b64] (no fingerprint)
 * 
 * @param plaintext Message to encrypt
 * @param personalKey The personal key to encrypt to
 * @param stealth If true, omit fingerprint (requires brute-force decryption)
 * @returns Encrypted message string
 */
export async function encryptPersonalMessage(
  plaintext: string,
  personalKey: PersonalKey,
  stealth: boolean = false
): Promise<string> {
  // Derive AES key from secret key
  const derivedAesKey = await derivePersonalAesKey(personalKey.secretKey);
  const aesKey = await importAESKeyForEncrypt(derivedAesKey);
  
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  
  // Encrypt with AES-GCM
  const encoded = new TextEncoder().encode(plaintext);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );
  const ciphertext = new Uint8Array(encryptedBuffer);
  
  // Format depends on stealth mode
  if (stealth) {
    // Stealth: Quack://_:[iv]:[ciphertext] (no fingerprint)
    return `${STEALTH_MESSAGE_PREFIX}${base64Encode(iv)}:${base64Encode(ciphertext)}`;
  }
  // Normal: Quack://[fingerprint]:[iv]:[ciphertext]
  // Personal key shortFingerprint has colons (4C:F2:2C:10), must strip them for message format
  const compactFingerprint = personalKey.shortFingerprint.replace(/:/g, '');
  return `${GROUP_MESSAGE_PREFIX}${compactFingerprint}:${base64Encode(iv)}:${base64Encode(ciphertext)}`;
}

/**
 * Decrypt a message using a personal key's derived AES key
 * @param message Parsed message (same format as group message)
 * @param personalKey The personal key (must match fingerprint)
 * @returns Decrypted plaintext or null if failed
 */
export async function decryptPersonalMessage(
  message: GroupMessage,
  personalKey: PersonalKey
): Promise<string | null> {
  // Verify fingerprint match
  // Personal key shortFingerprint has colons (4C:F2:2C:10), message has none (4CF22C10)
  const compactFingerprint = personalKey.shortFingerprint.replace(/:/g, '');
  if (message.groupFingerprint !== compactFingerprint) {
    return null;
  }
  
  try {
    // Derive AES key from secret key
    const derivedAesKey = await derivePersonalAesKey(personalKey.secretKey);
    const aesKey = await importAESKeyForDecrypt(derivedAesKey);
    const iv = base64Decode(message.iv);
    const ciphertext = base64Decode(message.ciphertext);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      aesKey,
      ciphertext.buffer as ArrayBuffer
    );
    
    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error('Personal key decryption failed:', error);
    return null;
  }
}

/**
 * Try to decrypt a message string with multiple personal keys
 * @param messageString The Quack:// message string
 * @param personalKeys All personal keys to try
 * @returns Decrypted result with key info, or null
 */
export async function decryptWithPersonalKeys(
  messageString: string,
  personalKeys: PersonalKey[]
): Promise<{ plaintext: string; personalKey: PersonalKey } | null> {
  const parsed = parseGroupMessage(messageString);
  if (!parsed) return null;
  
  // Find matching personal key by fingerprint
  // Personal key shortFingerprint has colons (4C:F2:2C:10), message has none (4CF22C10)
  for (const key of personalKeys) {
    const compactFingerprint = key.shortFingerprint.replace(/:/g, '');
    if (compactFingerprint === parsed.groupFingerprint) {
      const plaintext = await decryptPersonalMessage(parsed, key);
      if (plaintext !== null) {
        return { plaintext, personalKey: key };
      }
    }
  }
  
  return null;
}

// ============================================================================
// Group Invitation (Secure Key Sharing via Kyber)
// ============================================================================

/**
 * Create a group invitation for a contact
 * Uses Kyber encapsulation to securely transmit the group AES key
 * 
 * Format: Quack://INV:[recipient_fingerprint]:[kyber_ciphertext]:[encrypted_payload]
 * 
 * @param group The group to invite to
 * @param contact The contact to invite (needs their Kyber public key)
 * @param inviterFingerprint Your fingerprint (optional, for attribution)
 * @param message Optional message to include
 * @returns Invitation string
 */
export async function createGroupInvitation(
  group: QuackGroup,
  contact: ContactKey,
  inviterFingerprint?: string,
  message?: string
): Promise<string> {
  // 1. Encapsulate using contact's Kyber public key
  const { ciphertext: kyberCiphertext, sharedSecret } = await encapsulate(contact.publicKey);
  
  // 2. Create invitation payload
  const payload: InvitationPayload = {
    groupName: group.name,
    groupAesKey: group.aesKey,
    groupEmoji: group.emoji,
    inviterFingerprint,
    message
  };
  const payloadJson = JSON.stringify(payload);
  
  // 3. Encrypt payload with shared secret
  const sharedSecretBytes = base64Decode(sharedSecret);
  const aesKey = await crypto.subtle.importKey(
    'raw',
    sharedSecretBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
  const encoded = new TextEncoder().encode(payloadJson);
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );
  
  // Prepend IV to encrypted data
  const encryptedWithIV = new Uint8Array(AES_IV_BYTES + encryptedBuffer.byteLength);
  encryptedWithIV.set(iv, 0);
  encryptedWithIV.set(bufferToUint8Array(encryptedBuffer), AES_IV_BYTES);
  
  // 4. Format invitation string
  // Use compact fingerprint (no colons) for shorter string
  const compactFingerprint = contact.shortFingerprint.replace(/:/g, '');
  
  return `${INVITATION_PREFIX}${compactFingerprint}:${kyberCiphertext}:${base64Encode(encryptedWithIV)}`;
}

/**
 * Parse an invitation string
 */
export function parseInvitation(invitationString: string): GroupInvitation | null {
  const match = invitationString.match(
    /^Quack:\/\/INV:([A-Fa-f0-9]{8}):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/
  );
  
  if (!match) return null;
  
  // Restore fingerprint format with colons
  const fp = match[1].toUpperCase();
  const shortFingerprint = `${fp.slice(0,2)}:${fp.slice(2,4)}:${fp.slice(4,6)}:${fp.slice(6,8)}`;
  
  return {
    recipientFingerprint: shortFingerprint,
    kyberCiphertext: match[2],
    encryptedGroupData: match[3]
  };
}

/**
 * Accept a group invitation using your personal key
 * @param invitation Parsed invitation
 * @param personalKey Your personal key (must match recipient fingerprint)
 * @returns Invitation payload with group details, or null if failed
 */
export async function acceptInvitation(
  invitation: GroupInvitation,
  personalKey: PersonalKey
): Promise<InvitationPayload | null> {
  // Check if invitation is for us
  if (invitation.recipientFingerprint !== personalKey.shortFingerprint) {
    return null;
  }
  
  try {
    // 1. Decapsulate to get shared secret
    const sharedSecret = await decapsulate(personalKey.secretKey, invitation.kyberCiphertext);
    
    // 2. Import shared secret as AES key
    const sharedSecretBytes = base64Decode(sharedSecret);
    const aesKey = await crypto.subtle.importKey(
      'raw',
      sharedSecretBytes.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    // 3. Decrypt payload (IV is prepended)
    const encryptedWithIV = base64Decode(invitation.encryptedGroupData);
    const iv = encryptedWithIV.slice(0, AES_IV_BYTES);
    const encryptedData = encryptedWithIV.slice(AES_IV_BYTES);
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      aesKey,
      encryptedData.buffer as ArrayBuffer
    );
    
    const payloadJson = new TextDecoder().decode(decryptedBuffer);
    const payload = JSON.parse(payloadJson) as InvitationPayload;
    
    return payload;
  } catch (error) {
    console.error('Failed to accept invitation:', error);
    return null;
  }
}

/**
 * Try to accept an invitation with multiple personal keys
 */
export async function tryAcceptInvitation(
  invitationString: string,
  personalKeys: PersonalKey[]
): Promise<{ payload: InvitationPayload; keyId: string } | null> {
  const parsed = parseInvitation(invitationString);
  if (!parsed) return null;
  
  for (const key of personalKeys) {
    const payload = await acceptInvitation(parsed, key);
    if (payload !== null) {
      return { payload, keyId: key.id };
    }
  }
  
  return null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a string is a Quack group message
 */
export function isGroupMessage(text: string): boolean {
  return /^Quack:\/\/[A-Fa-f0-9]{8}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(text);
}

/**
 * Check if a string is a Quack invitation
 */
export function isInvitation(text: string): boolean {
  return text.startsWith(INVITATION_PREFIX);
}

/**
 * Extract all Quack strings from text (messages, invitations, keys, stealth)
 */
export function extractQuackStrings(text: string): string[] {
  // Match group messages, stealth messages, invitations, and key shares
  const regex = /Quack:\/\/(?:INV:|KEY:|_:)?[A-Za-z0-9+/=:]+/g;
  const matches = text.match(regex) || [];
  
  // Filter to only valid formats
  return matches.filter(m => 
    isGroupMessage(m) || 
    isStealthMessage(m) ||
    isInvitation(m) || 
    /^Quack:\/\/KEY:[A-Za-z0-9+/=]+$/.test(m)
  );
}

/**
 * Find and decrypt all group messages in text
 */
export async function findDecryptableMessages(
  text: string,
  groups: QuackGroup[]
): Promise<Array<{ original: string; plaintext: string; group: QuackGroup }>> {
  const quackStrings = extractQuackStrings(text);
  const results: Array<{ original: string; plaintext: string; group: QuackGroup }> = [];
  
  for (const qs of quackStrings) {
    if (isGroupMessage(qs)) {
      const decrypted = await decryptWithGroups(qs, groups);
      if (decrypted) {
        results.push({
          original: qs,
          plaintext: decrypted.plaintext,
          group: decrypted.group
        });
      }
    }
  }
  
  return results;
}
