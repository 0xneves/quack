/**
 * Quack - Type Definitions
 */

// Key Types
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
export interface PersonalKey extends BaseKey {
  type: 'personal';
  secretKey: string;             // Kyber secret key (base64, encrypted in vault)
}

// Contact key - someone else's public key
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

// Legacy key format (for migration)
export interface LegacyQuackKey {
  id: string;
  name: string;
  publicKey: string;
  privateKey: string;
  aesKeyMaterial: string;
  createdAt: number;
}

// Storage Schema
export interface StorageSchema {
  vault?: EncryptedVault;
  settings: AppSettings;
  session: SessionData;
}

export interface EncryptedVault {
  version: number;               // 1 = legacy, 2 = new Kyber format
  salt: string;                  // PBKDF2 salt (base64)
  iv: string;                    // AES-GCM IV (base64)
  data: string;                  // Encrypted JSON containing keys (base64)
}

export interface VaultData {
  keys: QuackKey[];
  // Personal keys are stored first, then contacts
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

// Message format for encrypted messages
// Quack://MSG:[recipient_fingerprint_short]:[kyber_ciphertext]:[aes_encrypted_data]:[aes_iv]
export interface EncryptedMessage {
  recipientFingerprint: string;  // Short fingerprint to identify recipient
  kyberCiphertext: string;       // Kyber ciphertext (base64)
  encryptedData: string;         // AES-GCM encrypted message (base64)
  iv: string;                    // AES-GCM IV (base64)
}

// Key sharing format
// Quack://KEY:[public_key_base64]
export interface SharedKey {
  publicKey: string;
}

// Messages between background and content scripts
export type MessageType =
  | 'ENCRYPT_MESSAGE'
  | 'DECRYPT_MESSAGE'
  | 'GET_KEYS'
  | 'GET_PERSONAL_KEY'
  | 'GET_CONTACTS'
  | 'ADD_CONTACT'
  | 'EXPORT_KEY'
  | 'IMPORT_KEY'
  | 'VAULT_STATUS'
  | 'CACHE_VAULT'
  | 'GET_VAULT_DATA'
  | 'OPEN_SECURE_COMPOSE'
  | 'OPEN_UNLOCK'
  | 'ENCRYPTED_MESSAGE_READY'
  | 'SHOW_NOTIFICATION';

export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

export interface EncryptMessagePayload {
  plaintext: string;
  recipientKeyId: string;        // Contact key ID to encrypt to
}

export interface DecryptMessagePayload {
  encryptedMessage: string;      // Full Quack://MSG:... string
}

export interface ImportKeyPayload {
  keyString: string;             // Quack://KEY:... string
  name: string;                  // Name for the contact
}

export interface ExportKeyPayload {
  keyId: string;                 // Personal key ID to export
}

export interface NotificationPayload {
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}
