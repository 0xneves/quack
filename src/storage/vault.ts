/**
 * Quack - Vault Storage Management
 */

import type { QuackKey, VaultData, EncryptedVault } from '@/types';
import { encryptVault, decryptVault } from '@/crypto/pbkdf2';
import { generateAESKey, exportAESKey, importAESKey } from '@/crypto/aes';
import { generateKyberKeyPair } from '@/crypto/kyber';
import { generateUUID } from '@/utils/helpers';
import { STORAGE_KEYS } from '@/utils/constants';

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
    version: 1,
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
  
  return JSON.parse(decrypted) as VaultData;
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
    version: 1,
    salt,
    iv,
    data: encrypted,
  };
  
  await chrome.storage.local.set({ [STORAGE_KEYS.VAULT]: encryptedVault });
}

/**
 * Generate a new encryption key
 */
export async function generateKey(name: string): Promise<QuackKey> {
  const { publicKey, privateKey } = await generateKyberKeyPair();
  const aesKey = await generateAESKey();
  const aesKeyMaterial = await exportAESKey(aesKey);
  
  return {
    id: generateUUID(),
    name,
    publicKey,
    privateKey,
    aesKeyMaterial,
    createdAt: Date.now(),
  };
}

/**
 * Add key to vault
 */
export async function addKeyToVault(
  key: QuackKey,
  vaultData: VaultData
): Promise<VaultData> {
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
  updates: Partial<QuackKey>,
  vaultData: VaultData
): Promise<VaultData> {
  return {
    ...vaultData,
    keys: vaultData.keys.map(k => 
      k.id === keyId ? { ...k, ...updates } : k
    ),
  };
}

/**
 * Get key by ID
 */
export function getKeyById(keyId: string, vaultData: VaultData): QuackKey | undefined {
  return vaultData.keys.find(k => k.id === keyId);
}

/**
 * Get all CryptoKey objects for decryption
 */
export async function getDecryptionKeys(
  vaultData: VaultData
): Promise<Array<{ id: string; name: string; aesKey: CryptoKey }>> {
  const keys = await Promise.all(
    vaultData.keys.map(async (key) => ({
      id: key.id,
      name: key.name,
      aesKey: await importAESKey(key.aesKeyMaterial),
    }))
  );
  return keys;
}

