/**
 * Export/Import Tests
 * 
 * Tests the vault backup and restore functionality:
 * - Password validation
 * - Export format and encryption
 * - Decrypt and round-trip verification
 * - Import items building with conflict detection
 * - Apply import with merge logic
 */

import {
  validateExportPassword,
  exportVault,
  parseExportFile,
  decryptExportFile,
  buildImportItems,
  applyImportItems,
} from '../src/storage/export';
import type { VaultData, PersonalKey, ContactKey, QuackGroup } from '../src/types';

// ============================================================================
// Test Data Helpers
// ============================================================================

function createMockPersonalKey(name: string, fingerprint: string): PersonalKey {
  return {
    id: `personal-${name.toLowerCase()}`,
    name,
    type: 'personal',
    publicKey: 'mock-public-key-' + name,
    secretKey: 'mock-secret-key-' + name,
    fingerprint,
    shortFingerprint: fingerprint.slice(0, 11),
    createdAt: Date.now(),
  };
}

function createMockContactKey(name: string, fingerprint: string): ContactKey {
  return {
    id: `contact-${name.toLowerCase()}`,
    name,
    type: 'contact',
    publicKey: 'mock-public-key-' + name,
    fingerprint,
    shortFingerprint: fingerprint.slice(0, 11),
    createdAt: Date.now(),
  };
}

function createMockGroup(name: string, fingerprint: string, emoji?: string): QuackGroup {
  return {
    id: `group-${name.toLowerCase().replace(/\s/g, '-')}`,
    name,
    emoji,
    aesKey: 'mock-aes-key-' + name,
    fingerprint,
    shortFingerprint: fingerprint.slice(0, 8),
    createdAt: Date.now(),
  };
}

// ============================================================================
// Password Validation Tests
// ============================================================================

