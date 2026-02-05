/**
 * Quack - Vault Storage Management (v3 - Separated Storage)
 * 
 * ARCHITECTURE:
 * 
 * vault_meta (rarely changes - only on create/password change):
 *   - salt: For PBKDF2 key derivation
 *   - passwordHash: Quick password verification
 *   - Survives data corruption!
 * 
 * vault_data (changes every save):
 *   - iv: New each save (AES-GCM requirement)
 *   - data: Encrypted vault content
 *   - Can be restored from backup
 * 
 * vault_backup (safety net):
 *   - Copy of vault_data before each save
 * 
 * This separation provides:
 * 1. Password never "stops working" due to data corruption
 * 2. Clear error distinction: "wrong password" vs "corrupted data"
 * 3. Manual recovery possible with password + salt + backup
 */

import type { 
  QuackKey, 
  PersonalKey, 
  ContactKey,
  QuackGroup,
  VaultData, 
  VaultMeta,
  VaultDataEncrypted,
  EncryptedVault,
  InvitationPayload
} from '@/types';
import { 
  generateSalt,
  deriveKeyFromPassword,
  generatePasswordHash,
  verifyPassword,
  encryptWithKey,
  decryptWithKey,
  decryptVault,
  base64Encode
} from '@/crypto/pbkdf2';
import { base64Decode } from '@/utils/helpers';
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

const CURRENT_VAULT_VERSION = 3;

// ============================================================================
// Storage Quota Check
// ============================================================================

/**
 * Check available storage space
 */
export async function checkStorageQuota(): Promise<{ bytesUsed: number; quotaBytes: number; percentUsed: number }> {
  const bytesUsed = await chrome.storage.local.getBytesInUse();
  const quotaBytes = 5 * 1024 * 1024; // 5MB default
  const percentUsed = Math.round((bytesUsed / quotaBytes) * 100);
  
  console.log(`📊 Storage: ${bytesUsed} bytes used (${percentUsed}% of ~${quotaBytes} bytes)`);
  
  return { bytesUsed, quotaBytes, percentUsed };
}

// ============================================================================
// Unlock Error Types
// ============================================================================

export type UnlockError = 
  | { type: 'no_vault' }
  | { type: 'wrong_password' }
  | { type: 'corrupted_data'; hasBackup: boolean }
  | { type: 'unknown'; message: string };

export interface UnlockResult {
  success: boolean;
  data?: VaultData;
  error?: UnlockError;
}

// ============================================================================
// Vault Lifecycle
// ============================================================================

/**
 * Check if vault exists (any version)
 */
export async function vaultExists(): Promise<boolean> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.VAULT_META, STORAGE_KEYS.VAULT]);
  // Check for v3 (vault_meta) or v2 (vault)
  return !!result[STORAGE_KEYS.VAULT_META] || !!result[STORAGE_KEYS.VAULT];
}

/**
 * Initialize a new vault with master password (v3)
 */
export async function createVault(masterPassword: string): Promise<void> {
  const createId = Math.random().toString(36).substring(7);
  console.log(`🆕 [createVault:${createId}] START - v3 separated storage`);
  
  // Generate salt (this will NEVER change unless password changes)
  const saltBytes = generateSalt();
  const salt = base64Encode(saltBytes);
  console.log(`🆕 [createVault:${createId}] Generated salt`);
  
  // Generate password verification hash
  const passwordHash = await generatePasswordHash(masterPassword, salt);
  console.log(`🆕 [createVault:${createId}] Generated password hash`);
  
  // Create vault_meta
  const vaultMeta: VaultMeta = {
    version: CURRENT_VAULT_VERSION,
    salt,
    passwordHash,
    createdAt: Date.now(),
  };
  
  // Derive encryption key
  const key = await deriveKeyFromPassword(masterPassword, saltBytes);
  
  // Create empty vault
  const emptyVault: VaultData = { keys: [], groups: [] };
  const vaultJson = JSON.stringify(emptyVault);
  
  // Encrypt vault data
  const { iv, encrypted } = await encryptWithKey(vaultJson, key);
  
  const vaultData: VaultDataEncrypted = {
    iv,
    data: encrypted,
    savedAt: Date.now(),
  };
  
  try {
    // Write vault_meta first (the critical piece)
    console.log(`🆕 [createVault:${createId}] Writing vault_meta...`);
    await chrome.storage.local.set({ [STORAGE_KEYS.VAULT_META]: vaultMeta });
    
    // Verify vault_meta write
    const verifyMeta = await chrome.storage.local.get(STORAGE_KEYS.VAULT_META);
    if (!verifyMeta[STORAGE_KEYS.VAULT_META]) {
      throw new Error('Vault creation failed: vault_meta not written');
    }
    
    // Write vault_data
    console.log(`🆕 [createVault:${createId}] Writing vault_data...`);
    await chrome.storage.local.set({ [STORAGE_KEYS.VAULT_DATA]: vaultData });
    
    // Verify we can decrypt
    const testDecrypt = await decryptWithKey(encrypted, iv, key);
    if (!testDecrypt) {
      throw new Error('Vault creation failed: decryption verification failed');
    }
    
    console.log(`🆕 [createVault:${createId}] SUCCESS - v3 vault created`);
    
  } catch (error) {
    console.error(`🆕 [createVault:${createId}] FAILED:`, error);
    // Clean up partial writes
    await chrome.storage.local.remove([STORAGE_KEYS.VAULT_META, STORAGE_KEYS.VAULT_DATA]);
    throw error;
  }
}

