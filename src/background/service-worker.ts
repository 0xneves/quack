/**
 * Quack - Background Service Worker
 * 
 * Handles:
 * - Message passing between content scripts and popup
 * - Encryption/decryption operations using ML-KEM + AES-GCM
 * - Vault session management
 * - Auto-lock functionality
 */

import type { Message, VaultData, ContactKey, EncryptMessagePayload, DecryptMessagePayload, ImportKeyPayload } from '@/types';
import { isPersonalKey, isContactKey } from '@/types';
import { unlockVault, getKeyById, getPersonalKeys, getContactKeys, createContactKey, addKeyToVault, saveVault, parseKeyString, exportPublicKey } from '@/storage/vault';
import { getSession, shouldAutoLock, markVaultLocked } from '@/storage/settings';
import { encryptToContact, decryptMessage } from '@/crypto/message';

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
      
    case 'GET_PERSONAL_KEY':
      return handleGetPersonalKey();
      
    case 'GET_CONTACTS':
      return handleGetContacts();
      
    case 'ENCRYPT_MESSAGE':
      return await handleEncryptMessage(message.payload as EncryptMessagePayload);
      
    case 'DECRYPT_MESSAGE':
      return await handleDecryptMessage(message.payload as DecryptMessagePayload);
      
    case 'ADD_CONTACT':
      return await handleAddContact(message.payload as ImportKeyPayload);
      
    case 'EXPORT_KEY':
      return handleExportKey(message.payload as { keyId: string });
      
    case 'IMPORT_KEY':
      return await handleImportKey(message.payload as ImportKeyPayload);
      
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
 * Get all keys (personal + contacts) for UI display
 */
async function handleGetKeys() {
  if (!cachedVaultData) {
    return { keys: [], personal: [], contacts: [] };
  }
  
  return { 
    keys: cachedVaultData.keys,
    personal: getPersonalKeys(cachedVaultData),
    contacts: getContactKeys(cachedVaultData)
  };
}

/**
 * Get primary personal key info
 */
function handleGetPersonalKey() {
  if (!cachedVaultData) {
    return { key: null };
  }
  
  const personalKeys = getPersonalKeys(cachedVaultData);
  if (personalKeys.length === 0) {
    return { key: null };
  }
  
  // Return first personal key (primary identity)
  const key = personalKeys[0];
  return {
    key: {
      id: key.id,
      name: key.name,
      fingerprint: key.fingerprint,
      shortFingerprint: key.shortFingerprint,
      createdAt: key.createdAt
    }
  };
}

/**
 * Get all contacts for encryption target selection
 */
function handleGetContacts() {
  if (!cachedVaultData) {
    return { contacts: [] };
  }
  
  return { contacts: getContactKeys(cachedVaultData) };
}

/**
 * Encrypt message to a contact using their public key
 */
async function handleEncryptMessage(payload: EncryptMessagePayload) {
  if (!(await ensureUnlocked())) {
    throw new Error('Vault is locked');
  }
  if (!cachedVaultData) {
    throw new Error('Vault is locked');
  }
  
  const { plaintext, recipientKeyId } = payload;
  const key = getKeyById(recipientKeyId, cachedVaultData);
  
  if (!key) {
    throw new Error('Recipient key not found');
  }
  
  // Can only encrypt TO contacts or TO yourself (self-encryption)
  const contactKey: ContactKey = isContactKey(key) 
    ? key 
    : {
        // Convert personal key to contact-like for encryption
        id: key.id,
        name: key.name,
        type: 'contact' as const,
        publicKey: key.publicKey,
        fingerprint: key.fingerprint,
        shortFingerprint: key.shortFingerprint,
        createdAt: key.createdAt
      };
  
  const encrypted = await encryptToContact(plaintext, contactKey);
  return { encrypted };
}

/**
 * Decrypt message using personal keys
 */
async function handleDecryptMessage(payload: DecryptMessagePayload) {
  if (!(await ensureUnlocked())) {
    return { plaintext: null, error: 'Vault is locked' };
  }
  if (!cachedVaultData) {
    return { plaintext: null, error: 'Vault is locked' };
  }
  
  const { encryptedMessage } = payload;
  const personalKeys = getPersonalKeys(cachedVaultData);
  
  if (personalKeys.length === 0) {
    return { plaintext: null, error: 'No personal key available' };
  }
  
  const result = await decryptMessage(encryptedMessage, personalKeys);
  
  if (result) {
    const key = getKeyById(result.keyId, cachedVaultData);
    return { 
      plaintext: result.plaintext, 
      keyId: result.keyId,
      keyName: key?.name
    };
  }
  
  return { plaintext: null, error: 'No key could decrypt this message' };
}

/**
 * Add a contact from a key string
 */
async function handleAddContact(payload: ImportKeyPayload) {
  if (!(await ensureUnlocked()) || !cachedVaultData || !cachedMasterPassword) {
    throw new Error('Vault is locked');
  }
  
  const { keyString, name } = payload;
  const parsed = parseKeyString(keyString);
  
  if (!parsed) {
    throw new Error('Invalid key format. Expected: Quack://KEY:[public_key]');
  }
  
  const contact = await createContactKey(name, parsed.publicKey);
  cachedVaultData = await addKeyToVault(contact, cachedVaultData);
  await saveVault(cachedVaultData, cachedMasterPassword);
  
  return { 
    success: true, 
    contact: {
      id: contact.id,
      name: contact.name,
      fingerprint: contact.fingerprint,
      shortFingerprint: contact.shortFingerprint
    }
  };
}

/**
 * Export personal key for sharing (public key only)
 */
function handleExportKey(payload: { keyId: string }) {
  if (!cachedVaultData) {
    throw new Error('Vault is locked');
  }
  
  const key = getKeyById(payload.keyId, cachedVaultData);
  if (!key || !isPersonalKey(key)) {
    throw new Error('Personal key not found');
  }
  
  const exported = exportPublicKey(key);
  return { keyString: exported, fingerprint: key.fingerprint };
}

/**
 * Import a key (alias for ADD_CONTACT)
 */
async function handleImportKey(payload: ImportKeyPayload) {
  return handleAddContact(payload);
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
