/**
 * Quack - Type Definitions
 * 
 * v2: Group-based encryption model
 * - Personal keys: Kyber keypairs for receiving group invitations
 * - Groups: Shared AES keys for community encryption
 * - Contacts: Other people's Kyber public keys for inviting them
 */

// ============================================================================
// Key Types
// ============================================================================

export type KeyType = 'personal' | 'contact';

// Base key interface
interface BaseKey {
  id: string;                    // UUID
  name: string;                  // User-friendly name
  type: KeyType;                 // Personal or contact key
  publicKey: string;             // Kyber public key (base64)
  fingerprint: string;           // Full fingerprint (47 chars)
  shortFingerprint: string;      // Short fingerprint (11 chars)
  createdAt: number;             // Timestamp
}

// Personal key - your identity, includes secret key
// Used for RECEIVING group invitations securely
export interface PersonalKey extends BaseKey {
  type: 'personal';
  secretKey: string;             // Kyber secret key (base64, encrypted in vault)
}

// Contact key - someone else's public key
// Used for INVITING them to groups
export interface ContactKey extends BaseKey {
  type: 'contact';
  notes?: string;                // Optional notes about this contact
  verifiedAt?: number;           // Timestamp when fingerprint was verified (optional)
}

// Union type for all keys
export type QuackKey = PersonalKey | ContactKey;

// Type guards
export function isPersonalKey(key: QuackKey): key is PersonalKey {
  return key.type === 'personal';
}

export function isContactKey(key: QuackKey): key is ContactKey {
  return key.type === 'contact';
}

// ============================================================================
// Groups
// ============================================================================

export interface QuackGroup {
  id: string;                    // UUID
  name: string;                  // User-friendly name (e.g., "Friends", "Work Team")
  emoji?: string;                // Optional emoji for quick identification
  aesKey: string;                // AES-256 key (base64) - THE SHARED SECRET
  fingerprint: string;           // Full fingerprint (47 chars) - derived from AES key
  shortFingerprint: string;      // Short fingerprint (11 chars) - used in messages
  createdAt: number;             // Timestamp
  createdBy?: string;            // Optional: who created this group (their fingerprint)
  notes?: string;                // Optional notes/description
  color?: string;                // Optional color for UI
}

// ============================================================================
// Vault Storage
// ============================================================================

export interface VaultData {
  keys: QuackKey[];              // Personal and contact keys
  groups: QuackGroup[];          // Shared group keys
}

export interface EncryptedVault {
  version: number;               // 2 = current Kyber + Groups format
  salt: string;                  // PBKDF2 salt (base64)
  iv: string;                    // AES-GCM IV (base64)
  data: string;                  // Encrypted JSON containing VaultData (base64)
}

// ============================================================================
// App Settings & Session
// ============================================================================

export interface StorageSchema {
  vault?: EncryptedVault;
  settings: AppSettings;
  session: SessionData;
}

export interface AppSettings {
  autoLockTimeout: number;       // Minutes (0 = disabled)
  darkMode: boolean;
  showNotifications: boolean;
  maxAutoDecrypts: number;       // Default: 10
  debugMode: boolean;            // Show debug info
}

export interface SessionData {
  unlocked: boolean;
  unlockedAt: number;
  lastActivity: number;
}

// ============================================================================
// Message Formats
// ============================================================================

/**
 * Group encrypted message format:
 * Quack://[group_short_fingerprint]:[iv_b64]:[ciphertext_b64]
 * 
 * Simple! Just identifies the group and contains AES-encrypted data.
 */
export interface GroupMessage {
  groupFingerprint: string;      // Short fingerprint to identify which group
  iv: string;                    // AES-GCM IV (base64)
  ciphertext: string;            // AES-GCM encrypted message (base64)
}

/**
 * Group invitation format (secure key delivery):
 * Quack://INV:[recipient_short_fingerprint]:[kyber_ciphertext_b64]:[encrypted_group_data_b64]
 * 
 * The kyber_ciphertext encapsulates a shared secret.
 * The encrypted_group_data is the group info (name, AES key) encrypted with that shared secret.
 */
export interface GroupInvitation {
  recipientFingerprint: string;  // Who this invitation is for
  kyberCiphertext: string;       // Kyber ciphertext for key encapsulation
  encryptedGroupData: string;    // Group details encrypted with the shared secret
}

