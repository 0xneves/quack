import { useState } from 'react';
import type { VaultData, QuackGroup } from '@/types';
import { getGroups } from '@/storage/vault';
import { encryptGroupMessage } from '@/crypto/group';

interface SecureComposeScreenProps {
  vaultData: VaultData;
  onBack: () => void;
}

function SecureComposeScreen({ vaultData, onBack }: SecureComposeScreenProps) {
  const [message, setMessage] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encrypted, setEncrypted] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<QuackGroup | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const groups = getGroups(vaultData);

  async function handleEncrypt() {
    if (!message.trim()) {
      alert('Please enter a message');
      return;
    }

    if (!selectedGroupId) {
      alert('Please select a group');
      return;
    }

    setIsEncrypting(true);

    try {
      // Find the selected group
      const group = groups.find(g => g.id === selectedGroupId);
      if (!group) throw new Error('Group not found');

      // Encrypt to the group
      const encryptedMessage = await encryptGroupMessage(message, group);

      setEncrypted(encryptedMessage);
      setSelectedGroup(group);

      // Copy to clipboard
      await navigator.clipboard.writeText(encryptedMessage);

      // Notify background script
      chrome.runtime.sendMessage({
        type: 'ENCRYPTED_MESSAGE_READY',
        payload: { encrypted: encryptedMessage },
      });
    } catch (error) {
      console.error('Encryption failed:', error);
      alert('Failed to encrypt message. Please try again.');
    } finally {
      setIsEncrypting(false);
    }
  }

  function handleNew() {
    setMessage('');
    setEncrypted(null);
    setSelectedGroup(null);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  // Success screen after encryption
  if (encrypted && selectedGroup) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="text-quack-500 hover:text-quack-600 font-medium"
          >
            ← Dashboard
          </button>
          <h1 className="text-xl font-bold text-gray-900">Encrypted</h1>
          <div className="w-20"></div>
        </div>

        <div className="p-6">
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Message Encrypted!
            </h2>
            <p className="text-gray-600 mb-2">
              Encrypted to group: <strong>{selectedGroup.emoji || '👥'} {selectedGroup.name}</strong>
            </p>
            <p className="text-gray-500 text-sm mb-4">
              Copied to clipboard
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6 max-h-32 overflow-auto">
              <p className="text-xs font-mono text-gray-800 break-all text-left">
                {encrypted}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => copyToClipboard(encrypted)}
                className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                {copySuccess ? '✅ Copied!' : '📋 Copy Again'}
              </button>
              <button
                onClick={handleNew}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                ✍️ New Message
              </button>
              <button
                onClick={onBack}
                className="w-full text-gray-600 hover:text-gray-900 font-medium py-2 transition duration-200"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Compose screen
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-quack-500 hover:text-quack-600 font-medium"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-gray-900">Secure Compose</h1>
        <div className="w-16"></div>
      </div>

      <div className="p-6 space-y-6">
        {/* Group selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Encrypt to Group
          </label>
          {groups.length > 0 ? (
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
            >
              <option value="">Select a group...</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.emoji || '👥'} {group.name} ({group.shortFingerprint})
                </option>
              ))}
            </select>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 text-sm">
                <strong>⚠️ No groups yet!</strong>
              </p>
              <p className="text-yellow-700 text-sm mt-1">
                Create a group first, then you can encrypt messages to share with its members.
              </p>
            </div>
          )}
        </div>

        {/* Selected group info */}
        {selectedGroupId && (
          <div className="bg-quack-50 border border-quack-200 rounded-lg p-4">
            {(() => {
              const group = groups.find(g => g.id === selectedGroupId);
              if (!group) return null;
              return (
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{group.emoji || '👥'}</span>
                  <div>
                    <p className="font-semibold text-gray-900">{group.name}</p>
                    <p className="text-sm text-gray-500 font-mono">{group.shortFingerprint}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Message input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Your Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none resize-none"
            placeholder="Type your secret message here..."
            rows={8}
            autoFocus
          />
          <p className="text-xs text-gray-500 mt-1 text-right">
            {message.length} characters
          </p>
        </div>

        {/* Encrypt button */}
        <button
          onClick={handleEncrypt}
          disabled={isEncrypting || !selectedGroupId || !message.trim()}
          className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isEncrypting ? (
            <>⏳ Encrypting...</>
          ) : (
            <>🦆 Encrypt & Copy</>
          )}
        </button>

        {/* Info box */}
        <div className="bg-gray-50 border-l-4 border-gray-300 p-4">
          <p className="text-gray-600 text-sm">
            <strong>How it works:</strong> Your message is encrypted using AES-256-GCM with the 
            group's shared key. Anyone in the group can decrypt it — nobody else can.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SecureComposeScreen;
