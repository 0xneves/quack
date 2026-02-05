/**
 * Quack - Vault Storage Management
 * 
 * Handles encrypted storage of:
 * - Personal keys (Kyber keypairs for receiving invitations)
 * - Contact keys (others' Kyber public keys for inviting them)
 * - Groups (shared AES keys for community encryption)
 */

import type { 
  QuackKey, 
  PersonalKey, 
  ContactKey,
  QuackGroup,
  VaultData, 
  EncryptedVault,
  InvitationPayload
} from '@/types';
import { encryptVault, decryptVault } from '@/crypto/pbkdf2';
import { 
  generateKyberKeyPair, 
  generateFingerprint, 
  generateShortFingerprint,
  isValidPublicKey
} from '@/crypto/kyber';
import {
  generateGroupKey,
  generateGroupFingerprint,
  generateGroupShortFingerprint
} from '@/crypto/group';
import { generateUUID } from '@/utils/helpers';
import { STORAGE_KEYS } from '@/utils/constants';

// Re-export type guards for convenience
export { isPersonalKey, isContactKey } from '@/types';

const CURRENT_VAULT_VERSION = 2;

/**
 * Check available storage space
 * Returns approximate bytes available (chrome.storage.local has ~5MB-10MB limit)
 */
export async function checkStorageQuota(): Promise<{ bytesUsed: number; quotaBytes: number; percentUsed: number }> {
  const bytesUsed = await chrome.storage.local.getBytesInUse();
  // Chrome local storage quota is typically 5MB for extensions, 10MB with unlimitedStorage permission
  const quotaBytes = 5 * 1024 * 1024; // 5MB default
  const percentUsed = Math.round((bytesUsed / quotaBytes) * 100);
  
  console.log(`📊 Storage: ${bytesUsed} bytes used (${percentUsed}% of ~${quotaBytes} bytes)`);
  
  return { bytesUsed, quotaBytes, percentUsed };
}

// ============================================================================
// Vault Lifecycle
// ============================================================================

/**
 * Initialize a new vault with master password
 */
export async function createVault(masterPassword: string): Promise<void> {
  const createId = Math.random().toString(36).substring(7);
  console.log(`🆕 [createVault:${createId}] START`);
  
  const emptyVault: VaultData = {
    keys: [],
    groups: [],
  };
  
  const vaultJson = JSON.stringify(emptyVault);
  console.log(`🆕 [createVault:${createId}] Empty vault JSON: ${vaultJson}`);
  
  const { salt, iv, encrypted } = await encryptVault(vaultJson, masterPassword);
  console.log(`🆕 [createVault:${createId}] Encrypted - salt length: ${salt.length}, iv length: ${iv.length}, data length: ${encrypted.length}`);
  
  const encryptedVault: EncryptedVault = {
    version: CURRENT_VAULT_VERSION,
    salt,
    iv,
    data: encrypted,
  };
  
  try {
    console.log(`🆕 [createVault:${createId}] Writing to storage...`);
    await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: encryptedVault });
    
    // Verify the write succeeded
    const verifyResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT);
    if (!verifyResult[STORAGE_KEYS.VAULT]) {
      throw new Error('Vault creation failed: verification failed');
    }
    console.log(`🆕 [createVault:${createId}] Vault written and verified in storage`);
    
    // Verify we can decrypt
    const testDecrypt = await decryptVault(
      encryptedVault.data,
      encryptedVault.iv,
      encryptedVault.salt,
      masterPassword
    );
    
    if (!testDecrypt) {
      throw new Error('Vault creation failed: decryption verification failed');
    }
    
    console.log(`🆕 [createVault:${createId}] SUCCESS - Vault created and verified`);
  } catch (error) {
    console.error(`🆕 [createVault:${createId}] FAILED:`, error);
    // Clean up any partial write
    await chrome.storage.local.remove(STORAGE_KEYS.VAULT);
    throw error;
  }
}

/**
 * Check if vault exists
 */
export async function vaultExists(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.VAULT);
  return !!result[STORAGE_KEYS.VAULT];
}