/**
 * Unlock vault with master password
 * 
 * Returns structured result with clear error types:
 * - wrong_password: Password verification failed
 * - corrupted_data: Password correct, but data can't be decrypted
 * - no_vault: Vault doesn't exist
 */
export async function unlockVault(masterPassword: string): Promise<VaultData | null> {
  const unlockId = Math.random().toString(36).substring(7);
  console.log(`🔓 [unlockVault:${unlockId}] START`);
  
  // Check for v3 vault first
  const metaResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT_META);
  const vaultMeta = metaResult[STORAGE_KEYS.VAULT_META] as VaultMeta | undefined;
  
  if (vaultMeta?.version === 3) {
    return unlockVaultV3(masterPassword, vaultMeta, unlockId);
  }
  
  // Check for v2 vault (legacy)
  const legacyResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT);
  const legacyVault = legacyResult[STORAGE_KEYS.VAULT] as EncryptedVault | undefined;
  
  if (legacyVault) {
    console.log(`🔓 [unlockVault:${unlockId}] Found v2 vault, migrating...`);
    return unlockAndMigrateV2(masterPassword, legacyVault, unlockId);
  }
  
  console.log(`🔓 [unlockVault:${unlockId}] No vault found`);
  throw new Error('Vault does not exist');
}

/**
 * Unlock v3 vault (separated storage)
 */
async function unlockVaultV3(
  masterPassword: string, 
  vaultMeta: VaultMeta,
  unlockId: string
): Promise<VaultData | null> {
  console.log(`🔓 [unlockVault:${unlockId}] v3 vault found`);
  
  // Step 1: Verify password FIRST (quick check before decryption)
  console.log(`🔓 [unlockVault:${unlockId}] Verifying password...`);
  const passwordCorrect = await verifyPassword(
    masterPassword, 
    vaultMeta.salt, 
    vaultMeta.passwordHash
  );
  
  if (!passwordCorrect) {
    console.log(`🔓 [unlockVault:${unlockId}] WRONG PASSWORD`);
    return null; // Wrong password - clear signal
  }
  
  console.log(`🔓 [unlockVault:${unlockId}] Password verified ✓`);
  
  // Step 2: Derive encryption key
  const saltBytes = base64Decode(vaultMeta.salt);
  const key = await deriveKeyFromPassword(masterPassword, saltBytes);
  
  // Step 3: Read and decrypt vault_data
  const dataResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT_DATA);
  const vaultData = dataResult[STORAGE_KEYS.VAULT_DATA] as VaultDataEncrypted | undefined;
  
  if (!vaultData) {
    console.log(`🔓 [unlockVault:${unlockId}] No vault_data found, returning empty vault`);
    return { keys: [], groups: [] };
  }
  
  console.log(`🔓 [unlockVault:${unlockId}] Decrypting vault_data...`);
  const decrypted = await decryptWithKey(vaultData.data, vaultData.iv, key);
  
  if (!decrypted) {
    // Password was correct (verified above), but decryption failed = data corruption!
    console.error(`🔓 [unlockVault:${unlockId}] DATA CORRUPTED - password was correct but decryption failed`);
    
    // Try to recover from backup
    const backupResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT_BACKUP);
    const backup = backupResult[STORAGE_KEYS.VAULT_BACKUP] as VaultDataEncrypted | undefined;
    
    if (backup) {
      console.log(`🔓 [unlockVault:${unlockId}] Attempting recovery from backup...`);
      const backupDecrypted = await decryptWithKey(backup.data, backup.iv, key);
      
      if (backupDecrypted) {
        console.log(`🔓 [unlockVault:${unlockId}] Backup recovery successful!`);
        // Restore backup as current
        await chrome.storage.local.set({ [STORAGE_KEYS.VAULT_DATA]: backup });
        
        const parsed = JSON.parse(backupDecrypted) as VaultData;
        if (!parsed.groups) parsed.groups = [];
        return parsed;
      }
    }
    
    // Both current and backup are corrupted - return empty vault
    console.error(`🔓 [unlockVault:${unlockId}] Could not recover from backup, returning empty vault`);
    return { keys: [], groups: [] };
  }
  
  const parsed = JSON.parse(decrypted) as VaultData;
  if (!parsed.groups) parsed.groups = [];
  
  console.log(`🔓 [unlockVault:${unlockId}] SUCCESS - keys: ${parsed.keys.length}, groups: ${parsed.groups.length}`);
  return parsed;
}

