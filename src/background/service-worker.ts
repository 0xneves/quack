/**
 * Quack - Background Service Worker
 * 
 * Handles:
 * - Message passing between content scripts and popup
 * - Encryption/decryption operations
 * - Vault session management
 * - Auto-lock functionality
 */

import type { Message, VaultData } from '@/types';
import { unlockVault, getDecryptionKeys } from '@/storage/vault';
import { getSession, shouldAutoLock, markVaultLocked } from '@/storage/settings';
import { encryptMessage, decryptWithKeys } from '@/crypto/aes';
import { importAESKey } from '@/crypto/aes';

// In-memory vault data (cleared when service worker restarts)
let cachedVaultData: VaultData | null = null;
let cachedMasterPassword: string | null = null;

console.log('🦆 Quack service worker loaded');

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    });
  
  return true; // Keep channel open for async response
});

/**
 * Main message handler
 */
async function handleMessage(message: Message, sender: chrome.runtime.MessageSender) {
  console.log('📨 Received message:', message.type, sender.tab?.id);
  
  switch (message.type) {
    case 'VAULT_STATUS':
      return await handleVaultStatus();
      
    case 'GET_KEYS':
      return await handleGetKeys();
      
    case 'ENCRYPT_MESSAGE':
      return await handleEncryptMessage(message.payload as { plaintext: string; keyId: string });
      
    case 'DECRYPT_MESSAGE':
      return await handleDecryptMessage(message.payload as { ciphertext: string });
      
    case 'CACHE_VAULT':
      return await handleCacheVault(message.payload as { masterPassword: string });
    
    case 'GET_VAULT_DATA':
      return handleGetVaultData();
      
    case 'ENCRYPTED_MESSAGE_READY':
      return { success: true };
    case 'OPEN_UNLOCK':
      return await openUnlockWindow();
      
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

/**
 * Check vault unlock status
 */
async function handleVaultStatus() {
  const session = await getSession();
  
  // Check auto-lock
  if (session.unlocked && await shouldAutoLock()) {
    await markVaultLocked();
    cachedVaultData = null;
    cachedMasterPassword = null;
    return { unlocked: false };
  }
  
  return { unlocked: session.unlocked };
}

/**
 * Get available keys for decryption
 */
async function handleGetKeys() {
  if (!cachedVaultData) {
    return { keys: [] };
  }
  
  const keys = await getDecryptionKeys(cachedVaultData);
  return { keys };
}

/**
 * Encrypt message with specified key
 */
async function handleEncryptMessage(payload: { plaintext: string; keyId: string }) {
  if (!(await ensureUnlocked())) {
    throw new Error('Vault is locked');
  }
  if (!cachedVaultData) {
    throw new Error('Vault is locked');
  }
  
  const key = cachedVaultData.keys.find(k => k.id === payload.keyId);
  if (!key) {
    throw new Error('Key not found');
  }
  
  const aesKey = await importAESKey(key.aesKeyMaterial);
  const encrypted = await encryptMessage(payload.plaintext, aesKey);

  return { encrypted };
}

/**
 * Decrypt message with available keys
 */
async function handleDecryptMessage(payload: { ciphertext: string }) {
  const { ciphertext } = payload;
  
  if (!(await ensureUnlocked())) {
    return { plaintext: null, error: 'Vault is locked' };
  }
  if (!cachedVaultData) {
    return { plaintext: null, error: 'Vault is locked' };
  }
  
  const keys = await getDecryptionKeys(cachedVaultData);
  const result = await decryptWithKeys(ciphertext, keys);
  
  if (result) {
    return { 
      plaintext: result.plaintext, 
      keyId: result.keyId,
      keyName: cachedVaultData.keys.find(k => k.id === result.keyId)?.name 
    };
  }
  
  return { plaintext: null, error: 'No key could decrypt this message' };
}

/**
 * Return cached vault data (names/ids) for popup without re-login
 */
function handleGetVaultData() {
  if (!cachedVaultData) {
    return { vault: null };
  }
  return { vault: cachedVaultData };
}

/**
 * Cache vault data in memory (from popup) to avoid locked state in content scripts
 */
async function handleCacheVault(payload: { masterPassword: string }) {
  const { masterPassword } = payload;
  if (!masterPassword) {
    return { cached: false, error: 'Missing master password' };
  }

  const ok = await cacheVault(masterPassword);
  return { cached: ok };
}

/**
 * Export functions for popup to cache vault data
 */
export async function cacheVault(masterPassword: string): Promise<boolean> {
  try {
    const vaultData = await unlockVault(masterPassword);
    if (!vaultData) {
      return false;
    }
    
    cachedVaultData = vaultData;
    cachedMasterPassword = masterPassword;
    return true;
  } catch (error) {
    console.error('Failed to cache vault:', error);
    return false;
  }
}

export function clearVaultCache(): void {
  cachedVaultData = null;
  cachedMasterPassword = null;
}

export function getCachedVaultData(): VaultData | null {
  return cachedVaultData;
}

export function getCachedMasterPassword(): string | null {
  return cachedMasterPassword;
}

export function setCachedVaultData(data: VaultData): void {
  cachedVaultData = data;
}

async function ensureUnlocked(): Promise<boolean> {
  const session = await getSession();
  if (!session.unlocked) {
    clearVaultCache();
    return false;
  }
  return true;
}

// Auto-lock check every minute
setInterval(async () => {
  if (await shouldAutoLock()) {
    await markVaultLocked();
    clearVaultCache();
    console.log('🔒 Vault auto-locked due to inactivity');
  }
}, 60 * 1000);

// Extension install/update handler
chrome.runtime.onInstalled.addListener((details) => {
  console.log('🦆 Quack installed:', details.reason);
  
  if (details.reason === 'install') {
    // Open welcome page or setup
    chrome.tabs.create({
      url: chrome.runtime.getURL('popup/index.html')
    });
  }
});

let unlockWindowId: number | null = null;
async function openUnlockWindow() {
  try {
    if (unlockWindowId !== null) {
      chrome.windows.update(unlockWindowId, { focused: true }, (win) => {
        if (chrome.runtime.lastError || !win) {
          unlockWindowId = null;
          createUnlockWindow().catch(err => console.error('Failed to recreate unlock window', err));
        }
      });
      return { opened: true, reused: true };
    }
    await createUnlockWindow();
    return { opened: true, reused: false };
  } catch (err) {
    console.error('Failed to open unlock window', err);
    return { opened: false, error: (err as Error).message };
  }
}

function createUnlockWindow(): Promise<void> {
  const width = 420;
  const height = 640;
  return new Promise((resolve, reject) => {
    chrome.windows.getCurrent((current) => {
      const baseLeft = current?.left ?? 0;
      const baseTop = current?.top ?? 0;
      const currentWidth = current?.width ?? (width + 200);
      const left = Math.max(0, baseLeft + currentWidth - width - 4);
      const top = Math.max(0, baseTop + 4);
      chrome.windows.create(
        {
          url: chrome.runtime.getURL('src/popup/index.html#unlock'),
          type: 'popup',
          width,
          height,
          focused: true,
          top,
          left,
        },
        (win) => {
          if (chrome.runtime.lastError || !win) {
            return reject(chrome.runtime.lastError || new Error('Cannot open unlock window'));
          }
          unlockWindowId = win.id ?? null;
          resolve();
        }
      );
    });
  });
}

