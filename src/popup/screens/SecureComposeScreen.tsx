import { useState } from 'react';
import type { VaultData } from '@/types';
import { getGroups, getPersonalKeys } from '@/storage/vault';
import { encryptGroupMessage, encryptPersonalMessage } from '@/crypto/group';

interface SecureComposeScreenProps {
  vaultData: VaultData;
  onBack: () => void;
}

function SecureComposeScreen({ vaultData, onBack }: SecureComposeScreenProps) {
  const [message, setMessage] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encrypted, setEncrypted] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<{ name: string; emoji?: string; type: 'group' | 'identity'; stealth?: boolean } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [stealthMode, setStealthMode] = useState(false);

  const groups = getGroups(vaultData);
  const personalKeys = getPersonalKeys(vaultData);
  
  // Check if selected target is an identity or group
  const isIdentitySelected = personalKeys.some(k => k.id === selectedTargetId);

  async function handleEncrypt() {
    if (!message.trim()) {
      alert('Please enter a message');
      return;
    }

    if (!selectedTargetId) {
      alert('Please select an identity or group');
      return;
    }

    setIsEncrypting(true);

    try {
      let encryptedMessage: string;
      let targetInfo: { name: string; emoji?: string; type: 'group' | 'identity'; stealth?: boolean };

      if (isIdentitySelected) {
        // Encrypt to personal identity (self-encryption using derived AES)
        const identity = personalKeys.find(k => k.id === selectedTargetId);
        if (!identity) throw new Error('Identity not found');

        // Use encryptPersonalMessage with derived AES key (same size as group messages)
        encryptedMessage = await encryptPersonalMessage(message, identity, stealthMode);
        targetInfo = { name: identity.name, type: 'identity', stealth: stealthMode };
      } else {
        // Encrypt to group
        const group = groups.find(g => g.id === selectedTargetId);
        if (!group) throw new Error('Group not found');

        encryptedMessage = await encryptGroupMessage(message, group, stealthMode);
        targetInfo = { name: group.name, emoji: group.emoji, type: 'group', stealth: stealthMode };
      }

      setEncrypted(encryptedMessage);
      setSelectedTarget(targetInfo);

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
    setSelectedTarget(null);
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  // Success screen after encryption
  if (encrypted && selectedTarget) {
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
              Encrypted to {selectedTarget.type === 'identity' ? 'identity' : 'group'}: <strong>{selectedTarget.type === 'identity' ? '🔑' : (selectedTarget.emoji || '👥')} {selectedTarget.name}</strong>
            </p>
            {selectedTarget.stealth && (
              <p className="text-purple-600 text-sm mb-2">
                🥷 Stealth mode enabled
              </p>
            )}
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
        {/* Target selector (identities + groups) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Encrypt to
          </label>
          {(personalKeys.length > 0 || groups.length > 0) ? (
            <select
              value={selectedTargetId}
              onChange={(e) => setSelectedTargetId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
            >
              <option value="">Select target...</option>
              {personalKeys.length > 0 && (
                <>
                  <option disabled className="text-gray-500">── Identities (Personal) ──</option>
                  {personalKeys.map((key) => (
                    <option key={key.id} value={key.id}>
                      🔑 {key.name} ({key.shortFingerprint})
                    </option>
                  ))}
                </>
              )}
              {groups.length > 0 && (
                <>
                  <option disabled className="text-gray-500">── Groups (Shared) ──</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.emoji || '👥'} {group.name} ({group.shortFingerprint})
                    </option>
                  ))}
                </>
              )}
            </select>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 text-sm">
                <strong>⚠️ No encryption targets!</strong>
              </p>
              <p className="text-yellow-700 text-sm mt-1">
                Create an identity or a group first to encrypt messages.
              </p>
            </div>
          )}
        </div>

        {/* Selected target info */}
        {selectedTargetId && (
          <div className={`border rounded-lg p-4 ${isIdentitySelected ? 'bg-blue-50 border-blue-200' : 'bg-quack-50 border-quack-200'}`}>
            {(() => {
              if (isIdentitySelected) {
                const identity = personalKeys.find(k => k.id === selectedTargetId);
                if (!identity) return null;
                return (
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🔑</span>
                    <div>
                      <p className="font-semibold text-gray-900">{identity.name}</p>
                      <p className="text-sm text-gray-500 font-mono">{identity.shortFingerprint}</p>
                    </div>
                  </div>
                );
              } else {
                const group = groups.find(g => g.id === selectedTargetId);
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
              }
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

        {/* Stealth mode toggle */}
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="stealth-mode"
            checked={stealthMode}
            onChange={(e) => setStealthMode(e.target.checked)}
            className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
          />
          <label htmlFor="stealth-mode" className="cursor-pointer">
            <span className="text-sm font-medium text-gray-700">
              🥷 Stealth Mode
            </span>
            <p className="text-xs text-gray-500 mt-0.5">
              Hide the recipient fingerprint. Observers won't be able to build social graphs.
            </p>
          </label>
        </div>

        {/* Encrypt button */}
        <button
          onClick={handleEncrypt}
          disabled={isEncrypting || !selectedTargetId || !message.trim()}
          className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isEncrypting ? (
            <>⏳ Encrypting...</>
          ) : (
            <>🦆 Encrypt & Copy</>
          )}
        </button>

        {/* Info box */}
        <div className={`border-l-4 p-4 ${stealthMode ? 'bg-purple-50 border-purple-400' : 'bg-gray-50 border-gray-300'}`}>
          <p className="text-gray-600 text-sm">
            <strong>How it works:</strong> {stealthMode 
              ? 'Stealth mode removes the recipient fingerprint from the encrypted message. Observers cannot tell who can decrypt it, but the recipient must try all their keys to decrypt (slightly slower).'
              : isIdentitySelected 
                ? 'Your message is encrypted using your identity\'s public key. Only you can decrypt it with your private key — perfect for personal notes and secrets.'
                : 'Your message is encrypted using AES-256-GCM with the group\'s shared key. Anyone in the group can decrypt it — nobody else can.'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default SecureComposeScreen;
