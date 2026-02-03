/**
 * Quack - Application Constants
 */

// Message Format Constants
// New format: Quack://MSG:[fingerprint]:[kyber_ct]:[aes_data]:[iv]
// Key format: Quack://KEY:[public_key_base64]
export const QUACK_PREFIX = 'Quack://';
export const QUACK_MSG_PREFIX = 'Quack://MSG:';
export const QUACK_KEY_PREFIX = 'Quack://KEY:';
export const QUACK_MSG_REGEX = /Quack:\/\/MSG:[A-Fa-f0-9]{8}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+/g;
export const QUACK_KEY_REGEX = /Quack:\/\/KEY:[A-Za-z0-9+/=]+/g;
// Legacy format for backward compatibility
export const QUACK_LEGACY_REGEX = /Quack:\/\/[A-Za-z0-9+/=]+/g;

// Cryptography Parameters
export const AES_KEY_SIZE = 256;
export const AES_IV_SIZE = 12; // 96 bits for AES-GCM
export const AES_TAG_SIZE = 16; // 128 bits
export const PBKDF2_ITERATIONS = 100000;

// UI Constants
export const MAX_AUTO_DECRYPTS = 10;
export const AUTO_LOCK_TIMEOUT = 15; // minutes
export const NOTIFICATION_DURATION = 3000; // ms

// Storage Keys
export const STORAGE_KEYS = {
  VAULT: 'vault',
  SETTINGS: 'settings',
  SESSION: 'session',
} as const;

// Default Settings
export const DEFAULT_SETTINGS = {
  autoLockTimeout: AUTO_LOCK_TIMEOUT,
  darkMode: false,
  showNotifications: true,
  maxAutoDecrypts: MAX_AUTO_DECRYPTS,
  debugMode: false,
};

// Extension Colors (matching Tailwind theme)
export const COLORS = {
  primary: '#ea711a',
  primaryHover: '#db5810',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',
};