/**
 * Decrypted invitation payload (what's inside encryptedGroupData)
 */
export interface InvitationPayload {
  groupName: string;             // Name of the group
  groupAesKey: string;           // The shared AES key (base64)
  groupEmoji?: string;           // Optional emoji
  inviterFingerprint?: string;   // Who sent this invitation
  message?: string;              // Optional message from inviter
}

/**
 * Key share format (unchanged):
 * Quack://KEY:[public_key_base64]
 */
export interface SharedKey {
  publicKey: string;
}

// ============================================================================
// Legacy Types (for migration)
// ============================================================================

export interface LegacyQuackKey {
  id: string;
  name: string;
  publicKey: string;
  privateKey: string;
  aesKeyMaterial: string;
  createdAt: number;
}

// Legacy message format (1-to-1, deprecated but still parsed for backwards compat)
export interface EncryptedMessage {
  recipientFingerprint: string;  // Short fingerprint to identify recipient
  kyberCiphertext: string;       // Kyber ciphertext (base64)
  encryptedData: string;         // AES-GCM encrypted message (base64)
  iv: string;                    // AES-GCM IV (base64)
}

// ============================================================================
// Internal Messages (Chrome extension messaging)
// ============================================================================

export type MessageType =
  // Encryption
  | 'ENCRYPT_MESSAGE'
  | 'DECRYPT_MESSAGE'
  // Keys
  | 'GET_KEYS'
  | 'GET_PERSONAL_KEY'
  | 'GET_CONTACTS'
  | 'ADD_CONTACT'
  | 'EXPORT_KEY'
  | 'IMPORT_KEY'
  // Groups
  | 'GET_GROUPS'
  | 'CREATE_GROUP'
  | 'JOIN_GROUP'
  | 'LEAVE_GROUP'
  | 'INVITE_TO_GROUP'
  | 'EXPORT_GROUP_INVITE'
  // Vault
  | 'VAULT_STATUS'
  | 'CACHE_VAULT'
  | 'GET_VAULT_DATA'
  | 'VAULT_UPDATED'
  // UI
  | 'OPEN_SECURE_COMPOSE'
  | 'OPEN_UNLOCK'
  | 'ENCRYPTED_MESSAGE_READY'
  | 'SHOW_NOTIFICATION';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

// Payloads
export interface EncryptMessagePayload {
  plaintext: string;
  groupId: string;               // Now encrypts to a GROUP, not a contact
}

export interface DecryptMessagePayload {
  encryptedMessage: string;      // Full Quack://... string
}

export interface ImportKeyPayload {
  keyString: string;             // Quack://KEY:... string
  name: string;                  // Name for the contact
}

export interface ExportKeyPayload {
  keyId: string;                 // Personal key ID to export
}

export interface CreateGroupPayload {
  name: string;
  emoji?: string;
  notes?: string;
}

export interface InviteToGroupPayload {
  groupId: string;
  contactId: string;             // Contact to invite
  message?: string;              // Optional invitation message
}

export interface JoinGroupPayload {
  invitationString: string;      // Quack://INV:... string
}

export interface NotificationPayload {
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

// ============================================================================
// Export/Import Types
// ============================================================================

/**
 * Exported vault file format
 * The `data` field contains the vault JSON encrypted with the export password
 */
export interface ExportedVault {
  quackVersion: string;          // App version that created this export
  exportedAt: number;            // Timestamp (ms since epoch)
  encrypted: true;               // Always true (plaintext exports not supported)
  salt: string;                  // PBKDF2 salt (base64)
  iv: string;                    // AES-GCM IV (base64)
  data: string;                  // Encrypted VaultData JSON (base64)
}

/**
 * Import item for the selection checklist
 */
export interface ImportItem {
  id: string;
  type: 'personal' | 'contact' | 'group';
  name: string;
  fingerprint: string;
  shortFingerprint: string;
  emoji?: string;                // For groups
  hasConflict: boolean;          // True if fingerprint exists in current vault
  conflictName?: string;         // Name of existing item with same fingerprint
  selected: boolean;             // Whether user selected this item for import
  data: QuackKey | QuackGroup;   // The actual item to import
}