/**
 * Unlock vault with master password
 */
export async function unlockVault(masterPassword: string): Promise<VaultData | null> {
  const unlockId = Math.random().toString(36).substring(7);
  console.log(`🔓 [unlockVault:${unlockId}] START - Reading from storage...`);
  
  const result = await chrome.storage.local.get(STORAGE_KEYS.VAULT);
  const vault = result[STORAGE_KEYS.VAULT] as EncryptedVault | undefined;
  
  if (!vault) {
    console.log(`🔓 [unlockVault:${unlockId}] No vault found in storage`);
    throw new Error('Vault does not exist');
  }
  
  console.log(`🔓 [unlockVault:${unlockId}] Vault found, version=${vault.version}, data length=${vault.data?.length}`);
  
  const decrypted = await decryptVault(
    vault.data,
    vault.iv,
    vault.salt,
    masterPassword
  );
  
  if (!decrypted) {
    console.log(`🔓 [unlockVault:${unlockId}] Decryption failed (wrong password?)`);
    return null; // Wrong password
  }
  
  console.log(`🔓 [unlockVault:${unlockId}] Decrypted JSON length: ${decrypted.length}`);
  
  let vaultData = JSON.parse(decrypted) as VaultData;
  
  // Ensure groups array exists (migration from older versions)
  if (!vaultData.groups) {
    console.log(`🔓 [unlockVault:${unlockId}] No groups array, creating empty one`);
    vaultData.groups = [];
  }
  
  // Migrate from v1 if necessary
  if (vault.version === 1) {
    console.log(`🔓 [unlockVault:${unlockId}] Migrating from v1 to v2...`);
    vaultData = await migrateVaultV1ToV2(vaultData);
  }
  
  console.log(`🔓 [unlockVault:${unlockId}] SUCCESS - keys: ${vaultData.keys.length}, groups: ${vaultData.groups.length}`);
  console.log(`🔓 [unlockVault:${unlockId}] Group IDs:`, vaultData.groups.map(g => ({ id: g.id, name: g.name })));
  
  return vaultData;
}

/**
 * Migrate vault from v1 (legacy) to v2 (Kyber + Groups)
 */
async function migrateVaultV1ToV2(_oldVault: VaultData): Promise<VaultData> {
  console.warn('Migrating vault from v1 to v2. Legacy keys will be removed.');
  return { keys: [], groups: [] };
}

/**
 * Save vault data (re-encrypt with password)
 * 
 * SAFETY: Uses write-ahead pattern with verification:
 * 1. Backup current vault before overwriting
 * 2. Write new vault
 * 3. Verify the write succeeded by re-reading
 * 4. If verification fails, attempt to restore backup
 */
