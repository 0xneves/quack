/**
 * Quack - End-to-End Crypto Tests
 * 
 * Tests the complete encryption flow:
 * 1. Generate keys for Alice and Bob
 * 2. Alice creates a group
 * 3. Alice invites Bob
 * 4. Bob accepts the invitation
 * 5. Alice encrypts a message to the group
 * 6. Bob decrypts the message
 * 
 * This proves the entire crypto chain works correctly.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import {
  generateKyberKeyPair,
  generateFingerprint,
  generateShortFingerprint,
  encapsulate,
  decapsulate,
  verifyKyberKeyPair,
  isValidPublicKey,
  isValidSecretKey,
  KYBER_PUBLIC_KEY_BYTES,
  KYBER_SECRET_KEY_BYTES,
  KYBER_CIPHERTEXT_BYTES,
  KYBER_SHARED_SECRET_BYTES,
} from '@/crypto/kyber';
import {
  generateGroupKey,
  generateGroupFingerprint,
  generateGroupShortFingerprint,
  encryptGroupMessage,
  decryptGroupMessage,
  parseGroupMessage,
  decryptWithGroups,
  createGroupInvitation,
  parseInvitation,
  acceptInvitation,
  isGroupMessage,
  isInvitation,
} from '@/crypto/group';
import { base64Decode } from '@/utils/helpers';
import type { PersonalKey, ContactKey, QuackGroup } from '@/types';

describe('Quack Crypto E2E Tests', () => {
  // ============================================================================
  // AES-256-GCM Tests
  // ============================================================================
  
  describe('AES-256-GCM Group Encryption', () => {
    test('should generate a 256-bit AES key', async () => {
      const key = await generateGroupKey();
      const decoded = base64Decode(key);
      
      expect(decoded.length).toBe(32); // 256 bits = 32 bytes
    });
    
    test('should generate consistent fingerprints for same key', async () => {
      const key = await generateGroupKey();
      const fp1 = await generateGroupFingerprint(key);
      const fp2 = await generateGroupFingerprint(key);
      
      expect(fp1).toBe(fp2);
      expect(fp1.length).toBe(47); // 16 bytes as hex with colons
      expect(fp1).toMatch(/^([A-F0-9]{2}:){15}[A-F0-9]{2}$/);
    });
    
    test('should generate different fingerprints for different keys', async () => {
      const key1 = await generateGroupKey();
      const key2 = await generateGroupKey();
      const fp1 = await generateGroupFingerprint(key1);
      const fp2 = await generateGroupFingerprint(key2);
      
      expect(fp1).not.toBe(fp2);
    });
    
    test('should generate 8-char short fingerprints', async () => {
      const key = await generateGroupKey();
      const shortFp = await generateGroupShortFingerprint(key);
      
      expect(shortFp.length).toBe(8);
      expect(shortFp).toMatch(/^[A-F0-9]{8}$/);
    });
  });
  
  // ============================================================================
  // ML-KEM-768 (Kyber) Tests
  // ============================================================================
  
  describe('ML-KEM-768 (Kyber) Post-Quantum Cryptography', () => {
    test('should generate valid key pair with correct sizes', async () => {
      const keyPair = await generateKyberKeyPair();
      
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.secretKey).toBeDefined();
      
      const pubDecoded = base64Decode(keyPair.publicKey);
      const secDecoded = base64Decode(keyPair.secretKey);
      
      expect(pubDecoded.length).toBe(KYBER_PUBLIC_KEY_BYTES);  // 1184
      expect(secDecoded.length).toBe(KYBER_SECRET_KEY_BYTES);  // 2400
    });
    
    test('should validate public key format', async () => {
      const keyPair = await generateKyberKeyPair();
      
      expect(isValidPublicKey(keyPair.publicKey)).toBe(true);
      expect(isValidPublicKey('invalid')).toBe(false);
      expect(isValidPublicKey('')).toBe(false);
    });
    
    test('should validate secret key format', async () => {
      const keyPair = await generateKyberKeyPair();
      
      expect(isValidSecretKey(keyPair.secretKey)).toBe(true);
      expect(isValidSecretKey('invalid')).toBe(false);
      expect(isValidSecretKey('')).toBe(false);
    });
    
    test('should generate consistent fingerprints', async () => {
      const keyPair = await generateKyberKeyPair();
      const fp1 = await generateFingerprint(keyPair.publicKey);
      const fp2 = await generateFingerprint(keyPair.publicKey);
      
      expect(fp1).toBe(fp2);
      expect(fp1.length).toBe(47);
    });
    
    test('should generate 11-char short fingerprints with colons', async () => {
      const keyPair = await generateKyberKeyPair();
      const shortFp = await generateShortFingerprint(keyPair.publicKey);
      
      expect(shortFp.length).toBe(11); // "XX:XX:XX:XX"
      expect(shortFp).toMatch(/^[A-F0-9]{2}:[A-F0-9]{2}:[A-F0-9]{2}:[A-F0-9]{2}$/);
    });
    
    test('should encapsulate and produce valid ciphertext', async () => {
      const keyPair = await generateKyberKeyPair();
      const { ciphertext, sharedSecret } = await encapsulate(keyPair.publicKey);
      
      const ctDecoded = base64Decode(ciphertext);
      const ssDecoded = base64Decode(sharedSecret);
      
      expect(ctDecoded.length).toBe(KYBER_CIPHERTEXT_BYTES);  // 1088
      expect(ssDecoded.length).toBe(KYBER_SHARED_SECRET_BYTES); // 32
    });
    
    test('should decapsulate and recover same shared secret', async () => {
      const keyPair = await generateKyberKeyPair();
      
      // Encapsulate with public key
      const { ciphertext, sharedSecret: ssEncap } = await encapsulate(keyPair.publicKey);
      
      // Decapsulate with secret key
      const ssDecap = await decapsulate(keyPair.secretKey, ciphertext);
      
      // Shared secrets must match!
      expect(ssDecap).toBe(ssEncap);
    });
    
    test('should verify valid key pair', async () => {
      const keyPair = await generateKyberKeyPair();
      const isValid = await verifyKyberKeyPair(keyPair.publicKey, keyPair.secretKey);
      
      expect(isValid).toBe(true);
    });
    
    test('should reject mismatched key pair', async () => {
      const keyPair1 = await generateKyberKeyPair();
      const keyPair2 = await generateKyberKeyPair();
      
      // Mix keys from different pairs
      const isValid = await verifyKyberKeyPair(keyPair1.publicKey, keyPair2.secretKey);
      
      expect(isValid).toBe(false);
    });
    
    test('should fail to decapsulate with wrong secret key', async () => {
      const keyPair1 = await generateKyberKeyPair();
      const keyPair2 = await generateKyberKeyPair();
      
      const { ciphertext, sharedSecret: ssEncap } = await encapsulate(keyPair1.publicKey);
      
      // Try to decapsulate with wrong key - shared secrets should NOT match
      const ssDecap = await decapsulate(keyPair2.secretKey, ciphertext);
      
      expect(ssDecap).not.toBe(ssEncap);
    });
  });
  
  // ============================================================================
  // Group Message Encryption Tests
  // ============================================================================
  
  describe('Group Message Encryption', () => {
    let testGroup: QuackGroup;
    
    beforeAll(async () => {
      const aesKey = await generateGroupKey();
      testGroup = {
        id: 'test-group-id',
        name: 'Test Group',
        aesKey,
        fingerprint: await generateGroupFingerprint(aesKey),
        shortFingerprint: await generateGroupShortFingerprint(aesKey),
        createdAt: Date.now(),
      };
    });
    
    test('should encrypt message in correct format', async () => {
      const plaintext = 'Hello, this is a secret message!';
      const encrypted = await encryptGroupMessage(plaintext, testGroup);
      
      expect(encrypted.startsWith('Quack://')).toBe(true);
      expect(isGroupMessage(encrypted)).toBe(true);
      
      // Format: Quack://[8-char-fp]:[iv-base64]:[ciphertext-base64]
      const parts = encrypted.split(':');
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe('Quack');
      expect(parts[1].replace('//', '')).toBe(testGroup.shortFingerprint);
    });
    
    test('should parse group message correctly', async () => {
      const plaintext = 'Test message';
      const encrypted = await encryptGroupMessage(plaintext, testGroup);
      const parsed = parseGroupMessage(encrypted);
      
      expect(parsed).not.toBeNull();
      expect(parsed!.groupFingerprint).toBe(testGroup.shortFingerprint);
      expect(parsed!.iv).toBeDefined();
      expect(parsed!.ciphertext).toBeDefined();
    });
    
    test('should decrypt message correctly', async () => {
      const plaintext = 'The quick brown fox jumps over the lazy dog.';
      const encrypted = await encryptGroupMessage(plaintext, testGroup);
      const parsed = parseGroupMessage(encrypted);
      
      expect(parsed).not.toBeNull();
      
      const decrypted = await decryptGroupMessage(parsed!, testGroup);
      expect(decrypted).toBe(plaintext);
    });
    
    test('should handle unicode in messages', async () => {
      const plaintext = '🦆 Quack! 日本語テスト émojis hélas! 中文测试';
      const encrypted = await encryptGroupMessage(plaintext, testGroup);
      const parsed = parseGroupMessage(encrypted);
      const decrypted = await decryptGroupMessage(parsed!, testGroup);
      
      expect(decrypted).toBe(plaintext);
    });
    
    test('should handle empty string', async () => {
      const plaintext = '';
      const encrypted = await encryptGroupMessage(plaintext, testGroup);
      const parsed = parseGroupMessage(encrypted);
      const decrypted = await decryptGroupMessage(parsed!, testGroup);
      
      expect(decrypted).toBe(plaintext);
    });
    
    test('should handle very long messages', async () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = await encryptGroupMessage(plaintext, testGroup);
      const parsed = parseGroupMessage(encrypted);
      const decrypted = await decryptGroupMessage(parsed!, testGroup);
      
      expect(decrypted).toBe(plaintext);
    });
    
    test('should fail to decrypt with wrong group', async () => {
      const aesKey2 = await generateGroupKey();
      const wrongGroup: QuackGroup = {
        id: 'wrong-group',
        name: 'Wrong Group',
        aesKey: aesKey2,
        fingerprint: await generateGroupFingerprint(aesKey2),
        shortFingerprint: await generateGroupShortFingerprint(aesKey2),
        createdAt: Date.now(),
      };
      
      const plaintext = 'Secret message';
      const encrypted = await encryptGroupMessage(plaintext, testGroup);
      const parsed = parseGroupMessage(encrypted);
      
      // Fingerprint won't match, should return null
      const decrypted = await decryptGroupMessage(parsed!, wrongGroup);
      expect(decrypted).toBeNull();
    });
    
    test('should find correct group with decryptWithGroups', async () => {
      const aesKey2 = await generateGroupKey();
      const group2: QuackGroup = {
        id: 'group-2',
        name: 'Group 2',
        aesKey: aesKey2,
        fingerprint: await generateGroupFingerprint(aesKey2),
        shortFingerprint: await generateGroupShortFingerprint(aesKey2),
        createdAt: Date.now(),
      };
      
      const groups = [testGroup, group2];
      
      // Encrypt with testGroup
      const plaintext = 'Find me!';
      const encrypted = await encryptGroupMessage(plaintext, testGroup);
      
      const result = await decryptWithGroups(encrypted, groups);
      
      expect(result).not.toBeNull();
      expect(result!.plaintext).toBe(plaintext);
      expect(result!.group.id).toBe(testGroup.id);
    });
  });
  
  // ============================================================================
  // Group Invitation Tests
  // ============================================================================
  
  describe('Group Invitations (Kyber Key Exchange)', () => {
    let aliceKeys: { publicKey: string; secretKey: string };
    let bobKeys: { publicKey: string; secretKey: string };
    let alicePersonal: PersonalKey;
    let bobPersonal: PersonalKey;
    let bobAsContact: ContactKey;
    let testGroup: QuackGroup;
    
    beforeAll(async () => {
      // Generate keys for Alice and Bob
      aliceKeys = await generateKyberKeyPair();
      bobKeys = await generateKyberKeyPair();
      
      // Create PersonalKey for Alice
      alicePersonal = {
        id: 'alice-key-id',
        name: 'Alice',
        type: 'personal',
        publicKey: aliceKeys.publicKey,
        secretKey: aliceKeys.secretKey,
        fingerprint: await generateFingerprint(aliceKeys.publicKey),
        shortFingerprint: await generateShortFingerprint(aliceKeys.publicKey),
        createdAt: Date.now(),
      };
      
      // Create PersonalKey for Bob
      bobPersonal = {
        id: 'bob-key-id',
        name: 'Bob',
        type: 'personal',
        publicKey: bobKeys.publicKey,
        secretKey: bobKeys.secretKey,
        fingerprint: await generateFingerprint(bobKeys.publicKey),
        shortFingerprint: await generateShortFingerprint(bobKeys.publicKey),
        createdAt: Date.now(),
      };
      
      // Bob as a contact (Alice's view of Bob)
      bobAsContact = {
        id: 'bob-contact-id',
        name: 'Bob',
        type: 'contact',
        publicKey: bobKeys.publicKey,
        fingerprint: await generateFingerprint(bobKeys.publicKey),
        shortFingerprint: await generateShortFingerprint(bobKeys.publicKey),
        createdAt: Date.now(),
      };
      
      // Create a test group
      const aesKey = await generateGroupKey();
      testGroup = {
        id: 'test-group-id',
        name: 'Secret Club',
        emoji: '🦆',
        aesKey,
        fingerprint: await generateGroupFingerprint(aesKey),
        shortFingerprint: await generateGroupShortFingerprint(aesKey),
        createdAt: Date.now(),
      };
    });
    
    test('should create invitation in correct format', async () => {
      const invitation = await createGroupInvitation(
        testGroup,
        bobAsContact,
        alicePersonal.shortFingerprint,
        'Welcome to the club!'
      );
      
      expect(invitation.startsWith('Quack://INV:')).toBe(true);
      expect(isInvitation(invitation)).toBe(true);
    });
    
    test('should parse invitation correctly', async () => {
      const invitation = await createGroupInvitation(testGroup, bobAsContact);
      const parsed = parseInvitation(invitation);
      
      expect(parsed).not.toBeNull();
      expect(parsed!.recipientFingerprint).toBe(bobAsContact.shortFingerprint);
      expect(parsed!.kyberCiphertext).toBeDefined();
      expect(parsed!.encryptedGroupData).toBeDefined();
    });
    
    test('should accept invitation and recover group key', async () => {
      const invitation = await createGroupInvitation(
        testGroup,
        bobAsContact,
        alicePersonal.shortFingerprint,
        'Join us!'
      );
      
      const parsed = parseInvitation(invitation);
      expect(parsed).not.toBeNull();
      
      // Bob accepts the invitation
      const payload = await acceptInvitation(parsed!, bobPersonal);
      
      expect(payload).not.toBeNull();
      expect(payload!.groupName).toBe(testGroup.name);
      expect(payload!.groupAesKey).toBe(testGroup.aesKey);
      expect(payload!.groupEmoji).toBe(testGroup.emoji);
      expect(payload!.inviterFingerprint).toBe(alicePersonal.shortFingerprint);
      expect(payload!.message).toBe('Join us!');
    });
    
    test('should not accept invitation for wrong recipient', async () => {
      // Invitation is for Bob
      const invitation = await createGroupInvitation(testGroup, bobAsContact);
      const parsed = parseInvitation(invitation);
      
      // Alice tries to accept (she's not the intended recipient)
      const payload = await acceptInvitation(parsed!, alicePersonal);
      
      expect(payload).toBeNull(); // Fingerprint mismatch
    });
  });
  
  // ============================================================================
  // FULL END-TO-END TEST
  // ============================================================================
  
  describe('🦆 Full End-to-End Flow', () => {
    test('Complete flow: Alice creates group → invites Bob → Bob joins → both can encrypt/decrypt', async () => {
      console.log('\n🦆 Starting full E2E test...\n');
      
      // ========================================
      // STEP 1: Generate keys for Alice and Bob
      // ========================================
      console.log('1️⃣ Generating keys for Alice and Bob...');
      
      const aliceKeys = await generateKyberKeyPair();
      const bobKeys = await generateKyberKeyPair();
      
      const alicePersonal: PersonalKey = {
        id: 'alice-id',
        name: 'Alice',
        type: 'personal',
        publicKey: aliceKeys.publicKey,
        secretKey: aliceKeys.secretKey,
        fingerprint: await generateFingerprint(aliceKeys.publicKey),
        shortFingerprint: await generateShortFingerprint(aliceKeys.publicKey),
        createdAt: Date.now(),
      };
      
      const bobPersonal: PersonalKey = {
        id: 'bob-id',
        name: 'Bob',
        type: 'personal',
        publicKey: bobKeys.publicKey,
        secretKey: bobKeys.secretKey,
        fingerprint: await generateFingerprint(bobKeys.publicKey),
        shortFingerprint: await generateShortFingerprint(bobKeys.publicKey),
        createdAt: Date.now(),
      };
      
      console.log(`   Alice fingerprint: ${alicePersonal.shortFingerprint}`);
      console.log(`   Bob fingerprint: ${bobPersonal.shortFingerprint}`);
      expect(alicePersonal.shortFingerprint).not.toBe(bobPersonal.shortFingerprint);
      
      // ========================================
      // STEP 2: Alice creates a group
      // ========================================
      console.log('\n2️⃣ Alice creates a group...');
      
      const groupAesKey = await generateGroupKey();
      const aliceGroup: QuackGroup = {
        id: 'secret-club-id',
        name: 'Secret Duck Club',
        emoji: '🦆',
        aesKey: groupAesKey,
        fingerprint: await generateGroupFingerprint(groupAesKey),
        shortFingerprint: await generateGroupShortFingerprint(groupAesKey),
        createdAt: Date.now(),
        createdBy: alicePersonal.fingerprint,
      };
      
      console.log(`   Group: "${aliceGroup.name}" (${aliceGroup.shortFingerprint})`);
      expect(aliceGroup.shortFingerprint.length).toBe(8);
      
      // ========================================
      // STEP 3: Alice adds Bob as a contact
      // ========================================
      console.log('\n3️⃣ Alice adds Bob as a contact...');
      
      // In real app: Alice receives Bob's public key via Quack://KEY:...
      const bobAsContact: ContactKey = {
        id: 'bob-contact-id',
        name: 'Bob',
        type: 'contact',
        publicKey: bobKeys.publicKey,
        fingerprint: await generateFingerprint(bobKeys.publicKey),
        shortFingerprint: await generateShortFingerprint(bobKeys.publicKey),
        createdAt: Date.now(),
      };
      
      console.log(`   Added contact: ${bobAsContact.name} (${bobAsContact.shortFingerprint})`);
      
      // ========================================
      // STEP 4: Alice creates invitation for Bob
      // ========================================
      console.log('\n4️⃣ Alice creates an invitation for Bob...');
      
      const invitationString = await createGroupInvitation(
        aliceGroup,
        bobAsContact,
        alicePersonal.shortFingerprint,
        'Welcome to the Secret Duck Club! 🦆'
      );
      
      console.log(`   Invitation: ${invitationString.substring(0, 50)}...`);
      expect(invitationString.startsWith('Quack://INV:')).toBe(true);
      
      // ========================================
      // STEP 5: Bob receives and accepts invitation
      // ========================================
      console.log('\n5️⃣ Bob receives and accepts the invitation...');
      
      const parsedInvitation = parseInvitation(invitationString);
      expect(parsedInvitation).not.toBeNull();
      expect(parsedInvitation!.recipientFingerprint).toBe(bobPersonal.shortFingerprint);
      
      const invitationPayload = await acceptInvitation(parsedInvitation!, bobPersonal);
      expect(invitationPayload).not.toBeNull();
      
      console.log(`   Invitation from: ${invitationPayload!.inviterFingerprint}`);
      console.log(`   Group name: ${invitationPayload!.groupName}`);
      console.log(`   Message: ${invitationPayload!.message}`);
      
      // Bob now creates his own group object with the received key
      const bobGroup: QuackGroup = {
        id: 'bob-group-id', // Bob's local ID
        name: invitationPayload!.groupName,
        emoji: invitationPayload!.groupEmoji,
        aesKey: invitationPayload!.groupAesKey,
        fingerprint: await generateGroupFingerprint(invitationPayload!.groupAesKey),
        shortFingerprint: await generateGroupShortFingerprint(invitationPayload!.groupAesKey),
        createdAt: Date.now(),
      };
      
      // CRITICAL: Both should have the same AES key and fingerprints!
      expect(bobGroup.aesKey).toBe(aliceGroup.aesKey);
      expect(bobGroup.fingerprint).toBe(aliceGroup.fingerprint);
      expect(bobGroup.shortFingerprint).toBe(aliceGroup.shortFingerprint);
      
      console.log('   ✅ Bob successfully joined the group!');
      
      // ========================================
      // STEP 6: Alice sends a message to the group
      // ========================================
      console.log('\n6️⃣ Alice sends a message to the group...');
      
      const aliceMessage = 'Hello Bob! This message is post-quantum encrypted! 🔐🦆';
      const encryptedMessage = await encryptGroupMessage(aliceMessage, aliceGroup);
      
      console.log(`   Original: "${aliceMessage}"`);
      console.log(`   Encrypted: ${encryptedMessage.substring(0, 50)}...`);
      expect(isGroupMessage(encryptedMessage)).toBe(true);
      
      // ========================================
      // STEP 7: Bob decrypts Alice's message
      // ========================================
      console.log('\n7️⃣ Bob decrypts the message...');
      
      const bobDecryptResult = await decryptWithGroups(encryptedMessage, [bobGroup]);
      
      expect(bobDecryptResult).not.toBeNull();
      expect(bobDecryptResult!.plaintext).toBe(aliceMessage);
      expect(bobDecryptResult!.group.shortFingerprint).toBe(bobGroup.shortFingerprint);
      
      console.log(`   Decrypted: "${bobDecryptResult!.plaintext}"`);
      console.log('   ✅ Bob successfully decrypted the message!');
      
      // ========================================
      // STEP 8: Bob replies (both directions work)
      // ========================================
      console.log('\n8️⃣ Bob sends a reply...');
      
      const bobMessage = 'Hey Alice! I got your message. Quantum-safe messaging is awesome! 🎉';
      const bobEncrypted = await encryptGroupMessage(bobMessage, bobGroup);
      
      console.log(`   Bob\'s message encrypted: ${bobEncrypted.substring(0, 50)}...`);
      
      // Alice decrypts Bob's message
      const aliceDecryptResult = await decryptWithGroups(bobEncrypted, [aliceGroup]);
      
      expect(aliceDecryptResult).not.toBeNull();
      expect(aliceDecryptResult!.plaintext).toBe(bobMessage);
      
      console.log(`   Alice decrypted: "${aliceDecryptResult!.plaintext}"`);
      console.log('   ✅ Alice successfully decrypted Bob\'s reply!');
      
      // ========================================
      // SUCCESS!
      // ========================================
      console.log('\n' + '='.repeat(60));
      console.log('🎉 FULL E2E TEST PASSED!');
      console.log('='.repeat(60));
      console.log('✅ Kyber key generation works');
      console.log('✅ Group creation with AES-256 works');
      console.log('✅ Kyber encapsulation for invitation works');
      console.log('✅ Kyber decapsulation to accept invitation works');
      console.log('✅ AES-GCM encryption of group messages works');
      console.log('✅ AES-GCM decryption of group messages works');
      console.log('✅ Two-way communication verified');
      console.log('='.repeat(60) + '\n');
    });
  });
});
