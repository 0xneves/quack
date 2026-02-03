/**
 * Quack - Background Service Worker
 * 
 * Handles:
 * - Message passing between content scripts and popup
 * - Group-based encryption using shared AES keys
 * - Secure group key distribution via Kyber encapsulation
 * - Vault session management
 * - Auto-lock functionality
 */

import type { 
  Message, 
  VaultData, 
  ContactKey,
  EncryptMessagePayload, 
  DecryptMessagePayload, 
  ImportKeyPayload,
  CreateGroupPayload,
  InviteToGroupPayload,
  JoinGroupPayload
} from '@/types';
import { isPersonalKey, isContactKey } from '@/types';
import { 
  unlockVault, 
  getKeyById, 
  getGroupById,
  getPersonalKeys, 
  getContactKeys,
  getGroups,
  createContactKey, 
  createGroup,
  createGroupFromInvitation,
  addKeyToVault, 
  addGroupToVault,
  removeGroupFromVault,
  hasGroup,
  saveVault, 
  parseKeyString, 
  exportPublicKey 
} from '@/storage/vault';
import { getSession, shouldAutoLock, markVaultLocked } from '@/storage/settings';
import { 
  encryptGroupMessage, 
  decryptMessage,
  createGroupInvitation,
  tryAcceptInvitation,
  encryptToContact  // Legacy support
} from '@/crypto/message';

// In-memory vault data (cleared when service worker restarts)
let cachedVaultData: VaultData | null = null;
let cachedMasterPassword: string | null = null;

console.log('🦆 Quack service worker loaded (v2 - Group Encryption)');

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
    
    // Groups
    case 'GET_GROUPS':
      return handleGetGroups();
      
    case 'CREATE_GROUP':
      return await handleCreateGroup(message.payload as CreateGroupPayload);
      
    case 'INVITE_TO_GROUP':
      return await handleInviteToGroup(message.payload as InviteToGroupPayload);
      
    case 'JOIN_GROUP':
      return await handleJoinGroup(message.payload as JoinGroupPayload);
      
    case 'LEAVE_GROUP':
      return await handleLeaveGroup(message.payload as { groupId: string });
      
    // Encryption
    case 'ENCRYPT_MESSAGE':
      return await handleEncryptMessage(message.payload as EncryptMessagePayload);
      
    case 'DECRYPT_MESSAGE':
      return await handleDecryptMessage(message.payload as DecryptMessagePayload);
      
    // Contacts
    case 'ADD_CONTACT':
      return await handleAddContact(message.payload as ImportKeyPayload);
      
    case 'EXPORT_KEY':
      return handleExportKey(message.payload as { keyId: string });
      
    case 'IMPORT_KEY':
      return await handleImportKey(message.payload as ImportKeyPayload);
      
    // Vault
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
 * Get all keys and groups for UI display
 */
