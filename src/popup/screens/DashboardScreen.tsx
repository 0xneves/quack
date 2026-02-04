import { useState } from 'react';
import type { VaultData, QuackKey, QuackGroup } from '@/types';
import { isPersonalKey } from '@/types';
import { 
  generatePersonalKey, 
  createContactKey, 
  addKeyToVault, 
  removeKeyFromVault, 
  exportPublicKey, 
  parseKeyString, 
  getPersonalKeys, 
  getContactKeys,
  getGroups,
  createGroup,
  addGroupToVault,
  removeGroupFromVault,
  createGroupFromInvitation,
  getPrimaryPersonalKey,
  hasGroup
} from '@/storage/vault';
import { createGroupInvitation, parseInvitation, acceptInvitation } from '@/crypto/group';
import { formatDate } from '@/utils/helpers';

interface DashboardScreenProps {
  vaultData: VaultData;
  onVaultUpdate: (vault: VaultData) => void;
  onLock: () => void;
  onCompose: () => void;
  onDecrypt: () => void;
  onConnect?: () => void;
}

type TabType = 'identity' | 'contacts' | 'groups';
type ModalType = 'newIdentity' | 'addContact' | 'keyDetails' | 'newGroup' | 'groupDetails' | 'inviteToGroup' | 'joinGroup' | null;

// Common emoji options for groups
const GROUP_EMOJIS = ['🦆', '🔐', '👥', '🏠', '💼', '🎮', '🎵', '📚', '🌟', '💬', '🔒', '🛡️'];

