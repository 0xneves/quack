import { useState } from 'react';
import type { VaultData, QuackKey, QuackGroup, ContactKey } from '@/types';
import { isContactKey } from '@/types';
import { 
  exportPublicKey, 
  parseKeyString, 
  createContactKey, 
  addKeyToVault,
  createGroup,
  addGroupToVault,
  getPersonalKeys
} from '@/storage/vault';
import { createGroupInvitation } from '@/crypto/group';

interface ConnectFlowScreenProps {
  vaultData: VaultData;
  onVaultUpdate: (vault: VaultData) => void;
  onBack: () => void;
}

type Mode = 'choose' | 'alice' | 'bob';
type AliceStep = 'share-key' | 'add-contact' | 'create-group' | 'invite' | 'done';
type BobStep = 'add-contact' | 'share-key' | 'wait-invite' | 'done';

const GROUP_EMOJIS = ['🦆', '🔐', '👥', '🏠', '💼', '🎮', '🎵', '📚', '🌟', '💬', '🔒', '🛡️'];

function ConnectFlowScreen({ vaultData, onVaultUpdate, onBack }: ConnectFlowScreenProps) {
  const [mode, setMode] = useState<Mode>('choose');
  
  // Alice state
  const [aliceStep, setAliceStep] = useState<AliceStep>('share-key');
  const [contactName, setContactName] = useState('');
  const [contactKeyString, setContactKeyString] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState('🦆');
  const [createdGroup, setCreatedGroup] = useState<QuackGroup | null>(null);
  const [createdContact, setCreatedContact] = useState<QuackKey | null>(null);
  const [generatedInvite, setGeneratedInvite] = useState<string | null>(null);
  
  // Bob state
  const [bobStep, setBobStep] = useState<BobStep>('add-contact');
  
  // Shared state
  const [isProcessing, setIsProcessing] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const personalKeys = getPersonalKeys(vaultData);
  const myPublicKey = personalKeys.length > 0 ? exportPublicKey(personalKeys[0]) : null;

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }

  // ============================================================================
  // Alice Handlers
  // ============================================================================

  async function handleAliceAddContact() {
    if (!contactName.trim()) {
      alert('Please enter a name for your contact');
      return;
    }
    if (!contactKeyString.trim()) {
      alert('Please paste their public key');
      return;
    }

    const parsed = parseKeyString(contactKeyString);
    if (!parsed) {
      alert('Invalid key format. Expected: Quack://KEY:...');
      return;
    }

    setIsProcessing(true);
    try {
      const contact = await createContactKey(contactName, parsed.publicKey);
      const updatedVault = await addKeyToVault(contact, vaultData);
      await onVaultUpdate(updatedVault);
      setCreatedContact(contact);
      setAliceStep('create-group');
    } catch (error: any) {
      alert(error.message || 'Failed to add contact');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleAliceCreateGroup() {
    if (!newGroupName.trim()) {
      alert('Please enter a group name');
      return;
    }

    setIsProcessing(true);
    try {
      const primaryKey = personalKeys[0];
      const group = await createGroup(
        newGroupName,
        newGroupEmoji,
        undefined,
        primaryKey?.fingerprint
      );
      const updatedVault = await addGroupToVault(group, vaultData);
      await onVaultUpdate(updatedVault);
      setCreatedGroup(group);
      setAliceStep('invite');
    } catch (error: any) {
      alert(error.message || 'Failed to create group');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleAliceGenerateInvite() {
    if (!createdGroup || !createdContact) return;
    if (!isContactKey(createdContact)) return;

    setIsProcessing(true);
    try {
      const primaryKey = personalKeys[0];
      const invitation = await createGroupInvitation(
        createdGroup,
        createdContact as ContactKey,
        primaryKey?.shortFingerprint,
        `Welcome to ${createdGroup.name}!`
      );
      setGeneratedInvite(invitation);
      await navigator.clipboard.writeText(invitation);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error: any) {
      alert(error.message || 'Failed to generate invitation');
    } finally {
      setIsProcessing(false);
    }
  }

  // ============================================================================
  // Bob Handlers
  // ============================================================================

  async function handleBobAddContact() {
    if (!contactName.trim()) {
      alert('Please enter their name');
      return;
    }
    if (!contactKeyString.trim()) {
      alert('Please paste their public key');
      return;
    }

    const parsed = parseKeyString(contactKeyString);
    if (!parsed) {
      alert('Invalid key format. Expected: Quack://KEY:...');
      return;
    }

    setIsProcessing(true);
    try {
      const contact = await createContactKey(contactName, parsed.publicKey);
      const updatedVault = await addKeyToVault(contact, vaultData);
      await onVaultUpdate(updatedVault);
      setCreatedContact(contact);
      setBobStep('share-key');
    } catch (error: any) {
      alert(error.message || 'Failed to add contact');
    } finally {
      setIsProcessing(false);
    }
  }

  // ============================================================================
  // Render: Mode Selection
  // ============================================================================

  if (mode === 'choose') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="text-6xl mb-6">🤝</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Connect with Someone</h1>
          <p className="text-gray-600 mb-8 max-w-sm">
            Set up a secure encrypted channel with a friend. Who's initiating?
          </p>

          <div className="space-y-4 w-full max-w-sm">
            {/* Alice Mode */}
            <button
              onClick={() => setMode('alice')}
              className="w-full bg-white rounded-xl shadow-lg p-6 text-left hover:shadow-xl transition duration-200 border-2 border-transparent hover:border-quack-300"
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl">👋</span>
                <div>
                  <h3 className="font-bold text-gray-900">"I'm starting the connection"</h3>
                  <p className="text-sm text-gray-600">
                    You'll share your key, add them, create a group, and send an invite
                  </p>
                </div>
              </div>
            </button>

            {/* Bob Mode */}
            <button
              onClick={() => setMode('bob')}
              className="w-full bg-white rounded-xl shadow-lg p-6 text-left hover:shadow-xl transition duration-200 border-2 border-transparent hover:border-quack-300"
            >
              <div className="flex items-center gap-4">
                <span className="text-4xl">📩</span>
                <div>
                  <h3 className="font-bold text-gray-900">"Someone invited me"</h3>
                  <p className="text-sm text-gray-600">
                    You'll share your key with them so they can send you an invitation
                  </p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render: Alice Flow
  // ============================================================================

  if (mode === 'alice') {
    // Step indicator
    const aliceSteps = ['share-key', 'add-contact', 'create-group', 'invite', 'done'];
    const currentAliceIndex = aliceSteps.indexOf(aliceStep);

    return (
      <div className="min-h-screen bg-gradient-to-b from-quack-50 to-white p-6">
        {/* Header with back */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              if (aliceStep === 'share-key') {
                setMode('choose');
              } else {
                const prevIndex = currentAliceIndex - 1;
                if (prevIndex >= 0) {
                  setAliceStep(aliceSteps[prevIndex] as AliceStep);
                }
              }
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
          <span className="text-gray-400 text-sm">
            Step {currentAliceIndex + 1} of {aliceSteps.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {aliceSteps.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full ${
                i <= currentAliceIndex ? 'bg-quack-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* ALICE STEP 1: Share your key */}
        {aliceStep === 'share-key' && (
          <div className="flex flex-col items-center">
            <div className="text-5xl mb-4">📤</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
              Step 1: Share Your Public Key
            </h2>
            <p className="text-gray-600 text-center mb-6 max-w-sm">
              Send your public key to your friend so they can add you as a contact.
            </p>

            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Public Key
              </label>
              <div className="bg-gray-100 p-3 rounded-lg mb-3">
                <p className="font-mono text-xs break-all text-gray-700">
                  {myPublicKey || 'No identity key found'}
                </p>
              </div>
              <button
                onClick={() => myPublicKey && copyToClipboard(myPublicKey)}
                disabled={!myPublicKey}
                className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
              >
                {copySuccess ? '✅ Copied!' : '📋 Copy to Clipboard'}
              </button>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 max-w-sm">
              <p className="text-blue-700 text-sm">
                <strong>💡 Send this via:</strong> Signal, WhatsApp, in-person, or any channel 
                you trust. They'll need it to receive your invitation.
              </p>
            </div>

            <button
              onClick={() => setAliceStep('add-contact')}
              className="w-full max-w-sm bg-quack-500 hover:bg-quack-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200"
            >
              I've shared it → Next
            </button>
          </div>
        )}

        {/* ALICE STEP 2: Add their key */}
        {aliceStep === 'add-contact' && (
          <div className="flex flex-col items-center">
            <div className="text-5xl mb-4">📥</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
              Step 2: Add Their Public Key
            </h2>
            <p className="text-gray-600 text-center mb-6 max-w-sm">
              Paste the public key your friend shared with you.
            </p>

            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mb-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Their Name
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                  placeholder="e.g. Alice, Bob, Mom"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Their Public Key
                </label>
                <textarea
                  value={contactKeyString}
                  onChange={(e) => setContactKeyString(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none h-24 font-mono text-sm"
                  placeholder="Quack://KEY:..."
                />
              </div>
            </div>

            <button
              onClick={handleAliceAddContact}
              disabled={isProcessing || !contactName.trim() || !contactKeyString.trim()}
              className="w-full max-w-sm bg-quack-500 hover:bg-quack-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200 disabled:opacity-50"
            >
              {isProcessing ? '⏳ Adding...' : 'Add Contact → Next'}
            </button>
          </div>
        )}

        {/* ALICE STEP 3: Create group */}
        {aliceStep === 'create-group' && (
          <div className="flex flex-col items-center">
            <div className="text-5xl mb-4">👥</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
              Step 3: Create a Group
            </h2>
            <p className="text-gray-600 text-center mb-6 max-w-sm">
              Groups have a shared encryption key. Anyone in the group can read messages.
            </p>

            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mb-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Group Name
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                  placeholder="e.g. Family, Work Team, Friends"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Emoji
                </label>
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
            </div>

            <button
              onClick={handleAliceCreateGroup}
              disabled={isProcessing || !newGroupName.trim()}
              className="w-full max-w-sm bg-quack-500 hover:bg-quack-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200 disabled:opacity-50"
            >
              {isProcessing ? '⏳ Creating...' : 'Create Group → Next'}
            </button>
          </div>
        )}

        {/* ALICE STEP 4: Generate and send invite */}
        {aliceStep === 'invite' && (
          <div className="flex flex-col items-center">
            <div className="text-5xl mb-4">📩</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
              Step 4: Send the Invitation
            </h2>
            <p className="text-gray-600 text-center mb-6 max-w-sm">
              Generate a secure invitation that only {createdContact?.name} can accept.
            </p>

            {!generatedInvite ? (
              <>
                <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl">{createdGroup?.emoji}</span>
                    <div>
                      <p className="font-bold text-gray-900">{createdGroup?.name}</p>
                      <p className="text-sm text-gray-500">Inviting: {createdContact?.name}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    The invitation is encrypted with their Kyber public key — 
                    only they can decrypt and join.
                  </p>
                </div>

                <button
                  onClick={handleAliceGenerateInvite}
                  disabled={isProcessing}
                  className="w-full max-w-sm bg-quack-500 hover:bg-quack-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200 disabled:opacity-50"
                >
                  {isProcessing ? '⏳ Generating...' : '🔐 Generate Invitation'}
                </button>
              </>
            ) : (
              <>
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 max-w-sm">
                  <p className="text-green-700 font-medium">✅ Invitation Generated & Copied!</p>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Invitation String
                  </label>
                  <div className="bg-gray-100 p-3 rounded-lg mb-3">
                    <p className="font-mono text-xs break-all text-gray-700">
                      {generatedInvite}
                    </p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(generatedInvite)}
                    className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-200"
                  >
                    {copySuccess ? '✅ Copied!' : '📋 Copy Again'}
                  </button>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6 max-w-sm">
                  <p className="text-blue-700 text-sm">
                    <strong>📤 Send this to {createdContact?.name}</strong> via Signal, 
                    WhatsApp, or any secure channel. They'll paste it in Quack to join!
                  </p>
                </div>

                <button
                  onClick={() => setAliceStep('done')}
                  className="w-full max-w-sm bg-quack-500 hover:bg-quack-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200"
                >
                  I've sent it → Done
                </button>
              </>
            )}
          </div>
        )}

        {/* ALICE STEP 5: Done */}
        {aliceStep === 'done' && (
          <div className="flex flex-col items-center text-center">
            <div className="text-7xl mb-6">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Connection Complete!</h2>
            <p className="text-gray-600 mb-8 max-w-sm">
              Once {createdContact?.name} accepts the invitation, you can both encrypt 
              and decrypt messages to the <strong>{createdGroup?.name}</strong> group.
            </p>

            <div className="bg-white rounded-xl shadow-lg p-6 mb-8 max-w-sm w-full">
              <h3 className="font-bold text-gray-900 mb-3">Try it now!</h3>
              <p className="text-gray-600 text-sm mb-4">
                Go to any website, type <code className="bg-gray-100 px-1 rounded">Quack://</code> 
                in a text field, and encrypt a message to your new group.
              </p>
            </div>

            <button
              onClick={onBack}
              className="w-full max-w-sm bg-quack-500 hover:bg-quack-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200"
            >
              Back to Dashboard 🦆
            </button>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // Render: Bob Flow
  // ============================================================================

  if (mode === 'bob') {
    const bobSteps = ['add-contact', 'share-key', 'wait-invite', 'done'];
    const currentBobIndex = bobSteps.indexOf(bobStep);

    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white p-6">
        {/* Header with back */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => {
              if (bobStep === 'add-contact') {
                setMode('choose');
              } else {
                const prevIndex = currentBobIndex - 1;
                if (prevIndex >= 0) {
                  setBobStep(bobSteps[prevIndex] as BobStep);
                }
              }
            }}
            className="text-gray-500 hover:text-gray-700"
          >
            ← Back
          </button>
          <span className="text-gray-400 text-sm">
            Step {currentBobIndex + 1} of {bobSteps.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1 mb-6">
          {bobSteps.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full ${
                i <= currentBobIndex ? 'bg-purple-500' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* BOB STEP 1: Add their key first */}
        {bobStep === 'add-contact' && (
          <div className="flex flex-col items-center">
            <div className="text-5xl mb-4">📥</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
              Step 1: Add Their Public Key
            </h2>
            <p className="text-gray-600 text-center mb-6 max-w-sm">
              Paste the public key that was shared with you.
            </p>

            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mb-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Their Name
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  placeholder="e.g. Alice, Bob"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Their Public Key
                </label>
                <textarea
                  value={contactKeyString}
                  onChange={(e) => setContactKeyString(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none h-24 font-mono text-sm"
                  placeholder="Quack://KEY:..."
                />
              </div>
            </div>

            <button
              onClick={handleBobAddContact}
              disabled={isProcessing || !contactName.trim() || !contactKeyString.trim()}
              className="w-full max-w-sm bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200 disabled:opacity-50"
            >
              {isProcessing ? '⏳ Adding...' : 'Add Contact → Next'}
            </button>
          </div>
        )}

        {/* BOB STEP 2: Share your key */}
        {bobStep === 'share-key' && (
          <div className="flex flex-col items-center">
            <div className="text-5xl mb-4">📤</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
              Step 2: Share Your Public Key
            </h2>
            <p className="text-gray-600 text-center mb-6 max-w-sm">
              Send your public key to {createdContact?.name} so they can invite you to a group.
            </p>

            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Public Key
              </label>
              <div className="bg-gray-100 p-3 rounded-lg mb-3">
                <p className="font-mono text-xs break-all text-gray-700">
                  {myPublicKey || 'No identity key found'}
                </p>
              </div>
              <button
                onClick={() => myPublicKey && copyToClipboard(myPublicKey)}
                disabled={!myPublicKey}
                className="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
              >
                {copySuccess ? '✅ Copied!' : '📋 Copy to Clipboard'}
              </button>
            </div>

            <div className="bg-purple-50 border-l-4 border-purple-400 p-4 mb-6 max-w-sm">
              <p className="text-purple-700 text-sm">
                <strong>📤 Send this to {createdContact?.name}</strong> so they can add you 
                as a contact and send you a group invitation.
              </p>
            </div>

            <button
              onClick={() => setBobStep('wait-invite')}
              className="w-full max-w-sm bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200"
            >
              I've shared it → Next
            </button>
          </div>
        )}

        {/* BOB STEP 3: Wait for invite */}
        {bobStep === 'wait-invite' && (
          <div className="flex flex-col items-center">
            <div className="text-5xl mb-4">⏳</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
              Step 3: Wait for Invitation
            </h2>
            <p className="text-gray-600 text-center mb-6 max-w-sm">
              {createdContact?.name} will create a group and send you an invitation.
            </p>

            <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mb-6">
              <p className="text-gray-600 text-sm mb-4">
                When you receive the invitation (it starts with <code className="bg-gray-100 px-1 rounded">Quack://INV:</code>), 
                you can paste it in the main dashboard:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500 mb-2">Dashboard → Groups → 📩 Join</p>
                <p className="text-xs text-gray-400">Paste your invitation there</p>
              </div>
            </div>

            <button
              onClick={() => setBobStep('done')}
              className="w-full max-w-sm bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200"
            >
              Got it! → Done
            </button>
          </div>
        )}

        {/* BOB STEP 4: Done */}
        {bobStep === 'done' && (
          <div className="flex flex-col items-center text-center">
            <div className="text-7xl mb-6">✅</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">You're All Set!</h2>
            <p className="text-gray-600 mb-8 max-w-sm">
              You've added {createdContact?.name} and shared your key. 
              When they send an invitation, join via <strong>Groups → Join</strong>.
            </p>

            <button
              onClick={onBack}
              className="w-full max-w-sm bg-purple-500 hover:bg-purple-600 text-white font-bold py-4 px-6 rounded-xl transition duration-200"
            >
              Back to Dashboard 🦆
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

export default ConnectFlowScreen;
