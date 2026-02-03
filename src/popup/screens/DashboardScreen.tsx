import { useState } from 'react';
import type { VaultData, QuackKey, PersonalKey, ContactKey } from '@/types';
import { isPersonalKey } from '@/types';
import { generatePersonalKey, createContactKey, addKeyToVault, removeKeyFromVault, exportPublicKey, parseKeyString, getPersonalKeys, getContactKeys } from '@/storage/vault';
import { formatDate } from '@/utils/helpers';

interface DashboardScreenProps {
  vaultData: VaultData;
  onVaultUpdate: (vault: VaultData) => void;
  onLock: () => void;
  onCompose: () => void;
  onDecrypt: () => void;
}

type TabType = 'identity' | 'contacts';
type ModalType = 'newIdentity' | 'addContact' | 'keyDetails' | null;

function DashboardScreen({ vaultData, onVaultUpdate, onLock, onCompose, onDecrypt }: DashboardScreenProps) {
  const [activeTab, setActiveTab] = useState<TabType>('identity');
  const [modal, setModal] = useState<ModalType>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [importKeyString, setImportKeyString] = useState('');
  const [selectedKey, setSelectedKey] = useState<QuackKey | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const personalKeys = getPersonalKeys(vaultData);
  const contacts = getContactKeys(vaultData);

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

  function handleCopyKey(key: PersonalKey) {
    const exportedKey = exportPublicKey(key);
    navigator.clipboard.writeText(exportedKey);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  function handleCopyFingerprint(key: QuackKey) {
    navigator.clipboard.writeText(key.fingerprint);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  function openKeyDetails(key: QuackKey) {
    setSelectedKey(key);
    setModal('keyDetails');
  }

  // Key Details Modal
  if (modal === 'keyDetails' && selectedKey) {
    const isPersKey = isPersonalKey(selectedKey);
    
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => { setModal(null); setSelectedKey(null); }}
            className="text-quack-500 hover:text-quack-600 font-medium"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">
            {isPersKey ? 'Identity Details' : 'Contact Details'}
          </h1>
          <div className="w-16"></div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name
            </label>
            <input
              type="text"
              value={selectedKey.name}
              disabled
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fingerprint (for verification)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={selectedKey.fingerprint}
                disabled
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
              />
              <button
                onClick={() => handleCopyFingerprint(selectedKey)}
                className="px-4 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg transition"
              >
                {copySuccess ? '✓' : '📋'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Verify this matches on both ends via a secure channel (phone, in-person)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Created
            </label>
            <input
              type="text"
              value={formatDate(selectedKey.createdAt)}
              disabled
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
            />
          </div>

          <div className="space-y-3">
            {isPersKey && (
              <button
                onClick={() => handleCopyKey(selectedKey as PersonalKey)}
                className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                {copySuccess ? '✓ Copied!' : '📤 Copy Key to Share'}
              </button>
            )}

            <button
              onClick={() => handleDeleteKey(selectedKey.id)}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
            >
              🗑️ Delete {isPersKey ? 'Identity' : 'Contact'}
            </button>
          </div>

          {isPersKey && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <p className="text-yellow-700 text-sm">
                <strong>⚠️ Share carefully:</strong> Only share your key via secure channels 
                (Signal, in-person, etc.). Ask them to verify the fingerprint.
              </p>
            </div>
          )}

          {!isPersKey && !(selectedKey as ContactKey).verifiedAt && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
              <p className="text-blue-700 text-sm">
                <strong>💡 Tip:</strong> Verify the fingerprint with this contact via phone or 
                in-person to ensure their key wasn't intercepted.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-3xl">🦆</span>
          <h1 className="text-xl font-bold text-gray-900">Quack</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCompose}
            className="bg-quack-500 hover:bg-quack-600 text-white px-3 py-2 rounded-lg font-medium text-sm transition duration-200"
            title="Encrypt a message"
          >
            Encrypt
          </button>
          <button
            onClick={onDecrypt}
            className="bg-white border border-gray-300 hover:border-quack-300 text-gray-800 px-3 py-2 rounded-lg font-medium text-sm transition duration-200"
            title="Decrypt a message"
          >
            Decrypt
          </button>
          <button
            onClick={onLock}
            className="text-gray-600 hover:text-gray-900 px-3 py-2 rounded-lg transition duration-200"
            title="Lock vault"
          >
            🔒
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('identity')}
            className={`py-3 border-b-2 font-medium transition ${
              activeTab === 'identity'
                ? 'border-quack-500 text-quack-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            🔑 Your Identity ({personalKeys.length})
          </button>
          <button
            onClick={() => setActiveTab('contacts')}
            className={`py-3 border-b-2 font-medium transition ${
              activeTab === 'contacts'
                ? 'border-quack-500 text-quack-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            👥 Contacts ({contacts.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
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
                  Generate your identity key so others can send you encrypted messages
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
          </>
        )}

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
                <div className="text-5xl mb-4">👥</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">No contacts yet</h3>
                <p className="text-gray-600 mb-4">
                  Add contacts by importing their public key (Quack://KEY:...)
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

      {/* New Identity Modal */}
      {modal === 'newIdentity' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-slide-up">
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
              This creates a new ML-KEM (post-quantum) keypair. Share your public key with contacts so they can encrypt messages to you.
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
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-slide-up">
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
              Paste the key your contact shared with you. After adding, verify the fingerprint matches via phone or in-person.
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
    </div>
  );
}

export default DashboardScreen;
