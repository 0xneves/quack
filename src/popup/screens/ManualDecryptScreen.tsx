import { useState } from 'react';
import type { VaultData } from '@/types';
import { importAESKey, decryptMessage } from '@/crypto/aes';
import { QUACK_PREFIX } from '@/utils/constants';

interface ManualDecryptScreenProps {
  vaultData: VaultData;
  onBack: () => void;
}

function ManualDecryptScreen({ vaultData, onBack }: ManualDecryptScreenProps) {
  const [ciphertext, setCiphertext] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState<string>(
    vaultData.keys[0]?.id || ''
  );
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  function validateCipher(text: string) {
    if (!text.trim()) return 'Please paste an encrypted message';
    if (!text.trim().startsWith(QUACK_PREFIX)) {
      return 'Cipher must start with Quack://';
    }
    return null;
  }

  async function handleDecrypt() {
    setError(null);
    setPlaintext(null);

    const trimmed = ciphertext.trim();
    const validationError = validateCipher(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!selectedKeyId) {
      setError('Please select a key');
      return;
    }

    setIsDecrypting(true);
    try {
      const key = vaultData.keys.find(k => k.id === selectedKeyId);
      if (!key) {
        setError('Key not found');
        return;
      }

      const aesKey = await importAESKey(key.aesKeyMaterial);
      const decrypted = await decryptMessage(trimmed, aesKey);

      if (decrypted === null) {
        setError('Could not decrypt with the selected key');
        return;
      }

      setPlaintext(decrypted);
    } catch (e) {
      console.error('Manual decrypt failed', e);
      setError('Decryption failed. Please try again.');
    } finally {
      setIsDecrypting(false);
    }
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
        <h1 className="text-xl font-bold text-gray-900">Decrypt Message</h1>
        <div className="w-16" />
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
          <p className="text-blue-700 text-sm">
            Paste a Quack cipher, select a key, and view the plaintext. Nothing
            is auto-copied.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Encrypted message
          </label>
          <textarea
            value={ciphertext}
            onChange={(e) => setCiphertext(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none resize-none"
            placeholder="Quack://..."
            rows={4}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Decrypt with key
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
              <strong>⚠️ No keys:</strong> Generate a key in your dashboard
              before decrypting.
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {plaintext && (
          <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
            <p className="text-xs uppercase text-gray-500 font-semibold mb-2">
              Decrypted text
            </p>
            <p className="text-gray-900 whitespace-pre-wrap break-words">
              {plaintext}
            </p>
          </div>
        )}

        <button
          onClick={handleDecrypt}
          disabled={isDecrypting || vaultData.keys.length === 0}
          className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isDecrypting ? '⏳ Decrypting...' : '🔓 Decrypt'}
        </button>
      </div>
    </div>
  );
}

export default ManualDecryptScreen;
