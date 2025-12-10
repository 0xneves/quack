import { useState } from 'react';
import type { VaultData, QuackKey } from '@/types';
import { generateKey, addKeyToVault, removeKeyFromVault } from '@/storage/vault';
import { formatDate } from '@/utils/helpers';

interface DashboardScreenProps {
  vaultData: VaultData;
  onVaultUpdate: (vault: VaultData) => void;
  onLock: () => void;
  onCompose: () => void;
  onDecrypt: () => void;
}

function DashboardScreen({ vaultData, onVaultUpdate, onLock, onCompose, onDecrypt }: DashboardScreenProps) {
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [selectedKey, setSelectedKey] = useState<QuackKey | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleGenerateKey() {
    if (!newKeyName.trim()) {
      alert('Please enter a key name');
      return;
    }

    setIsGenerating(true);
    
    try {
      const key = await generateKey(newKeyName);
      const updatedVault = await addKeyToVault(key, vaultData);
      onVaultUpdate(updatedVault);
      setNewKeyName('');
      setShowNewKeyModal(false);
    } catch (error) {
      console.error('Failed to generate key:', error);
      alert('Failed to generate key. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleDeleteKey(keyId: string) {
    if (!confirm('Are you sure you want to delete this key? This cannot be undone.')) {
      return;
    }

    try {
      const updatedVault = await removeKeyFromVault(keyId, vaultData);
      onVaultUpdate(updatedVault);
      setSelectedKey(null);
    } catch (error) {
      console.error('Failed to delete key:', error);
      alert('Failed to delete key. Please try again.');
    }
  }

  function handleCopyKey(key: QuackKey) {
    const keyData = JSON.stringify({
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      aesKeyMaterial: key.aesKeyMaterial,
    });
    
    navigator.clipboard.writeText(keyData);
    alert('Key copied to clipboard! Share securely with others.');
  }

  if (selectedKey) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setSelectedKey(null)}
            className="text-quack-500 hover:text-quack-600 font-medium"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">Key Details</h1>
          <div className="w-16"></div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Key Name
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
              Created
            </label>
            <input
              type="text"
              value={formatDate(selectedKey.createdAt)}
              disabled
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Key ID
            </label>
            <input
              type="text"
              value={selectedKey.id}
              disabled
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50 text-xs font-mono"
            />
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleCopyKey(selectedKey)}
              className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
            >
              📋 Copy Key to Share
            </button>

            <button
              onClick={() => handleDeleteKey(selectedKey.id)}
              className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
            >
              🗑️ Delete Key
            </button>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-yellow-700 text-sm">
              <strong>⚠️ Warning:</strong> Only share keys via secure channels (Signal, in-person, etc.).
              Anyone with this key can decrypt your messages.
            </p>
          </div>
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

      {/* Content */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            Your Encryption Keys
          </h2>
          <button
            onClick={() => setShowNewKeyModal(true)}
            className="bg-quack-500 hover:bg-quack-600 text-white px-4 py-2 rounded-lg font-medium transition duration-200"
          >
            + New Key
          </button>
        </div>

        {vaultData.keys.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="text-5xl mb-4">🔑</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">
              No encryption keys yet
            </h3>
            <p className="text-gray-600 mb-4">
              Generate your first key to start encrypting messages
            </p>
            <button
              onClick={() => setShowNewKeyModal(true)}
              className="bg-quack-500 hover:bg-quack-600 text-white px-6 py-2 rounded-lg font-medium transition duration-200"
            >
              Generate Key
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {vaultData.keys.map((key) => (
              <div
                key={key.id}
                onClick={() => setSelectedKey(key)}
                className="bg-white rounded-lg shadow hover:shadow-md p-4 cursor-pointer transition duration-200 border border-gray-200 hover:border-quack-300"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">
                      📝 {key.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Created: {formatDate(key.createdAt)}
                    </p>
                  </div>
                  <div className="text-gray-400">
                    →
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Key Modal */}
      {showNewKeyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-slide-up">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Generate New Key
            </h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Key Name
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                placeholder="e.g. Personal, Work, Friends"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNewKeyModal(false);
                  setNewKeyName('');
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
                disabled={isGenerating}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateKey}
                className="flex-1 bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardScreen;

