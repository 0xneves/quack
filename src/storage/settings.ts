/**
 * Quack - Settings Storage
 * 
 * SECURITY MODEL:
 * - Settings (preferences) → chrome.storage.local (persists across sessions)
 * - Session state (unlocked flag) → chrome.storage.session (memory-only, wallet-grade)
 * 
 * chrome.storage.session is memory-only and clears when:
 * - Browser closes
 * - Extension restarts
 * - Extension updates
 * 
 * This matches MetaMask/Phantom security patterns.
 */

import type { AppSettings, SessionData } from '@/types';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '@/utils/constants';

/**
 * Get settings from storage (persisted preferences)
 */
export async function getSettings(): Promise<AppSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
}

/**
 * Save settings to storage
 */
export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
}

/**
 * Get session data from memory-only storage
 * 
 * SECURITY: Uses chrome.storage.session which is:
 * - Never written to disk
 * - Cleared on browser close
 * - Cleared on extension restart
 */
export async function getSession(): Promise<SessionData> {
  const result = await chrome.storage.session.get(STORAGE_KEYS.SESSION);
  return result[STORAGE_KEYS.SESSION] || {
    unlocked: false,
    unlockedAt: 0,
    lastActivity: 0,
  };
}

/**
 * Save session data to memory-only storage
 */
export async function saveSession(session: Partial<SessionData>): Promise<void> {
  const current = await getSession();
  const updated = { ...current, ...session };
  await chrome.storage.session.set({ [STORAGE_KEYS.SESSION]: updated });
}

/**
 * Mark vault as unlocked
 */
export async function markVaultUnlocked(): Promise<void> {
  await saveSession({
    unlocked: true,
    unlockedAt: Date.now(),
    lastActivity: Date.now(),
  });
}

/**
 * Mark vault as locked
 */
export async function markVaultLocked(): Promise<void> {
  await saveSession({
    unlocked: false,
    unlockedAt: 0,
    lastActivity: 0,
  });
}

/**
 * Update last activity timestamp
 */
export async function updateLastActivity(): Promise<void> {
  const session = await getSession();
  if (session.unlocked) {
    await saveSession({ lastActivity: Date.now() });
  }
}

/**
 * Check if vault should auto-lock
 */
export async function shouldAutoLock(): Promise<boolean> {
  const settings = await getSettings();
  const session = await getSession();
  
  if (!session.unlocked || settings.autoLockTimeout === 0) {
    return false;
  }
  
  const timeoutMs = settings.autoLockTimeout * 60 * 1000;
  const timeSinceActivity = Date.now() - session.lastActivity;
  
  return timeSinceActivity >= timeoutMs;
}

/**
 * One-time migration: Remove session data from local storage
 * 
 * SECURITY: In v0.1.0+, session state moved from chrome.storage.local 
 * to chrome.storage.session. This clears any old persisted session data.
 * Call this once on extension startup.
 */
export async function migrateSessionToMemoryOnly(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SESSION);
    if (result[STORAGE_KEYS.SESSION]) {
      await chrome.storage.local.remove(STORAGE_KEYS.SESSION);
      console.log('🔒 Migrated session to memory-only storage (security upgrade)');
    }
  } catch (err) {
    // Ignore errors - this is just cleanup
    console.warn('Session migration check failed:', err);
  }
}

