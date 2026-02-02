/**
 * Quack - Application Constants
 */

// Encryption Constants
export const QUACK_PREFIX = 'Quack://';
export const QUACK_PREFIX_REGEX = /Quack:\/\/[A-Za-z0-9+/=]+/g;

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