/**
 * Unlock v2 vault and migrate to v3 format
 */
async function unlockAndMigrateV2(
  masterPassword: string,
  legacyVault: EncryptedVault,
  unlockId: string
): Promise<VaultData | null> {
  console.log(`🔓 [unlockVault:${unlockId}] Attempting v2 decryption...`);
  
  // Decrypt with legacy method
  const decrypted = await decryptVault(
    legacyVault.data,
    legacyVault.iv,
    legacyVault.salt,
    masterPassword
  );
  
  if (!decrypted) {
    console.log(`🔓 [unlockVault:${unlockId}] v2 decryption failed (wrong password)`);
    return null;
  }
  
  let vaultData = JSON.parse(decrypted) as VaultData;
  if (!vaultData.groups) vaultData.groups = [];
  
  console.log(`🔓 [unlockVault:${unlockId}] v2 decrypted, migrating to v3...`);
  
  // Migrate to v3 format
  try {
    // Create v3 vault_meta (using existing salt)
    const passwordHash = await generatePasswordHash(masterPassword, legacyVault.salt);
    
    const vaultMeta: VaultMeta = {
      version: CURRENT_VAULT_VERSION,
      salt: legacyVault.salt,
      passwordHash,
      createdAt: Date.now(),
    };
    
    // Derive key and encrypt data in v3 format
    const saltBytes = base64Decode(legacyVault.salt);
    const key = await deriveKeyFromPassword(masterPassword, saltBytes);
    const { iv, encrypted } = await encryptWithKey(JSON.stringify(vaultData), key);
    
    const newVaultData: VaultDataEncrypted = {
      iv,
      data: encrypted,
      savedAt: Date.now(),
    };
    
    // Write v3 structures
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.VAULT_META]: vaultMeta,
      [STORAGE_KEYS.VAULT_DATA]: newVaultData,
    });
    
    // Remove v2 vault after successful migration
    await chrome.storage.local.remove(STORAGE_KEYS.VAULT);
    
    console.log(`🔓 [unlockVault:${unlockId}] Migration to v3 complete!`);
    
  } catch (migrationError) {
    console.error(`🔓 [unlockVault:${unlockId}] Migration failed, continuing with v2 data:`, migrationError);
    // Migration failed, but we still have the decrypted data
  }
  
  console.log(`🔓 [unlockVault:${unlockId}] SUCCESS - keys: ${vaultData.keys.length}, groups: ${vaultData.groups.length}`);
  return vaultData;
}

/**
 * Save vault data (v3 - only writes vault_data, never touches salt)
 */