function DashboardScreen({ vaultData, onVaultUpdate, onLock, onCompose, onDecrypt, onConnect }: DashboardScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>('groups');
  const [modal, setModal] = useState<ModalType>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [importKeyString, setImportKeyString] = useState('');
  const [selectedKey, setSelectedKey] = useState<QuackKey | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<QuackGroup | null>(null);
  const [selectedContactForInvite, setSelectedContactForInvite] = useState<string>('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState('🦆');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const personalKeys = getPersonalKeys(vaultData);
  const contacts = getContactKeys(vaultData);
  const groups = getGroups(vaultData);

  // ============================================================================
  // Identity Handlers
  // ============================================================================

  async function handleGenerateIdentity() {
    if (!newKeyName.trim()) {
      alert('Please enter a name for your identity');
      return;
    }

    setIsGenerating(true);
    
    try {
      const key = await generatePersonalKey(newKeyName);
      const updatedVault = await addKeyToVault(key, vaultData);
      onVaultUpdate(updatedVault);
      setNewKeyName('');
      setModal(null);
    } catch (error) {
      console.error('Failed to generate key:', error);
      alert('Failed to generate key. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  // ============================================================================
  // Contact Handlers
  // ============================================================================

  async function handleAddContact() {
    if (!newKeyName.trim()) {
      alert('Please enter a name for this contact');
      return;
    }
    if (!importKeyString.trim()) {
      alert('Please paste the contact\'s key (Quack://KEY:...)');
      return;
    }

    const parsed = parseKeyString(importKeyString);
    if (!parsed) {
      alert('Invalid key format. Expected: Quack://KEY:[public_key]');
      return;
    }

    setIsGenerating(true);
    
    try {
      const contact = await createContactKey(newKeyName, parsed.publicKey);
      const updatedVault = await addKeyToVault(contact, vaultData);
      onVaultUpdate(updatedVault);
      setNewKeyName('');
      setImportKeyString('');
      setModal(null);
    } catch (error: any) {
      console.error('Failed to add contact:', error);
      alert(error.message || 'Failed to add contact. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDeleteKey(keyId: string) {
    const key = vaultData.keys.find(k => k.id === keyId);
    const keyType = key && isPersonalKey(key) ? 'identity key' : 'contact';
    
    if (!confirm(`Are you sure you want to delete this ${keyType}? This cannot be undone.`)) {
      return;
    }

    try {
      const updatedVault = await removeKeyFromVault(keyId, vaultData);
      onVaultUpdate(updatedVault);
      setSelectedKey(null);
      setModal(null);
    } catch (error) {
      console.error('Failed to delete key:', error);
      alert('Failed to delete key. Please try again.');
    }
  }

  // ============================================================================
  // Group Handlers
  // ============================================================================

  async function handleCreateGroup() {
    if (!newGroupName.trim()) {
      alert('Please enter a group name');
      return;
    }

    setIsGenerating(true);
    
    try {
      const primaryKey = getPrimaryPersonalKey(vaultData);
      const group = await createGroup(
        newGroupName,
        newGroupEmoji,
        undefined,
        primaryKey?.fingerprint
      );
      const updatedVault = await addGroupToVault(group, vaultData);
      onVaultUpdate(updatedVault);
      setNewGroupName('');
      setNewGroupEmoji('🦆');
      setModal(null);
    } catch (error: any) {
      console.error('Failed to create group:', error);
      alert(error.message || 'Failed to create group. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm('Are you sure you want to leave this group? You will lose access to all encrypted messages.')) {
      return;
    }

    try {
      const updatedVault = await removeGroupFromVault(groupId, vaultData);
      onVaultUpdate(updatedVault);
      setSelectedGroup(null);
      setModal(null);
    } catch (error) {
      console.error('Failed to leave group:', error);
      alert('Failed to leave group. Please try again.');
    }
  }

  async function handleGenerateInvite() {
    if (!selectedGroup || !selectedContactForInvite) {
      alert('Please select a contact to invite');
      return;
    }

    const contact = contacts.find(c => c.id === selectedContactForInvite);
    if (!contact) {
      alert('Contact not found');
      return;
    }

    setIsGenerating(true);
    
    try {
      const primaryKey = getPrimaryPersonalKey(vaultData);
      const invitation = await createGroupInvitation(
        selectedGroup,
        contact,
        primaryKey?.shortFingerprint,
        inviteMessage || undefined
      );
      setGeneratedInvite(invitation);
      await navigator.clipboard.writeText(invitation);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to generate invitation:', error);
      alert('Failed to generate invitation. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleJoinGroup() {
    if (!importKeyString.trim()) {
      alert('Please paste the invitation (Quack://INV:...)');
      return;
    }

    const parsed = parseInvitation(importKeyString);
    if (!parsed) {
      alert('Invalid invitation format. Expected: Quack://INV:...');
      return;
    }

    // Find matching personal key
    const matchingKey = personalKeys.find(k => k.shortFingerprint === parsed.recipientFingerprint);
    if (!matchingKey) {
      alert(`This invitation is for fingerprint ${parsed.recipientFingerprint}, but you don't have a matching identity key.`);
      return;
    }

    setIsGenerating(true);
    
    try {
      const payload = await acceptInvitation(parsed, matchingKey);
      if (!payload) {
        alert('Failed to decrypt invitation. The invitation may be corrupted.');
        return;
      }

      // Check if we already have this group
      if (hasGroup(payload.groupAesKey, vaultData)) {
        alert('You are already a member of this group!');
        return;
      }

      const group = await createGroupFromInvitation(payload);
      const updatedVault = await addGroupToVault(group, vaultData);
      onVaultUpdate(updatedVault);
      setImportKeyString('');
      setModal(null);
      alert(`Successfully joined "${payload.groupName}"! 🎉`);
    } catch (error: any) {
      console.error('Failed to join group:', error);
      alert(error.message || 'Failed to join group. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  // ============================================================================
  // UI Helpers
  // ============================================================================

  function openKeyDetails(key: QuackKey) {
    setSelectedKey(key);
    setModal('keyDetails');
  }

  function openGroupDetails(group: QuackGroup) {
    setSelectedGroup(group);
    setGeneratedInvite(null);
    setSelectedContactForInvite('');
    setInviteMessage('');
    setModal('groupDetails');
  }

  function openInviteModal() {
    setGeneratedInvite(null);
    setSelectedContactForInvite('');
    setInviteMessage('');
    setModal('inviteToGroup');
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🦆</span>
            <h1 className="text-2xl font-bold text-gray-900">Quack</h1>
          </div>
          <button
            onClick={onLock}
            className="text-gray-500 hover:text-gray-700 font-medium"
          >
            🔒 Lock
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mb-2">
          <button
            onClick={onCompose}
            className="flex-1 bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
          >
            ✍️ Compose
          </button>
          <button
            onClick={onDecrypt}
            className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
          >
            🔓 Decrypt
          </button>
        </div>
        {onConnect && (
          <button
            onClick={onConnect}
            className="w-full bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold py-2 px-4 rounded-lg transition duration-200"
          >
            🤝 Connect with Someone
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('groups')}
            className={`py-3 border-b-2 font-medium transition duration-200 ${
              activeTab === 'groups'
                ? 'border-quack-500 text-quack-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            👥 Groups ({groups.length})
          </button>
          <button
            onClick={() => setActiveTab('identity')}
            className={`py-3 border-b-2 font-medium transition duration-200 ${
              activeTab === 'identity'
                ? 'border-quack-500 text-quack-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🔐 Identity ({personalKeys.length})
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`py-3 border-b-2 font-medium transition duration-200 ${
              activeTab === 'contacts'
                ? 'border-quack-500 text-quack-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📇 Contacts ({contacts.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* ================================================================ */}
        {/* GROUPS TAB */}
        {/* ================================================================ */}
        {activeTab === 'groups' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Your Groups</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => { setImportKeyString(''); setModal('joinGroup'); }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition duration-200"
                >
                  📩 Join
                </button>
                <button
                  onClick={() => setModal('newGroup')}
                  className="bg-quack-500 hover:bg-quack-600 text-white px-4 py-2 rounded-lg font-medium transition duration-200"
                >
                  + Create
                </button>
              </div>
            </div>

            {groups.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <div className="text-5xl mb-4">👥</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">No groups yet</h3>
                <p className="text-gray-600 mb-4">
                  Create a group to start sharing encrypted messages, or join an existing group with an invitation.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => { setImportKeyString(''); setModal('joinGroup'); }}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-medium transition duration-200"
                  >
                    📩 Join Group
                  </button>
                  <button
                    onClick={() => setModal('newGroup')}
                    className="bg-quack-500 hover:bg-quack-600 text-white px-6 py-2 rounded-lg font-medium transition duration-200"
                  >
                    + Create Group
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    onClick={() => openGroupDetails(group)}
                    className="bg-white rounded-lg shadow hover:shadow-md p-4 cursor-pointer transition duration-200 border border-gray-200 hover:border-quack-300"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{group.emoji || '👥'}</span>
                        <div>
                          <h3 className="font-bold text-gray-900">{group.name}</h3>
                          <p className="text-sm text-gray-500 font-mono">{group.shortFingerprint}</p>
                        </div>
                      </div>
                      <div className="text-gray-400">→</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Info box */}
            <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4">
              <p className="text-blue-700 text-sm">
                <strong>💡 How groups work:</strong> Each group has a shared AES-256 key. Anyone in the group can encrypt/decrypt messages. 
                Invite others using Kyber post-quantum encryption — only they can accept the invitation.
              </p>
            </div>
          </>
        )}

        {/* ================================================================ */}
        {/* IDENTITY TAB */}
        {/* ================================================================ */}
        {activeTab === 'identity' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Your Identity Keys</h2>
              <button
                onClick={() => setModal('newIdentity')}
                className="bg-quack-500 hover:bg-quack-600 text-white px-4 py-2 rounded-lg font-medium transition duration-200"
              >
                + New Identity
              </button>
            </div>

            {personalKeys.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <div className="text-5xl mb-4">🔑</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">No identity yet</h3>
                <p className="text-gray-600 mb-4">
                  Generate your identity key so others can invite you to groups securely.
                </p>
                <button
                  onClick={() => setModal('newIdentity')}
                  className="bg-quack-500 hover:bg-quack-600 text-white px-6 py-2 rounded-lg font-medium transition duration-200"
                >
                  Generate Identity
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {personalKeys.map((key) => (
                  <div
                    key={key.id}
                    onClick={() => openKeyDetails(key)}
                    className="bg-white rounded-lg shadow hover:shadow-md p-4 cursor-pointer transition duration-200 border border-gray-200 hover:border-quack-300"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-gray-900 mb-1">🔐 {key.name}</h3>
                        <p className="text-sm text-gray-600 font-mono">{key.shortFingerprint}</p>
                      </div>
                      <div className="text-gray-400">→</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Info box */}
            <div className="mt-6 bg-purple-50 border-l-4 border-purple-400 p-4">
              <p className="text-purple-700 text-sm">
                <strong>🛡️ Post-Quantum:</strong> Your identity uses ML-KEM-768 (Kyber), protecting against future quantum computer attacks. 
                Share your public key so contacts can invite you to groups.
              </p>
            </div>
          </>
        )}

        {/* ================================================================ */}
        {/* CONTACTS TAB */}
        {/* ================================================================ */}
        {activeTab === 'contacts' && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Your Contacts</h2>
              <button
                onClick={() => setModal('addContact')}
                className="bg-quack-500 hover:bg-quack-600 text-white px-4 py-2 rounded-lg font-medium transition duration-200"
              >
                + Add Contact
              </button>
            </div>

            {contacts.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <div className="text-5xl mb-4">📇</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">No contacts yet</h3>
                <p className="text-gray-600 mb-4">
                  Add contacts by importing their public key (Quack://KEY:...) so you can invite them to groups.
                </p>
                <button
                  onClick={() => setModal('addContact')}
                  className="bg-quack-500 hover:bg-quack-600 text-white px-6 py-2 rounded-lg font-medium transition duration-200"
                >
                  Add Contact
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {contacts.map((key) => (
                  <div
                    key={key.id}
                    onClick={() => openKeyDetails(key)}
                    className="bg-white rounded-lg shadow hover:shadow-md p-4 cursor-pointer transition duration-200 border border-gray-200 hover:border-quack-300"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-gray-900 mb-1">👤 {key.name}</h3>
                        <p className="text-sm text-gray-600 font-mono">{key.shortFingerprint}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {key.verifiedAt && <span className="text-green-500" title="Verified">✓</span>}
                        <span className="text-gray-400">→</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ================================================================ */}
      {/* MODALS */}
      {/* ================================================================ */}

      {/* New Identity Modal */}
      {modal === 'newIdentity' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Generate New Identity</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Identity Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                placeholder="e.g. Personal, Work"
                autoFocus
              />
            </div>

            <p className="text-sm text-gray-600 mb-4">
              This creates a new ML-KEM (post-quantum) keypair. Share your public key with contacts so they can invite you to groups.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setModal(null); setNewKeyName(''); }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
                disabled={isGenerating}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateIdentity}
                className="flex-1 bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {modal === 'addContact' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Add Contact</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Contact Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                placeholder="e.g. Alice, Bob"
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Their Public Key</label>
              <textarea
                value={importKeyString}
                onChange={(e) => setImportKeyString(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none h-24 font-mono text-sm"
                placeholder="Quack://KEY:..."
              />
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Paste the key your contact shared with you. Then you can invite them to your groups.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setModal(null); setNewKeyName(''); setImportKeyString(''); }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
                disabled={isGenerating}
              >
                Cancel
              </button>
              <button
                onClick={handleAddContact}
                className="flex-1 bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
                disabled={isGenerating}
              >
                {isGenerating ? 'Adding...' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Key Details Modal */}
      {modal === 'keyDetails' && selectedKey && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {isPersonalKey(selectedKey) ? '🔐' : '👤'} {selectedKey.name}
            </h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Fingerprint</label>
                <p className="font-mono text-sm bg-gray-100 p-3 rounded-lg break-all">{selectedKey.fingerprint}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Created</label>
                <p className="text-gray-900">{formatDate(selectedKey.createdAt)}</p>
              </div>

              {isPersonalKey(selectedKey) && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Public Key (share this)</label>
                  <div className="bg-gray-100 p-3 rounded-lg">
                    <p className="font-mono text-xs break-all mb-2">{exportPublicKey(selectedKey)}</p>
                    <button
                      onClick={() => copyToClipboard(exportPublicKey(selectedKey))}
                      className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-2 px-4 rounded-lg transition duration-200 text-sm"
                    >
                      {copySuccess ? '✅ Copied!' : '📋 Copy Public Key'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleDeleteKey(selectedKey.id)}
                className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                🗑️ Delete
              </button>
              <button
                onClick={() => { setModal(null); setSelectedKey(null); }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Group Modal */}
      {modal === 'newGroup' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Group</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                placeholder="e.g. Family, Work Team, Friends"
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Emoji</label>
              <div className="flex flex-wrap gap-2">
                {GROUP_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setNewGroupEmoji(emoji)}
                    className={`text-2xl p-2 rounded-lg transition duration-200 ${
                      newGroupEmoji === emoji 
                        ? 'bg-quack-100 ring-2 ring-quack-500' 
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              This creates a group with a new AES-256 key. Invite contacts to share the encrypted key securely.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setModal(null); setNewGroupName(''); setNewGroupEmoji('🦆'); }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
                disabled={isGenerating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateGroup}
                className="flex-1 bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
                disabled={isGenerating}
              >
                {isGenerating ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Details Modal */}
      {modal === 'groupDetails' && selectedGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-4xl">{selectedGroup.emoji || '👥'}</span>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedGroup.name}</h2>
                <p className="text-sm text-gray-500 font-mono">{selectedGroup.shortFingerprint}</p>
              </div>
            </div>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Full Fingerprint</label>
                <p className="font-mono text-xs bg-gray-100 p-3 rounded-lg break-all">{selectedGroup.fingerprint}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Created</label>
                <p className="text-gray-900">{formatDate(selectedGroup.createdAt)}</p>
              </div>

              {selectedGroup.notes && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Notes</label>
                  <p className="text-gray-900">{selectedGroup.notes}</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={openInviteModal}
                className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
                disabled={contacts.length === 0}
              >
                📩 Invite Someone
              </button>
              {contacts.length === 0 && (
                <p className="text-xs text-gray-500 text-center">Add contacts first to invite them</p>
              )}
              <button
                onClick={() => handleDeleteGroup(selectedGroup.id)}
                className="w-full bg-red-100 hover:bg-red-200 text-red-700 font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                🚪 Leave Group
              </button>
              <button
                onClick={() => { setModal(null); setSelectedGroup(null); }}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite to Group Modal */}
      {modal === 'inviteToGroup' && selectedGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Invite to {selectedGroup.emoji || '👥'} {selectedGroup.name}
            </h2>
            <p className="text-gray-600 text-sm mb-4">
              Generate a secure invitation link that only the selected contact can accept.
            </p>

            {!generatedInvite ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Contact</label>
                  <select
                    value={selectedContactForInvite}
                    onChange={(e) => setSelectedContactForInvite(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                  >
                    <option value="">Choose a contact...</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        👤 {contact.name} ({contact.shortFingerprint})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message (optional)</label>
                  <input
                    type="text"
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                    placeholder="e.g. Welcome to the team!"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setModal('groupDetails')}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
                    disabled={isGenerating}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleGenerateInvite}
                    className="flex-1 bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
                    disabled={isGenerating || !selectedContactForInvite}
                  >
                    {isGenerating ? 'Generating...' : 'Generate Invite'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-green-700 font-medium mb-2">✅ Invitation Generated!</p>
                  <p className="text-green-600 text-sm">Copied to clipboard. Send this to your contact:</p>
                </div>

                <div className="bg-gray-100 p-3 rounded-lg mb-4">
                  <p className="font-mono text-xs break-all">{generatedInvite}</p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => copyToClipboard(generatedInvite)}
                    className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
                  >
                    {copySuccess ? '✅ Copied!' : '📋 Copy Again'}
                  </button>
                  <button
                    onClick={() => { setGeneratedInvite(null); setSelectedContactForInvite(''); }}
                    className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
                  >
                    Invite Another
                  </button>
                  <button
                    onClick={() => { setModal(null); setSelectedGroup(null); setGeneratedInvite(null); }}
                    className="w-full text-gray-600 hover:text-gray-900 font-medium py-2 transition duration-200"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Join Group Modal */}
      {modal === 'joinGroup' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Join a Group</h2>
            
            {personalKeys.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-yellow-800 font-medium">⚠️ No identity key!</p>
                <p className="text-yellow-700 text-sm mt-1">
                  You need to generate an identity first before you can accept invitations.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Paste Invitation</label>
                  <textarea
                    value={importKeyString}
                    onChange={(e) => setImportKeyString(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none h-32 font-mono text-sm"
                    placeholder="Quack://INV:..."
                    autoFocus
                  />
                </div>

                <p className="text-sm text-gray-600 mb-4">
                  Paste the invitation you received. It will be decrypted using your identity key.
                </p>
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setModal(null); setImportKeyString(''); }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
                disabled={isGenerating}
              >
                Cancel
              </button>
              <button
                onClick={handleJoinGroup}
                className="flex-1 bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
                disabled={isGenerating || personalKeys.length === 0 || !importKeyString.trim()}
              >
                {isGenerating ? 'Joining...' : 'Join Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardScreen;
