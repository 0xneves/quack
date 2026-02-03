/**
 * Quack - Vault Storage Management
 */

import type { 
  QuackKey, 
  PersonalKey, 
  ContactKey, 
  VaultData, 
  EncryptedVault
} from '@/types';
import { encryptVault, decryptVault } from '@/crypto/pbkdf2';
import { 
  generateKyberKeyPair, 
  generateFingerprint, 
  generateShortFingerprint,
  isValidPublicKey
} from '@/crypto/kyber';
import { generateUUID } from '@/utils/helpers';
import { STORAGE_KEYS } from '@/utils/constants';

// Re-export type guards for convenience
export { isPersonalKey, isContactKey } from '@/types';

const CURRENT_VAULT_VERSION = 2;

/**
 * Initialize a new vault with master password
 */
export async function createVault(masterPassword: string): Promise<void> {
  const emptyVault: VaultData = {
    keys: [],
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
  
  // Migrate from v1 if necessary
  if (vault.version === 1) {
    vaultData = await migrateVaultV1ToV2(vaultData);
  }
  
  return vaultData;
}

/**
 * Migrate vault from v1 (legacy) to v2 (new Kyber format)
 * Legacy keys are removed - users need to create new keys
 */
async function migrateVaultV1ToV2(_oldVault: VaultData): Promise<VaultData> {
  // Legacy keys had random bytes, not real Kyber keys
  // We can't migrate them - just return empty vault
  console.warn('Migrating vault from v1 to v2. Legacy keys will be removed.');
  return { keys: [] };
}

/**
 * Save vault data (re-encrypt with existing password state)
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
 * Export a personal key for sharing (public key only)
 * Returns: Quack://KEY:[base64_public_key]
 */
export function exportPublicKey(key: PersonalKey): string {
  return `Quack://KEY:${key.publicKey}`;
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

/**
 * Add key to vault
 */
export async function addKeyToVault(
  key: QuackKey,
  vaultData: VaultData
): Promise<VaultData> {
  // Check for duplicate fingerprints
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
 * Get the primary personal key (first one, or null if none)
 */
export function getPrimaryPersonalKey(vaultData: VaultData): PersonalKey | null {
  const personal = getPersonalKeys(vaultData);
  return personal.length > 0 ? personal[0] : null;
}