describe('Export Password Validation', () => {
  test('should reject passwords shorter than 20 characters', () => {
    const result = validateExportPassword('short123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('20 characters');
  });

  test('should reject passwords with special characters', () => {
    const result = validateExportPassword('validlengthpassword!@#');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('letters and numbers');
  });

  test('should reject passwords with spaces', () => {
    const result = validateExportPassword('valid length password here');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('letters and numbers');
  });

  test('should accept valid alphanumeric password (20 chars)', () => {
    const result = validateExportPassword('abcdefghij1234567890');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('should accept valid alphanumeric password (longer)', () => {
    const result = validateExportPassword('ThisIsAVeryLongPassword12345');
    expect(result.valid).toBe(true);
  });

  test('should accept all-letter password', () => {
    const result = validateExportPassword('abcdefghijklmnopqrst');
    expect(result.valid).toBe(true);
  });

  test('should accept all-number password', () => {
    const result = validateExportPassword('12345678901234567890');
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// Export Format Tests
// ============================================================================

describe('Export Vault', () => {
  const testVault: VaultData = {
    keys: [
      createMockPersonalKey('Alice', 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55'),
      createMockContactKey('Bob', 'FF:EE:DD:CC:BB:AA:99:88:77:66:55:44'),
    ],
    groups: [
      createMockGroup('Friends', 'AABBCCDD', '👥'),
      createMockGroup('Work', 'EEFF0011', '💼'),
    ],
  };

  const validPassword = 'TestExportPassword123';

  test('should reject invalid password', async () => {
    await expect(exportVault(testVault, 'short')).rejects.toThrow('20 characters');
  });

  test('should produce valid export format', async () => {
    const exported = await exportVault(testVault, validPassword);

    expect(exported.quackVersion).toBe('0.1.0');
    expect(exported.encrypted).toBe(true);
    expect(typeof exported.exportedAt).toBe('number');
    expect(exported.exportedAt).toBeGreaterThan(0);
    expect(typeof exported.salt).toBe('string');
    expect(typeof exported.iv).toBe('string');
    expect(typeof exported.data).toBe('string');
    
    // Salt and IV should be base64
    expect(exported.salt.length).toBeGreaterThan(0);
    expect(exported.iv.length).toBeGreaterThan(0);
    expect(exported.data.length).toBeGreaterThan(0);
  });

  test('should produce different output for same input (random IV/salt)', async () => {
    const exported1 = await exportVault(testVault, validPassword);
    const exported2 = await exportVault(testVault, validPassword);

    // Salt and IV should be different
    expect(exported1.salt).not.toBe(exported2.salt);
    expect(exported1.iv).not.toBe(exported2.iv);
    // Encrypted data should be different due to different IV
    expect(exported1.data).not.toBe(exported2.data);
  });
});

// ============================================================================
// Parse Export File Tests
// ============================================================================

describe('Parse Export File', () => {
  test('should parse valid export JSON', () => {
    const validJson = JSON.stringify({
      quackVersion: '0.1.0',
      exportedAt: 1234567890,
      encrypted: true,
      salt: 'abc123',
      iv: 'def456',
      data: 'encrypted-data',
    });

    const parsed = parseExportFile(validJson);
    expect(parsed).not.toBeNull();
    expect(parsed?.quackVersion).toBe('0.1.0');
  });

  test('should reject invalid JSON', () => {
    const result = parseExportFile('not valid json {{{');
    expect(result).toBeNull();
  });

  test('should reject missing quackVersion', () => {
    const json = JSON.stringify({
      exportedAt: 1234567890,
      encrypted: true,
      salt: 'abc',
      iv: 'def',
      data: 'ghi',
    });
    expect(parseExportFile(json)).toBeNull();
  });

  test('should reject encrypted: false', () => {
    const json = JSON.stringify({
      quackVersion: '0.1.0',
      exportedAt: 1234567890,
      encrypted: false,
      salt: 'abc',
      iv: 'def',
      data: 'ghi',
    });
    expect(parseExportFile(json)).toBeNull();
  });

  test('should reject missing fields', () => {
    const json = JSON.stringify({
      quackVersion: '0.1.0',
      exportedAt: 1234567890,
      encrypted: true,
      // missing salt, iv, data
    });
    expect(parseExportFile(json)).toBeNull();
  });
});

// ============================================================================
// Round-Trip Tests (Export → Decrypt → Compare)
// ============================================================================

describe('Export/Import Round-Trip', () => {
  const originalVault: VaultData = {
    keys: [
      createMockPersonalKey('Alice', 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55'),
      createMockPersonalKey('Work Identity', '11:22:33:44:55:66:77:88:99:AA:BB:CC'),
      createMockContactKey('Bob', 'FF:EE:DD:CC:BB:AA:99:88:77:66:55:44'),
      createMockContactKey('Charlie', '00:11:22:33:44:55:66:77:88:99:AA:BB'),
    ],
    groups: [
      createMockGroup('Friends', 'AABBCCDD', '👥'),
      createMockGroup('Work Team', 'EEFF0011', '💼'),
      createMockGroup('Family', '11223344', '🏠'),
    ],
  };

  const password = 'SecureTestPassword123';

  test('should round-trip vault data correctly', async () => {
    // Export
    const exported = await exportVault(originalVault, password);
    
    // Decrypt
    const decrypted = await decryptExportFile(exported, password);
    
    // Compare
    expect(decrypted).not.toBeNull();
    expect(decrypted!.keys.length).toBe(originalVault.keys.length);
    expect(decrypted!.groups.length).toBe(originalVault.groups.length);

    // Check keys match
    for (let i = 0; i < originalVault.keys.length; i++) {
      expect(decrypted!.keys[i].id).toBe(originalVault.keys[i].id);
      expect(decrypted!.keys[i].name).toBe(originalVault.keys[i].name);
      expect(decrypted!.keys[i].type).toBe(originalVault.keys[i].type);
      expect(decrypted!.keys[i].fingerprint).toBe(originalVault.keys[i].fingerprint);
    }

    // Check groups match
    for (let i = 0; i < originalVault.groups.length; i++) {
      expect(decrypted!.groups[i].id).toBe(originalVault.groups[i].id);
      expect(decrypted!.groups[i].name).toBe(originalVault.groups[i].name);
      expect(decrypted!.groups[i].aesKey).toBe(originalVault.groups[i].aesKey);
      expect(decrypted!.groups[i].emoji).toBe(originalVault.groups[i].emoji);
    }
  });

  test('should fail decryption with wrong password', async () => {
    const exported = await exportVault(originalVault, password);
    const decrypted = await decryptExportFile(exported, 'WrongPassword1234567');
    expect(decrypted).toBeNull();
  });

  test('should handle empty vault', async () => {
    const emptyVault: VaultData = { keys: [], groups: [] };
    const exported = await exportVault(emptyVault, password);
    const decrypted = await decryptExportFile(exported, password);
    
    expect(decrypted).not.toBeNull();
    expect(decrypted!.keys).toEqual([]);
    expect(decrypted!.groups).toEqual([]);
  });
});

// ============================================================================
// Build Import Items Tests
// ============================================================================

describe('Build Import Items', () => {
  const importedVault: VaultData = {
    keys: [
      createMockPersonalKey('Alice', 'FINGERPRINT-ALICE'),
      createMockContactKey('Bob', 'FINGERPRINT-BOB'),
    ],
    groups: [
      createMockGroup('Friends', 'FP-FRIENDS', '👥'),
    ],
  };

  test('should build items with no conflicts (fresh install)', () => {
    const items = buildImportItems(importedVault, null);
    
    expect(items.length).toBe(3);
    expect(items.every(item => item.selected)).toBe(true);
    expect(items.every(item => !item.hasConflict)).toBe(true);
    
    // Check types
    expect(items[0].type).toBe('personal');
    expect(items[1].type).toBe('contact');
    expect(items[2].type).toBe('group');
  });

  test('should detect key conflicts', () => {
    const existingVault: VaultData = {
      keys: [
        createMockPersonalKey('Old Alice', 'FINGERPRINT-ALICE'), // Same fingerprint!
      ],
      groups: [],
    };

    const items = buildImportItems(importedVault, existingVault);
    
    const aliceItem = items.find(i => i.name === 'Alice');
    expect(aliceItem?.hasConflict).toBe(true);
    expect(aliceItem?.conflictName).toBe('Old Alice');
    
    const bobItem = items.find(i => i.name === 'Bob');
    expect(bobItem?.hasConflict).toBe(false);
  });

  test('should detect group conflicts', () => {
    const existingVault: VaultData = {
      keys: [],
      groups: [
        createMockGroup('Old Friends', 'FP-FRIENDS', '🎉'), // Same fingerprint!
      ],
    };

    const items = buildImportItems(importedVault, existingVault);
    
    const groupItem = items.find(i => i.type === 'group');
    expect(groupItem?.hasConflict).toBe(true);
    expect(groupItem?.conflictName).toBe('Old Friends');
  });

  test('should include emoji for groups', () => {
    const items = buildImportItems(importedVault, null);
    
    const groupItem = items.find(i => i.type === 'group');
    expect(groupItem?.emoji).toBe('👥');
  });
});

// ============================================================================
// Apply Import Items Tests
// ============================================================================

describe('Apply Import Items', () => {
  test('should apply selected items to empty vault', () => {
    const items = [
      {
        id: 'key-1',
        type: 'personal' as const,
        name: 'Alice',
        fingerprint: 'FP-ALICE',
        shortFingerprint: 'FP-ALICE',
        hasConflict: false,
        selected: true,
        data: createMockPersonalKey('Alice', 'FP-ALICE'),
      },
      {
        id: 'key-2',
        type: 'contact' as const,
        name: 'Bob',
        fingerprint: 'FP-BOB',
        shortFingerprint: 'FP-BOB',
        hasConflict: false,
        selected: false, // Not selected
        data: createMockContactKey('Bob', 'FP-BOB'),
      },
    ];

    const result = applyImportItems(items, null);
    
    expect(result.keys.length).toBe(1);
    expect(result.keys[0].name).toBe('Alice');
  });

  test('should merge items into existing vault', () => {
    const existingVault: VaultData = {
      keys: [createMockContactKey('Charlie', 'FP-CHARLIE')],
      groups: [createMockGroup('Work', 'FP-WORK', '💼')],
    };

    const items = [
      {
        id: 'key-1',
        type: 'personal' as const,
        name: 'Alice',
        fingerprint: 'FP-ALICE',
        shortFingerprint: 'FP-ALICE',
        hasConflict: false,
        selected: true,
        data: createMockPersonalKey('Alice', 'FP-ALICE'),
      },
    ];

    const result = applyImportItems(items, existingVault);
    
    expect(result.keys.length).toBe(2); // Charlie + Alice
    expect(result.groups.length).toBe(1); // Work
    expect(result.keys.some(k => k.name === 'Charlie')).toBe(true);
    expect(result.keys.some(k => k.name === 'Alice')).toBe(true);
  });

  test('should replace conflicting items when selected', () => {
    const existingVault: VaultData = {
      keys: [createMockPersonalKey('Old Alice', 'FP-ALICE')],
      groups: [],
    };

    const newAlice = createMockPersonalKey('New Alice', 'FP-ALICE');
    const items = [
      {
        id: 'key-1',
        type: 'personal' as const,
        name: 'New Alice',
        fingerprint: 'FP-ALICE',
        shortFingerprint: 'FP-ALICE',
        hasConflict: true,
        conflictName: 'Old Alice',
        selected: true, // Selected = replace
        data: newAlice,
      },
    ];

    const result = applyImportItems(items, existingVault);
    
    expect(result.keys.length).toBe(1);
    expect(result.keys[0].name).toBe('New Alice');
  });

  test('should keep existing items when conflict not selected', () => {
    const existingVault: VaultData = {
      keys: [createMockPersonalKey('Old Alice', 'FP-ALICE')],
      groups: [],
    };

    const newAlice = createMockPersonalKey('New Alice', 'FP-ALICE');
    const items = [
      {
        id: 'key-1',
        type: 'personal' as const,
        name: 'New Alice',
        fingerprint: 'FP-ALICE',
        shortFingerprint: 'FP-ALICE',
        hasConflict: true,
        conflictName: 'Old Alice',
        selected: false, // Not selected = skip, keep existing
        data: newAlice,
      },
    ];

    const result = applyImportItems(items, existingVault);
    
    expect(result.keys.length).toBe(1);
    expect(result.keys[0].name).toBe('Old Alice'); // Kept the old one
  });

  test('should handle group conflicts', () => {
    const existingVault: VaultData = {
      keys: [],
      groups: [createMockGroup('Old Friends', 'FP-FRIENDS', '🎉')],
    };

    const newGroup = createMockGroup('New Friends', 'FP-FRIENDS', '👥');
    const items = [
      {
        id: 'group-1',
        type: 'group' as const,
        name: 'New Friends',
        fingerprint: 'FP-FRIENDS',
        shortFingerprint: 'FP-FRIEN',
        emoji: '👥',
        hasConflict: true,
        conflictName: 'Old Friends',
        selected: true,
        data: newGroup,
      },
    ];

    const result = applyImportItems(items, existingVault);
    
    expect(result.groups.length).toBe(1);
    expect(result.groups[0].name).toBe('New Friends');
    expect(result.groups[0].emoji).toBe('👥');
  });
});
