/**
 * Quack - Vault Export/Import
 * 
 * Handles full vault backup and restore:
 * - Export: Encrypts vault with a separate export password
 * - Import: Decrypts and allows selective merge or fresh install
 */

import type { 
  VaultData, 
  ExportedVault, 
  ImportItem,
  QuackKey,
  QuackGroup
} from '@/types';
import { isPersonalKey } from '@/types';
import { encryptVault, decryptVault } from '@/crypto/pbkdf2';

// App version for exports (should match package.json)
const QUACK_VERSION = '0.1.0';

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate export password requirements:
 * - Alphanumeric characters only
 * - Minimum 20 characters
 */
export function validateExportPassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 20) {
    return { valid: false, error: 'Password must be at least 20 characters' };
  }
  
  if (!/^[A-Za-z0-9]+$/.test(password)) {
    return { valid: false, error: 'Password must contain only letters and numbers' };
  }
  
  return { valid: true };
}

// ============================================================================
// Export
// ============================================================================

/**
 * Export vault to encrypted JSON file
 */
export async function exportVault(
  vaultData: VaultData,
  exportPassword: string
): Promise<ExportedVault> {
  // Validate password
  const validation = validateExportPassword(exportPassword);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  // Serialize vault data
  const vaultJson = JSON.stringify(vaultData);
  
  // Encrypt with export password
  const { salt, iv, encrypted } = await encryptVault(vaultJson, exportPassword);
  
  return {
    quackVersion: QUACK_VERSION,
    exportedAt: Date.now(),
    encrypted: true,
    salt,
    iv,
    data: encrypted,
  };
}

/**
 * Trigger browser download of export file
 */
export function downloadExportFile(exportData: ExportedVault): void {
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `quack-backup-${timestamp}.json`;
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// Import
// ============================================================================

/**
 * Parse and validate an export file
 */
export function parseExportFile(fileContents: string): ExportedVault | null {
  try {
    const data = JSON.parse(fileContents);
    
    // Validate structure
    if (
      typeof data.quackVersion !== 'string' ||
      typeof data.exportedAt !== 'number' ||
      data.encrypted !== true ||
      typeof data.salt !== 'string' ||
      typeof data.iv !== 'string' ||
      typeof data.data !== 'string'
    ) {
      return null;
    }
    
    return data as ExportedVault;
  } catch {
    return null;
  }
}

/**
 * Decrypt an export file with the export password
 */
export async function decryptExportFile(
  exportData: ExportedVault,
  exportPassword: string
): Promise<VaultData | null> {
  const decrypted = await decryptVault(
    exportData.data,
    exportData.iv,
    exportData.salt,
    exportPassword
  );
  
  if (!decrypted) {
    return null; // Wrong password
  }
  
  try {
    const vaultData = JSON.parse(decrypted) as VaultData;
    
    // Ensure arrays exist
    if (!Array.isArray(vaultData.keys)) {
      vaultData.keys = [];
    }
    if (!Array.isArray(vaultData.groups)) {
      vaultData.groups = [];
    }
    
    return vaultData;
  } catch {
    return null; // Corrupted data
  }
}

/**
 * Build import items list with conflict detection
 */
export function buildImportItems(
  importedVault: VaultData,
  existingVault: VaultData | null
): ImportItem[] {
  const items: ImportItem[] = [];
  
  // Process keys (personal and contact)
  for (const key of importedVault.keys) {
    const existingKey = existingVault?.keys.find(k => k.fingerprint === key.fingerprint);
    
    items.push({
      id: key.id,
      type: isPersonalKey(key) ? 'personal' : 'contact',
      name: key.name,
      fingerprint: key.fingerprint,
      shortFingerprint: key.shortFingerprint,
      hasConflict: !!existingKey,
      conflictName: existingKey?.name,
      selected: true, // Default to selected
      data: key,
    });
  }
  
  // Process groups
  for (const group of importedVault.groups) {
    const existingGroup = existingVault?.groups.find(g => g.fingerprint === group.fingerprint);
    
    items.push({
      id: group.id,
      type: 'group',
      name: group.name,
      fingerprint: group.fingerprint,
      shortFingerprint: group.shortFingerprint,
      emoji: group.emoji,
      hasConflict: !!existingGroup,
      conflictName: existingGroup?.name,
      selected: true, // Default to selected
      data: group,
    });
  }
  
  return items;
}

/**
 * Apply selected import items to vault
 * - For fresh install: Returns new vault with selected items
 * - For merge: Returns existing vault with selected items added/replaced
 */
export function applyImportItems(
  items: ImportItem[],
  existingVault: VaultData | null
): VaultData {
  const selectedItems = items.filter(item => item.selected);
  
  // Start with existing vault or empty
  const vault: VaultData = existingVault 
    ? { keys: [...existingVault.keys], groups: [...existingVault.groups] }
    : { keys: [], groups: [] };
  
  for (const item of selectedItems) {
    if (item.type === 'personal' || item.type === 'contact') {
      const key = item.data as QuackKey;
      
      if (item.hasConflict) {
        // Replace existing key with same fingerprint
        vault.keys = vault.keys.filter(k => k.fingerprint !== key.fingerprint);
      }
      
      vault.keys.push(key);
    } else if (item.type === 'group') {
      const group = item.data as QuackGroup;
      
      if (item.hasConflict) {
        // Replace existing group with same fingerprint
        vault.groups = vault.groups.filter(g => g.fingerprint !== group.fingerprint);
      }
      
      vault.groups.push(group);
    }
  }
  
  return vault;
}

/**
 * Read file as text (helper for file input)
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
