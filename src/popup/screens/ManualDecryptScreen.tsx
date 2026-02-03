import { useState } from 'react';
import type { VaultData } from '@/types';
import { getPersonalKeys } from '@/storage/vault';
import { decryptMessage, isQuackMessage } from '@/crypto/message';

interface ManualDecryptScreenProps {
  vaultData: VaultData;
  onBack: () => void;
}

function ManualDecryptScreen({ vaultData, onBack }: ManualDecryptScreenProps) {
  const [ciphertext, setCiphertext] = useState('');
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [decryptedWith, setDecryptedWith] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const personalKeys = getPersonalKeys(vaultData);

  function validateCipher(text: string) {
    if (!text.trim()) return 'Please paste an encrypted message';
    if (!isQuackMessage(text.trim())) {
      return 'Message must start with Quack://MSG:';
    }
    return null;
  }

  async function handleDecrypt() {
    setError(null);
    setPlaintext(null);
    setDecryptedWith(null);

    const trimmed = ciphertext.trim();
    const validationError = validateCipher(trimmed);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (personalKeys.length === 0) {
      setError('No identity keys available. Generate one first.');
      return;
    }

    setIsDecrypting(true);
    try {
      const result = await decryptMessage(trimmed, personalKeys);

      if (result === null) {
        setError('Could not decrypt. This message may not be addressed to you, or your key has changed.');
        return;
      }

      setPlaintext(result.plaintext);
      const key = personalKeys.find(k => k.id === result.keyId);
      setDecryptedWith(key?.name || 'Unknown key');
    } catch (e) {
      console.error('Manual decrypt failed', e);
      setError('Decryption failed. The message may be corrupted.');
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
            Paste an encrypted message (Quack://MSG:...) to decrypt it with your identity key.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Encrypted message
          </label>
          <textarea
            value={ciphertext}
            onChange={(e) => setCiphertext(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none resize-none font-mono text-sm"
            placeholder="Quack://MSG:..."
            rows={5}
          />
        </div>

        {personalKeys.length === 0 && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <p className="text-yellow-700 text-sm">
              <strong>⚠️ No identity:</strong> Generate an identity key in your dashboard
              before decrypting messages.
            </p>
          </div>
        )}

        {personalKeys.length > 0 && (
          <div className="text-sm text-gray-600">
            Will try to decrypt with: {personalKeys.map(k => k.name).join(', ')}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-3 text-red-700 text-sm">
            {error}
          </div>
        )}

        {plaintext && (
          <div className="bg-white rounded-lg shadow p-4 border border-green-200">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs uppercase text-gray-500 font-semibold">
                Decrypted text
              </p>
              {decryptedWith && (
                <p className="text-xs text-green-600">
                  ✓ Decrypted with: {decryptedWith}
                </p>
              )}
            </div>
            <p className="text-gray-900 whitespace-pre-wrap break-words">
              {plaintext}
            </p>
          </div>
        )}

        <button
          onClick={handleDecrypt}
          disabled={isDecrypting || personalKeys.length === 0}
          className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isDecrypting ? '⏳ Decrypting...' : '🔓 Decrypt'}
        </button>
      </div>
    </div>
  );
}

export default ManualDecryptScreen;
