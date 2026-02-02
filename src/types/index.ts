/**
 * Quack - Type Definitions
 */

// Encryption Key
export interface QuackKey {
  id: string;                    // UUID
  name: string;                  // User-friendly name
  publicKey: string;             // Kyber public key (base64)
  privateKey: string;            // Kyber private key (base64)
  aesKeyMaterial: string;        // AES-256 key material (base64)
  createdAt: number;             // Timestamp
}

// Storage Schema
export interface StorageSchema {
  vault?: EncryptedVault;
  settings: AppSettings;
  session: SessionData;
}

export interface EncryptedVault {
  version: number;
  salt: string;                  // PBKDF2 salt (base64)
  iv: string;                    // AES-GCM IV (base64)
  data: string;                  // Encrypted JSON containing keys (base64)
}

export interface VaultData {
  keys: QuackKey[];
}

export interface AppSettings {
  autoLockTimeout: number;       // Minutes (0 = disabled)
  darkMode: boolean;
  showNotifications: boolean;
  maxAutoDecrypts: number;       // Default: 10
}

export interface SessionData {
  unlocked: boolean;
  unlockedAt: number;
  lastActivity: number;
}

// Messages between background and content scripts
export type MessageType =
  | 'ENCRYPT_MESSAGE'
  | 'DECRYPT_MESSAGE'
  | 'GET_KEYS'
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
  keyId: string;
}

export interface DecryptMessagePayload {
  ciphertext: string;
}

export interface NotificationPayload {
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