export async function saveVault(
  vaultData: VaultData,
  masterPassword: string
): Promise<void> {
  const BACKUP_KEY = 'vault_backup';
  const saveId = Math.random().toString(36).substring(7);
  
  console.log(`🔵 [saveVault:${saveId}] START - keys: ${vaultData.keys.length}, groups: ${vaultData.groups.length}`);
  console.log(`🔵 [saveVault:${saveId}] Group IDs:`, vaultData.groups.map(g => ({ id: g.id, name: g.name })));
  
  try {
    // Step 1: Backup current vault before overwriting
    console.log(`🔵 [saveVault:${saveId}] Step 1: Reading current vault for backup...`);
    const currentResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT);
    const currentVault = currentResult[STORAGE_KEYS.VAULT];
    if (currentVault) {
      console.log(`🔵 [saveVault:${saveId}] Current vault exists, backing up...`);
      await chrome.storage.local.set({ [BACKUP_KEY]: currentVault });
    } else {
      console.log(`🔵 [saveVault:${saveId}] No current vault to backup`);
    }
    
    // Step 2: Encrypt and save new vault
    console.log(`🔵 [saveVault:${saveId}] Step 2: Encrypting vault...`);
    const vaultJson = JSON.stringify(vaultData);
    console.log(`🔵 [saveVault:${saveId}] Vault JSON length: ${vaultJson.length}`);
    const { salt, iv, encrypted } = await encryptVault(vaultJson, masterPassword);
    console.log(`🔵 [saveVault:${saveId}] Encrypted data length: ${encrypted.length}`);
    
    const encryptedVault: EncryptedVault = {
      version: CURRENT_VAULT_VERSION,
      salt,
      iv,
      data: encrypted,
    };
    
    console.log(`🔵 [saveVault:${saveId}] Writing to chrome.storage.local...`);
    await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: encryptedVault });
    console.log(`🔵 [saveVault:${saveId}] Write complete`);
    
    // Step 3: Verify the write succeeded by attempting to decrypt
    console.log(`🔵 [saveVault:${saveId}] Step 3: Verifying write...`);
    const verifyResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT);
    const savedVault = verifyResult[STORAGE_KEYS.VAULT] as EncryptedVault | undefined;
    
    if (!savedVault) {
      throw new Error('Vault save verification failed: vault not found after save');
    }
    console.log(`🔵 [saveVault:${saveId}] Saved vault found, decrypting to verify...`);
    
    // Verify we can decrypt with the password
    const testDecrypt = await decryptVault(
      savedVault.data,
      savedVault.iv,
      savedVault.salt,
      masterPassword
    );
    
    if (!testDecrypt) {
      throw new Error('Vault save verification failed: decryption test failed');
    }
    
    // Parse and verify data integrity
    const parsedVault = JSON.parse(testDecrypt) as VaultData;
    console.log(`🔵 [saveVault:${saveId}] Verified vault - keys: ${parsedVault.keys?.length}, groups: ${parsedVault.groups?.length}`);
    
    if (!parsedVault.keys || !parsedVault.groups) {
      throw new Error('Vault save verification failed: data structure invalid');
    }
    
    // Verify counts match
    if (parsedVault.keys.length !== vaultData.keys.length || 
        parsedVault.groups.length !== vaultData.groups.length) {
      console.error(`🔴 [saveVault:${saveId}] COUNT MISMATCH! Expected keys=${vaultData.keys.length} groups=${vaultData.groups.length}, got keys=${parsedVault.keys.length} groups=${parsedVault.groups.length}`);
      throw new Error('Vault save verification failed: data count mismatch');
    }
    
    // Step 4: Clear backup on success
    await chrome.storage.local.remove(BACKUP_KEY);
    
    console.log(`🟢 [saveVault:${saveId}] SUCCESS - keys: ${vaultData.keys.length}, groups: ${vaultData.groups.length}`);
    
  } catch (error) {
    console.error(`🔴 [saveVault:${saveId}] FAILED:`, error);
    
    // Attempt to restore backup
    try {
      const backupResult = await chrome.storage.local.get(BACKUP_KEY);
      const backup = backupResult[BACKUP_KEY];
      if (backup) {
        await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: backup });
        console.log(`🟡 [saveVault:${saveId}] Restored vault from backup after save failure`);
      }
    } catch (restoreError) {
      console.error(`🔴 [saveVault:${saveId}] Failed to restore backup:`, restoreError);
    }
    
    throw error; // Re-throw so caller knows save failed
  }
}

// ============================================================================
// Personal Key Management
// ============================================================================

/**
 * Generate a new personal identity key (full Kyber keypair)
 * Used for receiving group invitations securely
 */
export async function generatePersonalKey(name: string): Promise<PersonalKey> {
  const { publicKey, secretKey } = await generateKyberKeyPair();
  const fingerprint = await generateFingerprint(publicKey);
  const shortFingerprint = await generateShortFingerprint(publicKey);
  
  return {
    id: generateUUID(),
    name,
    type: 'personal',
    publicKey,
    secretKey,
    fingerprint,
    shortFingerprint,
    createdAt: Date.now(),
  };
}

/**
 * Export a personal key for sharing (public key only)
 * Returns: Quack://KEY:[base64_public_key]
 */
export function exportPublicKey(key: PersonalKey): string {
  return `Quack://KEY:${key.publicKey}`;
}