async function handleGetKeys() {
  if (!cachedVaultData) {
    return { keys: [], personal: [], contacts: [], groups: [] };
  }
  
  return { 
    keys: cachedVaultData.keys,
    personal: getPersonalKeys(cachedVaultData),
    contacts: getContactKeys(cachedVaultData),
    groups: getGroups(cachedVaultData)
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
 * Get all contacts for inviting to groups
 */
function handleGetContacts() {
  if (!cachedVaultData) {
    return { contacts: [] };
  }
  
  return { contacts: getContactKeys(cachedVaultData) };
}

/**
 * Get all groups for encryption target selection
 */
function handleGetGroups() {
  if (!cachedVaultData) {
    return { groups: [] };
  }
  
  // Return groups without exposing the actual AES key
  const groups = getGroups(cachedVaultData).map(g => ({
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    fingerprint: g.fingerprint,
    shortFingerprint: g.shortFingerprint,
    createdAt: g.createdAt,
    createdBy: g.createdBy,
    notes: g.notes,
    color: g.color
  }));
  
  return { groups };
}

/**
 * Create a new group
 */
async function handleCreateGroup(payload: CreateGroupPayload) {
  if (!(await ensureUnlocked()) || !cachedVaultData || !cachedMasterPassword) {
    throw new Error('Vault is locked');
  }
  
  const { name, emoji, notes } = payload;
  
  // Get creator's fingerprint
  const personalKeys = getPersonalKeys(cachedVaultData);
  const creatorFingerprint = personalKeys.length > 0 ? personalKeys[0].shortFingerprint : undefined;
  
  const group = await createGroup(name, emoji, notes, creatorFingerprint);
  cachedVaultData = await addGroupToVault(group, cachedVaultData);
  await saveVault(cachedVaultData, cachedMasterPassword);
  
  return {
    success: true,
    group: {
      id: group.id,
      name: group.name,
      emoji: group.emoji,
      fingerprint: group.fingerprint,
      shortFingerprint: group.shortFingerprint,
      createdAt: group.createdAt
    }
  };
}

/**
 * Create an invitation to share a group with a contact
 */
async function handleInviteToGroup(payload: InviteToGroupPayload) {
  if (!(await ensureUnlocked()) || !cachedVaultData) {
    throw new Error('Vault is locked');
  }
  
  const { groupId, contactId, message } = payload;
  
  const group = getGroupById(groupId, cachedVaultData);
  if (!group) {
    throw new Error('Group not found');
  }
  
  const contact = getKeyById(contactId, cachedVaultData);
  if (!contact || !isContactKey(contact)) {
    throw new Error('Contact not found');
  }
  
  // Get inviter's fingerprint
  const personalKeys = getPersonalKeys(cachedVaultData);
  const inviterFingerprint = personalKeys.length > 0 ? personalKeys[0].shortFingerprint : undefined;
  
  const invitation = await createGroupInvitation(group, contact, inviterFingerprint, message);
  
  return {
    success: true,
    invitation,
    contactName: contact.name,
    groupName: group.name
  };
}

/**
 * Accept an invitation and join a group
 */
async function handleJoinGroup(payload: JoinGroupPayload) {
  if (!(await ensureUnlocked()) || !cachedVaultData || !cachedMasterPassword) {
    throw new Error('Vault is locked');
  }
  
  const { invitationString } = payload;
  const personalKeys = getPersonalKeys(cachedVaultData);
  
  if (personalKeys.length === 0) {
    throw new Error('No personal key available to accept invitation');
  }
  
  const result = await tryAcceptInvitation(invitationString, personalKeys);
  
  if (!result) {
    throw new Error('Could not decrypt invitation. Make sure it was sent to you.');
  }
  
  // Check if we already have this group
  if (hasGroup(result.payload.groupAesKey, cachedVaultData)) {
    return {
      success: true,
      alreadyMember: true,
      groupName: result.payload.groupName
    };
  }
  
  // Create and save the group
  const group = await createGroupFromInvitation(result.payload);
  cachedVaultData = await addGroupToVault(group, cachedVaultData);
  await saveVault(cachedVaultData, cachedMasterPassword);
  
  return {
    success: true,
    alreadyMember: false,
    group: {
      id: group.id,
      name: group.name,
      emoji: group.emoji,
      fingerprint: group.fingerprint,
      shortFingerprint: group.shortFingerprint
    },
    inviterFingerprint: result.payload.inviterFingerprint,
    message: result.payload.message
  };
}

/**
 * Leave a group (delete from vault)
 */
async function handleLeaveGroup(payload: { groupId: string }) {
  if (!(await ensureUnlocked()) || !cachedVaultData || !cachedMasterPassword) {
    throw new Error('Vault is locked');
  }
  
  const { groupId } = payload;
  const group = getGroupById(groupId, cachedVaultData);
  
  if (!group) {
    throw new Error('Group not found');
  }
  
  cachedVaultData = await removeGroupFromVault(groupId, cachedVaultData);
  await saveVault(cachedVaultData, cachedMasterPassword);
  
  return { success: true, groupName: group.name };
}

/**
 * Encrypt message to a group (primary method)
 * Falls back to legacy contact encryption if keyId provided instead of groupId
 */
async function handleEncryptMessage(payload: EncryptMessagePayload) {
  if (!(await ensureUnlocked())) {
    throw new Error('Vault is locked');
  }
  if (!cachedVaultData) {
    throw new Error('Vault is locked');
  }
  
  const { plaintext, groupId } = payload;
  
  // Try as group first (new method)
  const group = getGroupById(groupId, cachedVaultData);
  if (group) {
    const encrypted = await encryptGroupMessage(plaintext, group);
    return { encrypted, groupName: group.name };
  }
  
  // Fallback: try as key ID (legacy contact encryption)
  const key = getKeyById(groupId, cachedVaultData);
  if (key) {
    // Legacy: encrypt to contact
    const contactKey: ContactKey = isContactKey(key) 
      ? key 
      : {
          id: key.id,
          name: key.name,
          type: 'contact' as const,
          publicKey: key.publicKey,
          fingerprint: key.fingerprint,
          shortFingerprint: key.shortFingerprint,
          createdAt: key.createdAt
        };
    
    const encrypted = await encryptToContact(plaintext, contactKey);
    return { encrypted, keyName: key.name };
  }
  
  throw new Error('Group or key not found');
}

/**
 * Decrypt message using groups (primary) or personal keys (legacy)
 */
async function handleDecryptMessage(payload: DecryptMessagePayload) {
  if (!(await ensureUnlocked())) {
    return { plaintext: null, error: 'Vault is locked' };
  }
  if (!cachedVaultData) {
    return { plaintext: null, error: 'Vault is locked' };
  }
  
  const { encryptedMessage } = payload;
  const groups = getGroups(cachedVaultData);
  const personalKeys = getPersonalKeys(cachedVaultData);
  
  // Try to decrypt with groups and personal keys
  const result = await decryptMessage(encryptedMessage, groups, personalKeys);
  
  if (result) {
    if (result.groupId) {
      const group = getGroupById(result.groupId, cachedVaultData);
      return { 
        plaintext: result.plaintext, 
        groupId: result.groupId,
        keyName: group?.name,
        type: 'group'
      };
    } else if (result.keyId) {
      const key = getKeyById(result.keyId, cachedVaultData);
      return { 
        plaintext: result.plaintext, 
        keyId: result.keyId,
        keyName: key?.name,
        type: 'legacy'
      };
    }
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
 * Return cached vault data for popup without re-login
 */
function handleGetVaultData() {
  if (!cachedVaultData) {
    return { vault: null };
  }
  return { vault: cachedVaultData };
}

/**
 * Cache vault data in memory (from popup)
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