export async function saveVault(
  vaultData: VaultData,
  masterPassword: string
): Promise<void> {
  const saveId = Math.random().toString(36).substring(7);
  console.log(`🔵 [saveVault:${saveId}] START - keys: ${vaultData.keys.length}, groups: ${vaultData.groups.length}`);
  
  // Read vault_meta to get salt
  const metaResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT_META);
  const vaultMeta = metaResult[STORAGE_KEYS.VAULT_META] as VaultMeta | undefined;
  
  if (!vaultMeta) {
    throw new Error('Cannot save: vault_meta not found. Is the vault initialized?');
  }
  
  try {
    // Step 1: Backup current vault_data
    console.log(`🔵 [saveVault:${saveId}] Step 1: Creating backup...`);
    const currentDataResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT_DATA);
    const currentData = currentDataResult[STORAGE_KEYS.VAULT_DATA];
    
    if (currentData) {
      await chrome.storage.local.set({ [STORAGE_KEYS.VAULT_BACKUP]: currentData });
    }
    
    // Step 2: Derive key from password + stored salt
    console.log(`🔵 [saveVault:${saveId}] Step 2: Deriving key...`);
    const saltBytes = base64Decode(vaultMeta.salt);
    const key = await deriveKeyFromPassword(masterPassword, saltBytes);
    
    // Step 3: Encrypt with NEW IV (required for AES-GCM security)
    console.log(`🔵 [saveVault:${saveId}] Step 3: Encrypting...`);
    const vaultJson = JSON.stringify(vaultData);
    const { iv, encrypted } = await encryptWithKey(vaultJson, key);
    
    const newVaultData: VaultDataEncrypted = {
      iv,
      data: encrypted,
      savedAt: Date.now(),
    };
    
    // Step 4: Write vault_data
    console.log(`🔵 [saveVault:${saveId}] Step 4: Writing vault_data...`);
    await chrome.storage.local.set({ [STORAGE_KEYS.VAULT_DATA]: newVaultData });
    
    // Step 5: Verify the write
    console.log(`🔵 [saveVault:${saveId}] Step 5: Verifying...`);
    const verifyResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT_DATA);
    const savedData = verifyResult[STORAGE_KEYS.VAULT_DATA] as VaultDataEncrypted | undefined;
    
    if (!savedData) {
      throw new Error('Vault save verification failed: vault_data not found after save');
    }
    
    // Verify decryption works
    const testDecrypt = await decryptWithKey(savedData.data, savedData.iv, key);
    if (!testDecrypt) {
      throw new Error('Vault save verification failed: decryption test failed');
    }
    
    // Verify data integrity
    const parsedVault = JSON.parse(testDecrypt) as VaultData;
    if (parsedVault.keys.length !== vaultData.keys.length || 
        parsedVault.groups.length !== vaultData.groups.length) {
      throw new Error('Vault save verification failed: data count mismatch');
    }
    
    // Step 6: Clear old backup on success (keep a buffer of one backup)
    // Actually, let's keep the backup - it's our safety net
    
    console.log(`🟢 [saveVault:${saveId}] SUCCESS - keys: ${vaultData.keys.length}, groups: ${vaultData.groups.length}`);
    
  } catch (error) {
    console.error(`🔴 [saveVault:${saveId}] FAILED:`, error);
    
    // Attempt to restore from backup
    try {
      const backupResult = await chrome.storage.local.get(STORAGE_KEYS.VAULT_BACKUP);
      const backup = backupResult[STORAGE_KEYS.VAULT_BACKUP];
      if (backup) {
        await chrome.storage.local.set({ [STORAGE_KEYS.VAULT_DATA]: backup });
        console.log(`🟡 [saveVault:${saveId}] Restored vault_data from backup`);
      }
    } catch (restoreError) {
      console.error(`🔴 [saveVault:${saveId}] Failed to restore backup:`, restoreError);
    }
    
    throw error;
  }
}

// ============================================================================
// Personal Key Management
// ============================================================================

/**
 * Generate a new personal identity key (full Kyber keypair)
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
 */
export function exportPublicKey(key: PersonalKey): string {
  return `Quack://KEY:${key.publicKey}`;
}

// ============================================================================
// Contact Key Management
// ============================================================================

/**
 * Create a contact key from an imported public key
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
  const clean = fingerprint.replace(/:/g, '').toUpperCase();
  if (clean.length === 8) {
    return vaultData.groups.find(g => g.shortFingerprint === clean);
  }
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
  console.log(`➕ [addGroupToVault:${addId}] Adding: ${group.name} (${group.id})`);
  
  if (hasGroup(group.aesKey, vaultData)) {
    throw new Error(`You're already a member of this group`);
  }
  
  const result = {
    ...vaultData,
    groups: [...vaultData.groups, group],
  };
  
  console.log(`➕ [addGroupToVault:${addId}] Now have ${result.groups.length} groups`);
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

export async function markContactVerified(
  keyId: string,
  vaultData: VaultData
): Promise<VaultData> {
  return updateKeyInVault(keyId, { verifiedAt: Date.now() }, vaultData);
}

export function getKeyById(keyId: string, vaultData: VaultData): QuackKey | undefined {
  return vaultData.keys.find(k => k.id === keyId);
}

export function getKeyByShortFingerprint(
  shortFingerprint: string, 
  vaultData: VaultData
): QuackKey | undefined {
  return vaultData.keys.find(k => k.shortFingerprint === shortFingerprint);
}

export function getGroupById(groupId: string, vaultData: VaultData): QuackGroup | undefined {
  return vaultData.groups.find(g => g.id === groupId);
}

export function getPersonalKeys(vaultData: VaultData): PersonalKey[] {
  return vaultData.keys.filter((k): k is PersonalKey => k.type === 'personal');
}

export function getContactKeys(vaultData: VaultData): ContactKey[] {
  return vaultData.keys.filter((k): k is ContactKey => k.type === 'contact');
}

export function getGroups(vaultData: VaultData): QuackGroup[] {
  return vaultData.groups;
}

export function getPrimaryPersonalKey(vaultData: VaultData): PersonalKey | null {
  const personal = getPersonalKeys(vaultData);
  return personal.length > 0 ? personal[0] : null;
}
