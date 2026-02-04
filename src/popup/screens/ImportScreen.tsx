import { useState, useRef } from 'react';
import type { VaultData, ExportedVault, ImportItem } from '@/types';
import { 
  parseExportFile, 
  decryptExportFile, 
  buildImportItems, 
  applyImportItems,
  readFileAsText 
} from '@/storage/export';
import { formatDate } from '@/utils/helpers';

interface ImportScreenProps {
  vaultData: VaultData | null;  // null for fresh install
  onComplete: (newVault: VaultData) => void;
  onBack: () => void;
  isFreshInstall?: boolean;
}

type Step = 'select-file' | 'password' | 'checklist' | 'complete';

function ImportScreen({ vaultData, onComplete, onBack, isFreshInstall = false }: ImportScreenProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<Step>('select-file');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // File state
  const [exportData, setExportData] = useState<ExportedVault | null>(null);
  const [password, setPassword] = useState('');
  
  // Import items state
  const [importItems, setImportItems] = useState<ImportItem[]>([]);

  // ============================================================================
  // Step 1: File Selection
  // ============================================================================

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setError(null);
    setIsLoading(true);
    
    try {
      const contents = await readFileAsText(file);
      const parsed = parseExportFile(contents);
      
      if (!parsed) {
        setError('Invalid backup file. Please select a valid Quack backup.');
        return;
      }
      
      setExportData(parsed);
      setStep('password');
    } catch (err) {
      setError('Failed to read file. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  // ============================================================================
  // Step 2: Password Entry
  // ============================================================================

  async function handlePasswordSubmit() {
    if (!exportData || !password) return;
    
    setError(null);
    setIsLoading(true);
    
    try {
      const decrypted = await decryptExportFile(exportData, password);
      
      if (!decrypted) {
        setError('Incorrect password. Please try again.');
        return;
      }
      
      // Build import items with conflict detection
      const items = buildImportItems(decrypted, vaultData);
      setImportItems(items);
      setStep('checklist');
    } catch (err) {
      setError('Failed to decrypt backup. The file may be corrupted.');
    } finally {
      setIsLoading(false);
    }
  }

  // ============================================================================
  // Step 3: Checklist Selection
  // ============================================================================

  function toggleItem(itemId: string) {
    setImportItems(items =>
      items.map(item =>
        item.id === itemId ? { ...item, selected: !item.selected } : item
      )
    );
  }

  function toggleAll(selected: boolean) {
    setImportItems(items =>
      items.map(item => ({ ...item, selected }))
    );
  }

  function handleImport() {
    const selectedCount = importItems.filter(item => item.selected).length;
    if (selectedCount === 0) {
      setError('Please select at least one item to import.');
      return;
    }
    
    const newVault = applyImportItems(importItems, vaultData);
    setStep('complete');
    
    // Slight delay for animation
    setTimeout(() => {
      onComplete(newVault);
    }, 1500);
  }

  // ============================================================================
  // Render Helpers
  // ============================================================================

  function getItemIcon(type: string, emoji?: string): string {
    if (type === 'group' && emoji) return emoji;
    if (type === 'personal') return '🔐';
    if (type === 'contact') return '👤';
    return '👥';
  }

  function getTypeLabel(type: string): string {
    if (type === 'personal') return 'Identity Key';
    if (type === 'contact') return 'Contact';
    return 'Group';
  }

  const selectedCount = importItems.filter(item => item.selected).length;
  const conflictCount = importItems.filter(item => item.hasConflict && item.selected).length;
  const allSelected = importItems.length > 0 && importItems.every(item => item.selected);
  const noneSelected = importItems.every(item => !item.selected);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          {step !== 'complete' && (
            <button
              onClick={() => {
                if (step === 'select-file') {
                  onBack();
                } else if (step === 'password') {
                  setStep('select-file');
                  setExportData(null);
                  setPassword('');
                  setError(null);
                } else if (step === 'checklist') {
                  setStep('password');
                  setImportItems([]);
                  setError(null);
                }
              }}
              className="text-gray-500 hover:text-gray-700 font-medium"
            >
              ← Back
            </button>
          )}
          <h1 className="text-xl font-bold text-gray-900">
            {isFreshInstall ? 'Restore Backup' : 'Import Backup'}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Step 1: Select File */}
        {step === 'select-file' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-6xl mb-4">📂</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Select Backup File</h2>
              <p className="text-gray-600 mb-6">
                Choose a Quack backup file (.json) to restore your keys, contacts, and groups.
              </p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-quack-500 hover:bg-quack-600 text-white font-bold px-8 py-3 rounded-lg transition duration-200"
                disabled={isLoading}
              >
                {isLoading ? 'Reading...' : '📁 Choose File'}
              </button>
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700">{error}</p>
              </div>
            )}
            
            {isFreshInstall && (
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                <p className="text-blue-700 text-sm">
                  <strong>💡 Tip:</strong> After importing, you'll set a new vault password. 
                  This is different from your export password.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Password */}
        {step === 'password' && exportData && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="text-center mb-6">
                <div className="text-4xl mb-2">🔑</div>
                <h2 className="text-xl font-bold text-gray-900">Enter Export Password</h2>
              </div>
              
              {/* Backup info */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="text-sm text-gray-600">
                  <p><strong>Version:</strong> {exportData.quackVersion}</p>
                  <p><strong>Created:</strong> {formatDate(exportData.exportedAt)}</p>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Export Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-quack-500 focus:border-transparent outline-none"
                  placeholder="Enter the password used when exporting"
                  autoFocus
                />
              </div>
              
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}
              
              <button
                onClick={handlePasswordSubmit}
                className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
                disabled={isLoading || !password}
              >
                {isLoading ? 'Decrypting...' : '🔓 Unlock Backup'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Checklist */}
        {step === 'checklist' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  Select Items to Import
                </h2>
                <button
                  onClick={() => toggleAll(!allSelected)}
                  className="text-quack-600 hover:text-quack-700 font-medium text-sm"
                >
                  {allSelected ? '☑️ Deselect All' : '☐ Select All'}
                </button>
              </div>
              
              {/* Summary */}
              <div className="flex gap-4 text-sm text-gray-600 mb-4">
                <span>{selectedCount} of {importItems.length} selected</span>
                {conflictCount > 0 && (
                  <span className="text-orange-600">
                    ⚠️ {conflictCount} conflict{conflictCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              
              {/* Items list */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {importItems.map(item => (
                  <div
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition duration-200 ${
                      item.selected 
                        ? 'bg-quack-50 border border-quack-200' 
                        : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      item.selected 
                        ? 'bg-quack-500 border-quack-500 text-white' 
                        : 'border-gray-300'
                    }`}>
                      {item.selected && '✓'}
                    </div>
                    
                    {/* Icon */}
                    <span className="text-xl">{getItemIcon(item.type, item.emoji)}</span>
                    
                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{item.name}</span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {getTypeLabel(item.type)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-mono truncate">{item.shortFingerprint}</p>
                      
                      {/* Conflict warning */}
                      {item.hasConflict && (
                        <p className="text-xs text-orange-600 mt-1">
                          ⚠️ Exists as "{item.conflictName}" — selecting will replace
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700">{error}</p>
              </div>
            )}
            
            {conflictCount > 0 && (
              <div className="bg-orange-50 border-l-4 border-orange-400 p-4">
                <p className="text-orange-700 text-sm">
                  <strong>⚠️ Conflicts:</strong> {conflictCount} item{conflictCount > 1 ? 's have' : ' has'} the 
                  same fingerprint as existing items. Selecting them will replace the existing entries.
                </p>
              </div>
            )}
            
            <button
              onClick={handleImport}
              className="w-full bg-quack-500 hover:bg-quack-600 text-white font-bold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50"
              disabled={noneSelected}
            >
              📥 Import {selectedCount} Item{selectedCount !== 1 ? 's' : ''}
            </button>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete!</h2>
            <p className="text-gray-600">
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} imported successfully.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ImportScreen;
