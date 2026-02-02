import { useState } from 'react';
import type { VaultData } from '@/types';
import { importAESKey, encryptMessage } from '@/crypto/aes';

interface SecureComposeScreenProps {
  vaultData: VaultData;
  onBack: () => void;
}

function SecureComposeScreen({ vaultData, onBack }: SecureComposeScreenProps) {
  const [message, setMessage] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState<string>(
    vaultData.keys[0]?.id || ''
  );
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encrypted, setEncrypted] = useState<string | null>(null);

  async function handleEncrypt() {
    if (!message.trim()) {
      alert('Please enter a message');
      return;
    }

    if (!selectedKeyId) {
      alert('Please select a key');
      return;
    }

    setIsEncrypting(true);

    try {
      const key = vaultData.keys.find(k => k.id === selectedKeyId);
      if (!key) throw new Error('Key not found');

      const aesKey = await importAESKey(key.aesKeyMaterial);
      const encryptedMessage = await encryptMessage(message, aesKey);

      setEncrypted(encryptedMessage);

      // Copy to clipboard
      await navigator.clipboard.writeText(encryptedMessage);

      // Notify background script to blacklist this message
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
  }

  if (encrypted) {
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
            <p className="text-gray-600 mb-6">
              Your encrypted message has been copied to clipboard
            </p>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-xs font-mono text-gray-800 break-all">
                {encrypted}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => navigator.clipboard.writeText(encrypted)}
                className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
              >
                📋 Copy Again
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

          <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4">
            <p className="text-blue-700 text-sm">
              <strong>💡 Tip:</strong> Paste this encrypted message anywhere on the web.
              Others with the same key will see it decrypted automatically!
            </p>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="bg-green-50 border-l-4 border-green-400 p-4">
          <p className="text-green-700 text-sm">
            <strong>🔒 Protected:</strong> Your message is composed in an isolated environment,
            safe from page analytics and keyloggers.
          </p>
        </div>

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
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Encrypt with key
          </label>
          <select
            value={selectedKeyId}
            onChange={(e) => setSelectedKeyId(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
          >
            {vaultData.keys.length === 0 ? (
              <option value="">No keys available</option>
            ) : (
              vaultData.keys.map((key) => (
                <option key={key.id} value={key.id}>
                  🔑 {key.name}
                </option>
              ))
            )}
          </select>
        </div>

        {vaultData.keys.length === 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-yellow-700 text-sm">
              <strong>⚠️ No keys:</strong> Generate an encryption key first from the dashboard.
            </p>
          </div>
        )}

        <button
          onClick={handleEncrypt}
          disabled={isEncrypting || vaultData.keys.length === 0}
          className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isEncrypting ? (
            <>⏳ Encrypting...</>
          ) : (
            <>🦆 Encrypt & Copy</>
          )}
        </button>
      </div>
    </div>
  );
}

export default SecureComposeScreen;

