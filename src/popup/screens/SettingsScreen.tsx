import { useState, useEffect } from 'react';
import type { VaultData } from '@/types';
import { 
  validateExportPassword, 
  exportVault, 
  downloadExportFile 
} from '@/storage/export';
import { getSettings, saveSettings } from '@/storage/settings';

/** Default minutes when toggling ON */
const DEFAULT_LOCK_MINUTES = 15;

interface SettingsScreenProps {
  vaultData: VaultData;
  onBack: () => void;
  onImport: () => void;
}

function SettingsScreen({ vaultData, onBack, onImport }: SettingsScreenProps) {
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [autoLockTimeout, setAutoLockTimeout] = useState<number>(15);
  const [stealthDecryption, setStealthDecryption] = useState<boolean>(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load current settings on mount
  useEffect(() => {
    getSettings().then(settings => {
      setAutoLockTimeout(settings.autoLockTimeout);
      setStealthDecryption(settings.stealthDecryption ?? true);
      setSettingsLoaded(true);
    });
  }, []);

  async function handleAutoLockChange(value: number) {
    setAutoLockTimeout(value);
    await saveSettings({ autoLockTimeout: value });
  }

  async function handleStealthDecryptionChange(value: boolean) {
    setStealthDecryption(value);
    await saveSettings({ stealthDecryption: value });
  }

  // Stats
  const personalKeys = vaultData.keys.filter(k => k.type === 'personal').length;
  const contacts = vaultData.keys.filter(k => k.type === 'contact').length;
  const groups = vaultData.groups.length;

  async function handleExport() {
    setExportError(null);
    
    // Validate password
    const validation = validateExportPassword(exportPassword);
    if (!validation.valid) {
      setExportError(validation.error || 'Invalid password');
      return;
    }
    
    // Check passwords match
    if (exportPassword !== confirmPassword) {
      setExportError('Passwords do not match');
      return;
    }
    
    setIsExporting(true);
    
    try {
      const exportData = await exportVault(vaultData, exportPassword);
      downloadExportFile(exportData);
      setExportSuccess(true);
      
      // Reset form after success
      setTimeout(() => {
        setShowExportModal(false);
        setExportPassword('');
        setConfirmPassword('');
        setExportSuccess(false);
      }, 2000);
    } catch (error: any) {
      setExportError(error.message || 'Failed to export vault');
    } finally {
      setIsExporting(false);
    }
  }

  function closeExportModal() {
    setShowExportModal(false);
    setExportPassword('');
    setConfirmPassword('');
    setExportError(null);
    setExportSuccess(false);
  }

  // Password strength indicator
  function getPasswordStrength(): { text: string; color: string } {
    const len = exportPassword.length;
    if (len === 0) return { text: '', color: '' };
    if (len < 20) return { text: `${len}/20 characters`, color: 'text-red-500' };
    if (len < 30) return { text: 'Good', color: 'text-yellow-600' };
    return { text: 'Strong', color: 'text-green-600' };
  }

  const strength = getPasswordStrength();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700 font-medium"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Vault Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">📊 Vault Summary</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-purple-50 rounded-lg p-2">
              <div className="text-2xl font-bold text-purple-600">{personalKeys}</div>
              <div className="text-sm text-purple-700">Identities</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-2">
              <div className="text-2xl font-bold text-blue-600">{contacts}</div>
              <div className="text-sm text-blue-700">Contacts</div>
            </div>
            <div className="bg-green-50 rounded-lg p-2">
              <div className="text-2xl font-bold text-green-600">{groups}</div>
              <div className="text-sm text-green-700">Groups</div>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">🔒 Security</h2>

          <div className="space-y-3">
            {/* Row: label + toggle */}
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900 text-sm">Auto-Lock Timer</h3>

              {settingsLoaded && (
                <div
                  className="relative flex items-center rounded-full cursor-pointer select-none"
                  style={{
                    backgroundColor: autoLockTimeout > 0 ? '#f97316' : '#d1d5db',
                    width: '132px',
                    height: '32px',
                  }}
                  onClick={() => {
                    if (autoLockTimeout > 0) {
                      handleAutoLockChange(0);
                    } else {
                      handleAutoLockChange(DEFAULT_LOCK_MINUTES);
                    }
                  }}
                >
                  {/* Sliding thumb */}
                  <div
                    className="absolute rounded-full bg-white shadow-md transition-all duration-300 ease-in-out flex items-center justify-center"
                    style={{
                      width: '50%',
                      top: '3px',
                      bottom: '3px',
                      left: autoLockTimeout > 0 ? '3px' : 'calc(50% - 3px)',
                    }}
                  >
                    <span className="text-xs font-bold text-gray-700">
                      {autoLockTimeout > 0 ? 'ON' : 'OFF'}
                    </span>
                  </div>

                  {/* Right side — minutes input (visible when ON) */}
                  {autoLockTimeout > 0 && (
                    <div
                      className="absolute right-0 top-0 bottom-0 flex items-center justify-center gap-0.5"
                      style={{ width: '50%' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        inputMode="numeric"
                        value={autoLockTimeout}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          const num = Math.min(Number(raw) || 0, 999);
                          setAutoLockTimeout(num);
                        }}
                        onBlur={() => {
                          const final = autoLockTimeout < 1 ? DEFAULT_LOCK_MINUTES : autoLockTimeout;
                          handleAutoLockChange(final);
                        }}
                        className="bg-transparent text-white font-bold text-sm text-center outline-none"
                        style={{ width: '36px' }}
                        maxLength={3}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500">
              {autoLockTimeout > 0
                ? `Vault locks after ${autoLockTimeout} min of inactivity when the popup is closed.`
                : 'Vault stays unlocked until you lock manually or close the browser.'}
            </p>
          </div>

          {/* Stealth Decryption Toggle */}
          <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900 text-sm">🥷 Stealth Decryption</h3>

              {settingsLoaded && (
                <button
                  onClick={() => handleStealthDecryptionChange(!stealthDecryption)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                    stealthDecryption ? 'bg-purple-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                      stealthDecryption ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              )}
            </div>

            <p className="text-xs text-gray-500">
              {stealthDecryption
                ? 'Stealth messages (hidden recipient) will be decrypted by trying all your keys. Slightly slower but provides maximum privacy.'
                : 'Stealth messages will be ignored. Enable to decrypt messages where the sender hid the recipient fingerprint.'}
            </p>
          </div>
        </div>

        {/* Export/Import Section */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">💾 Backup & Restore</h2>
          
          <div className="space-y-4">
            {/* Export */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Export Vault</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Download an encrypted backup of all your keys, contacts, and groups.
                  </p>
                </div>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="bg-quack-500 hover:bg-quack-600 text-white font-bold px-4 py-2 rounded-lg transition duration-200"
                >
                  📤 Export
                </button>
              </div>
            </div>

            {/* Import */}
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-gray-900">Import Backup</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Restore keys, contacts, and groups from a previous backup.
                  </p>
                </div>
                <button
                  onClick={onImport}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold px-4 py-2 rounded-lg transition duration-200"
                >
                  📥 Import
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Version Info */}
        <div className="text-center text-gray-500 text-sm">
          <p>🦆 Quack! v1.0.0</p>
          <p className="mt-1">Quack-quantum encryption for everyone</p>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
            {!exportSuccess ? (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Export Vault</h2>
                <p className="text-gray-600 text-sm mb-4">
                  Your vault will be encrypted with this password. You'll need it to restore the backup.
                </p>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Export Password
                  </label>
                  <input
                    type="password"
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                    placeholder="At least 20 characters (letters/numbers only)"
                    autoFocus
                  />
                  {strength.text && (
                    <p className={`text-sm mt-1 ${strength.color}`}>{strength.text}</p>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                    placeholder="Re-enter password"
                  />
                  {confirmPassword && exportPassword !== confirmPassword && (
                    <p className="text-sm mt-1 text-red-500">Passwords do not match</p>
                  )}
                </div>

                {exportError && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-700 text-sm">{exportError}</p>
                  </div>
                )}

                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                  <p className="text-yellow-700 text-sm">
                    <strong>⚠️ Important:</strong> Remember this password! It's different from your vault password and cannot be recovered.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={closeExportModal}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-4 rounded-lg transition duration-200"
                    disabled={isExporting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExport}
                    className="flex-1 bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
                    disabled={isExporting || exportPassword.length < 20 || exportPassword !== confirmPassword}
                  >
                    {isExporting ? 'Exporting...' : '📤 Export'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">✅</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Export Complete!</h2>
                <p className="text-gray-600">Your backup has been downloaded.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsScreen;
