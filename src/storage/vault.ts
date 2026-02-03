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

// ============================================================================
// Vault Lifecycle
// ============================================================================

/**
 * Initialize a new vault with master password
 */
export async function createVault(masterPassword: string): Promise<void> {
  const emptyVault: VaultData = {
    keys: [],
    groups: [],
  };
  
  const vaultJson = JSON.stringify(emptyVault);
  const { salt, iv, encrypted } = await encryptVault(vaultJson, masterPassword);
  
  const encryptedVault: EncryptedVault = {
    version: CURRENT_VAULT_VERSION,
    salt,
    iv,
    data: encrypted,
  };
  
  await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: encryptedVault });
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
  const result = await chrome.storage.local.get(STORAGE_KEYS.VAULT);
  const vault = result[STORAGE_KEYS.VAULT] as EncryptedVault | undefined;
  
  if (!vault) {
    throw new Error('Vault does not exist');
  }
  
  const decrypted = await decryptVault(
    vault.data,
    vault.iv,
    vault.salt,
    masterPassword
  );
  
  if (!decrypted) {
    return null; // Wrong password
  }
  
  let vaultData = JSON.parse(decrypted) as VaultData;
  
  // Ensure groups array exists (migration from older versions)
  if (!vaultData.groups) {
    vaultData.groups = [];
  }
  
  // Migrate from v1 if necessary
  if (vault.version === 1) {
    vaultData = await migrateVaultV1ToV2(vaultData);
  }
  
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
 */
export async function saveVault(
  vaultData: VaultData,
  masterPassword: string
): Promise<void> {
  const vaultJson = JSON.stringify(vaultData);
  const { salt, iv, encrypted } = await encryptVault(vaultJson, masterPassword);
  
  const encryptedVault: EncryptedVault = {
    version: CURRENT_VAULT_VERSION,
    salt,
    iv,
    data: encrypted,
  };
  
  await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: encryptedVault });
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
  // Check for duplicate (same AES key)
  if (hasGroup(group.aesKey, vaultData)) {
    throw new Error(`You're already a member of this group`);
  }
  
  return {
    ...vaultData,
    groups: [...vaultData.groups, group],
  };
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
