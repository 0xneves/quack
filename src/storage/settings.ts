/**
 * Quack - Settings Storage
 */

import type { AppSettings, SessionData } from '@/types';
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '@/utils/constants';

/**
 * Get settings from storage
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
 * Get session data
 */
export async function getSession(): Promise<SessionData> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SESSION);
  return result[STORAGE_KEYS.SESSION] || {
    unlocked: false,
    unlockedAt: 0,
    lastActivity: 0,
  };
}

/**
 * Save session data
 */
export async function saveSession(session: Partial<SessionData>): Promise<void> {
  const current = await getSession();
  const updated = { ...current, ...session };
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSION]: updated });
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

