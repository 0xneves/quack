import { useState } from 'react';
import type { VaultData } from '@/types';
import { generatePersonalKey, addKeyToVault, exportPublicKey } from '@/storage/vault';

interface OnboardingScreenProps {
  vaultData: VaultData;
  onVaultUpdate: (vault: VaultData) => void;
  onComplete: () => void;
  onImport?: () => void;
}

type Step = 'welcome' | 'generate-identity' | 'share-key' | 'complete';

function OnboardingScreen({ vaultData, onVaultUpdate, onComplete, onImport }: OnboardingScreenProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [identityName, setIdentityName] = useState('Personal');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedKeyString, setGeneratedKeyString] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  async function handleGenerateIdentity() {
    const genId = Math.random().toString(36).substring(7);
    console.log(`🔑 [OnboardingScreen.handleGenerateIdentity:${genId}] START`);
    
    if (!identityName.trim()) {
      alert('Please enter a name for your identity');
      return;
    }

    setIsGenerating(true);
    
    try {
      console.log(`🔑 [OnboardingScreen.handleGenerateIdentity:${genId}] Current vaultData - keys: ${vaultData.keys.length}, groups: ${vaultData.groups.length}`);
      
      console.log(`🔑 [OnboardingScreen.handleGenerateIdentity:${genId}] Generating key...`);
      const key = await generatePersonalKey(identityName);
      console.log(`🔑 [OnboardingScreen.handleGenerateIdentity:${genId}] Key generated - id: ${key.id}`);
      
      console.log(`🔑 [OnboardingScreen.handleGenerateIdentity:${genId}] Adding key to vault...`);
      const updatedVault = await addKeyToVault(key, vaultData);
      console.log(`🔑 [OnboardingScreen.handleGenerateIdentity:${genId}] Updated vault - keys: ${updatedVault.keys.length}, groups: ${updatedVault.groups.length}`);
      
      console.log(`🔑 [OnboardingScreen.handleGenerateIdentity:${genId}] Calling onVaultUpdate...`);
      onVaultUpdate(updatedVault);
      
      // Get the public key string for sharing
      const keyString = exportPublicKey(key);
      setGeneratedKeyString(keyString);
      
      console.log(`🔑 [OnboardingScreen.handleGenerateIdentity:${genId}] SUCCESS - going to share-key step`);
      setStep('share-key');
    } catch (error) {
      console.error(`🔑 [OnboardingScreen.handleGenerateIdentity:${genId}] FAILED:`, error);
      alert('Failed to generate identity. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyToClipboard() {
    if (!generatedKeyString) return;
    await navigator.clipboard.writeText(generatedKeyString);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  // ============================================================================
  // STEP: Welcome
  // ============================================================================
  if (step === 'welcome') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-quack-50 to-white p-6 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-7xl mb-6 animate-bounce">🦆</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Welcome to Quack!</h1>
          <p className="text-gray-600 mb-2 max-w-sm">
            Encrypt your messages anywhere with <strong>post-quantum security</strong> - X, YouTube, Reddit, DMs, no platform switching required.
          </p>
          
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8 max-w-sm">
            <h3 className="font-bold text-gray-900 mb-3">Here's how it works:</h3>
            <div className="space-y-3 text-left">
              <div className="flex items-start gap-3">
                <span className="text-quack-500 font-bold">1.</span>
                <span className="text-gray-600">Create your identity (a secure keypair)</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-quack-500 font-bold">2.</span>
                <span className="text-gray-600">Share your public key with friends</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-quack-500 font-bold">3.</span>
                <span className="text-gray-600">Create groups and start encrypting!</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setStep('generate-identity')}
            className="w-full max-w-sm bg-quack-500 hover:bg-quack-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200 shadow-lg"
          >
            Let's Get Started →
          </button>
          
          {onImport && (
            <button
              onClick={onImport}
              className="w-full max-w-sm mt-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-xl transition duration-200"
            >
              📥 Restore from Backup
            </button>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // STEP: Generate Identity
  // ============================================================================
  if (step === 'generate-identity') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white p-6 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-6xl mb-6">🔐</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            Generate Your Identity
          </h1>
          <p className="text-gray-600 text-center mb-6 max-w-sm">
            Your identity is a cryptographic keypair. The private key stays on your device — 
            only the public key gets shared.
          </p>
          
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Identity Name
            </label>
            <input
              type="text"
              value={identityName}
              onChange={(e) => setIdentityName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
              placeholder="e.g. Personal, Work"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-2">
              This helps you identify your key if you have multiple identities.
            </p>
          </div>

          {/* Security info box */}
          <div className="bg-purple-50 border-l-4 border-purple-400 p-4 mb-6 max-w-sm">
            <p className="text-purple-700 text-sm">
              <strong>🛡️ Post-Quantum Security:</strong> Your keys use ML-KEM-768 (Kyber), 
              a NIST-standard algorithm that protects against future quantum computers.
            </p>
          </div>

          <div className="flex gap-3 w-full max-w-sm">
            <button
              onClick={() => setStep('welcome')}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
              disabled={isGenerating}
            >
              ← Back
            </button>
            <button
              onClick={handleGenerateIdentity}
              className="flex-1 bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
              disabled={isGenerating}
            >
              {isGenerating ? '⏳ Generating...' : '🔑 Generate'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // STEP: Share Key
  // ============================================================================
  if (step === 'share-key') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white p-6 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="text-6xl mb-6">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            Identity Created!
          </h1>
          <p className="text-gray-600 text-center mb-6 max-w-sm">
            Share your public key with friends so they can invite you to encrypted groups.
          </p>
          
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Public Key
            </label>
            <div className="bg-gray-100 p-3 rounded-lg mb-3">
              <p className="font-mono text-xs break-all text-gray-700">
                {generatedKeyString}
              </p>
            </div>
            <button
              onClick={copyToClipboard}
              className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200"
            >
              {copySuccess ? '✅ Copied!' : '📋 Copy Public Key'}
            </button>
          </div>

          {/* Info box */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 max-w-sm">
            <p className="text-blue-700 text-sm">
              <strong>💡 How to share:</strong> Send this key to friends via a secure channel 
              (Signal, in-person, etc.). They'll add you as a contact and can then invite you 
              to encrypted groups.
            </p>
          </div>

          <button
            onClick={() => setStep('complete')}
            className="w-full max-w-sm bg-quack-500 hover:bg-quack-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200 shadow-lg"
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // STEP: Complete
  // ============================================================================
  if (step === 'complete') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-quack-50 to-white p-6 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="text-7xl mb-6">🎉</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">You're Ready!</h1>
          <p className="text-gray-600 mb-8 max-w-sm">
            Your identity is set up. Now you can create groups, invite friends, 
            and start encrypting messages anywhere on the web.
          </p>
          
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8 max-w-sm w-full">
            <h3 className="font-bold text-gray-900 mb-4">What's Next?</h3>
            <div className="space-y-4 text-left">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📩</span>
                <div>
                  <p className="font-medium text-gray-900">Got an invitation?</p>
                  <p className="text-sm text-gray-600">Go to Groups → Join to paste it</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">➕</span>
                <div>
                  <p className="font-medium text-gray-900">Starting a group?</p>
                  <p className="text-sm text-gray-600">Create a group, add contacts, invite them</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">✍️</span>
                <div>
                  <p className="font-medium text-gray-900">Ready to encrypt?</p>
                  <p className="text-sm text-gray-600">Type <code className="bg-gray-100 px-1 rounded">Quack://</code> anywhere!</p>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={onComplete}
            className="w-full max-w-sm bg-quack-500 hover:bg-quack-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200 shadow-lg"
          >
            Go to Dashboard 🦆
          </button>
        </div>
      </div>
    );
  }

  return null;
}

export default OnboardingScreen;