// ============================================================================
// Contact Key Management
// ============================================================================

/**
 * Create a contact key from an imported public key
 * Used for inviting others to groups
 */
export async function createContactKey(
  name: string,
  publicKey: string,
  notes?: string
): Promise<ContactKey> {
  if (!isValidPublicKey(publicKey)) {
    throw new Error('Invalid public key format');
  }
  
  const fingerprint = await generateFingerprint(publicKey);
  const shortFingerprint = await generateShortFingerprint(publicKey);
  
  return {
    id: generateUUID(),
    name,
    type: 'contact',
    publicKey,
    fingerprint,
    shortFingerprint,
    createdAt: Date.now(),
    notes,
  };
}

/**
 * Parse an imported key string
 * Accepts: Quack://KEY:[base64_public_key]
 */
export function parseKeyString(keyString: string): { publicKey: string } | null {
  const match = keyString.match(/^Quack:\/\/KEY:([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  
  const publicKey = match[1];
  if (!isValidPublicKey(publicKey)) return null;
  
  return { publicKey };
}

// ============================================================================
// Group Management
// ============================================================================

/**
 * Create a new group with a fresh AES key
 */
export async function createGroup(
  name: string,
  emoji?: string,
  notes?: string,
  creatorFingerprint?: string
): Promise<QuackGroup> {
  const aesKey = await generateGroupKey();
  const fingerprint = await generateGroupFingerprint(aesKey);
  const shortFingerprint = await generateGroupShortFingerprint(aesKey);
  
  return {
    id: generateUUID(),
    name,
    emoji,
    aesKey,
    fingerprint,
    shortFingerprint,
    createdAt: Date.now(),
    createdBy: creatorFingerprint,
    notes,
  };
}

/**
 * Create a group from an accepted invitation
 */
export async function createGroupFromInvitation(
  payload: InvitationPayload
): Promise<QuackGroup> {
  const fingerprint = await generateGroupFingerprint(payload.groupAesKey);
  const shortFingerprint = await generateGroupShortFingerprint(payload.groupAesKey);
  
  return {
    id: generateUUID(),
    name: payload.groupName,
    emoji: payload.groupEmoji,
    aesKey: payload.groupAesKey,
    fingerprint,
    shortFingerprint,
    createdAt: Date.now(),
    createdBy: payload.inviterFingerprint,
    notes: payload.message ? `Invitation message: ${payload.message}` : undefined,
  };
}

/**
 * Check if we already have a group with this AES key
 */
export function hasGroup(aesKey: string, vaultData: VaultData): boolean {
  return vaultData.groups.some(g => g.aesKey === aesKey);
}

/**
 * Get group by fingerprint (short or full)
 */
export function getGroupByFingerprint(
  fingerprint: string,
  vaultData: VaultData
): QuackGroup | undefined {
  // Try short fingerprint first (8 chars, no colons)
  const clean = fingerprint.replace(/:/g, '').toUpperCase();
  if (clean.length === 8) {
    return vaultData.groups.find(g => g.shortFingerprint === clean);
  }
  // Try full fingerprint
  return vaultData.groups.find(g => g.fingerprint === fingerprint);
}

// ============================================================================
// Generic CRUD Operations
// ============================================================================

/**
 * Add key to vault
 */
export async function addKeyToVault(
  key: QuackKey,
  vaultData: VaultData
): Promise<VaultData> {
  const existing = vaultData.keys.find(k => k.fingerprint === key.fingerprint);
  if (existing) {
    throw new Error(`Key with this fingerprint already exists: ${existing.name}`);
  }
  
  return {
    ...vaultData,
    keys: [...vaultData.keys, key],
  };
}

/**
 * Remove key from vault
 */
export async function removeKeyFromVault(
  keyId: string,
  vaultData: VaultData
): Promise<VaultData> {
  return {
    ...vaultData,
    keys: vaultData.keys.filter(k => k.id !== keyId),
  };
}

/**
 * Update key in vault
 */
export async function updateKeyInVault(
  keyId: string,
  updates: Record<string, unknown>,
  vaultData: VaultData
): Promise<VaultData> {
  return {
    ...vaultData,
    keys: vaultData.keys.map(k => 
      k.id === keyId ? { ...k, ...updates } as QuackKey : k
    ),
  };
}

/**
 * Add group to vault
 */
export async function addGroupToVault(
  group: QuackGroup,
  vaultData: VaultData
): Promise<VaultData> {
  const addId = Math.random().toString(36).substring(7);
  console.log(`➕ [addGroupToVault:${addId}] START`);
  console.log(`➕ [addGroupToVault:${addId}] Adding group: id=${group.id}, name=${group.name}`);
  console.log(`➕ [addGroupToVault:${addId}] Current vaultData - keys: ${vaultData.keys.length}, groups: ${vaultData.groups.length}`);
  console.log(`➕ [addGroupToVault:${addId}] Existing group IDs:`, vaultData.groups.map(g => g.id));
  
  // Check for duplicate (same AES key)
  if (hasGroup(group.aesKey, vaultData)) {
    console.log(`➕ [addGroupToVault:${addId}] DUPLICATE - group already exists`);
    throw new Error(`You're already a member of this group`);
  }
  
  const newGroups = [...vaultData.groups, group];
  console.log(`➕ [addGroupToVault:${addId}] New groups array length: ${newGroups.length}`);
  console.log(`➕ [addGroupToVault:${addId}] New group IDs:`, newGroups.map(g => g.id));
  
  const result = {
    ...vaultData,
    groups: newGroups,
  };
  
  console.log(`➕ [addGroupToVault:${addId}] Result - keys: ${result.keys.length}, groups: ${result.groups.length}`);
  return result;
}

/**
 * Remove group from vault
 */
export async function removeGroupFromVault(
  groupId: string,
  vaultData: VaultData
): Promise<VaultData> {
  return {
    ...vaultData,
    groups: vaultData.groups.filter(g => g.id !== groupId),
  };
}

/**
 * Update group in vault
 */
export async function updateGroupInVault(
  groupId: string,
  updates: Record<string, unknown>,
  vaultData: VaultData
): Promise<VaultData> {
  return {
    ...vaultData,
    groups: vaultData.groups.map(g =>
      g.id === groupId ? { ...g, ...updates } as QuackGroup : g
    ),
  };
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Mark a contact as verified (fingerprint was verified out-of-band)
 */
export async function markContactVerified(
  keyId: string,
  vaultData: VaultData
): Promise<VaultData> {
  return updateKeyInVault(keyId, { verifiedAt: Date.now() }, vaultData);
}

/**
 * Get key by ID
 */
export function getKeyById(keyId: string, vaultData: VaultData): QuackKey | undefined {
  return vaultData.keys.find(k => k.id === keyId);
}

/**
 * Get key by short fingerprint
 */
export function getKeyByShortFingerprint(
  shortFingerprint: string, 
  vaultData: VaultData
): QuackKey | undefined {
  return vaultData.keys.find(k => k.shortFingerprint === shortFingerprint);
}

/**
 * Get group by ID
 */
export function getGroupById(groupId: string, vaultData: VaultData): QuackGroup | undefined {
  return vaultData.groups.find(g => g.id === groupId);
}

/**
 * Get all personal keys
 */
export function getPersonalKeys(vaultData: VaultData): PersonalKey[] {
  return vaultData.keys.filter((k): k is PersonalKey => k.type === 'personal');
}

/**
 * Get all contact keys
 */
export function getContactKeys(vaultData: VaultData): ContactKey[] {
  return vaultData.keys.filter((k): k is ContactKey => k.type === 'contact');
}

/**
 * Get all groups
 */
export function getGroups(vaultData: VaultData): QuackGroup[] {
  return vaultData.groups;
}

/**
 * Get the primary personal key (first one, or null if none)
 */
export function getPrimaryPersonalKey(vaultData: VaultData): PersonalKey | null {
  const personal = getPersonalKeys(vaultData);
  return personal.length > 0 ? personal[0] : null;
}
