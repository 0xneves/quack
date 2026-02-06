import { useState, useEffect } from 'react';
import { vaultExists, unlockVault, createVault, saveVault } from '@/storage/vault';
import { getSession, markVaultUnlocked, markVaultLocked } from '@/storage/settings';
import type { VaultData } from '@/types';
import SetupScreen from './screens/SetupScreen';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import SecureComposeScreen from './screens/SecureComposeScreen';
import ManualDecryptScreen from './screens/ManualDecryptScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ConnectFlowScreen from './screens/ConnectFlowScreen';
import SettingsScreen from './screens/SettingsScreen';
import ImportScreen from './screens/ImportScreen';

type Screen = 'loading' | 'setup' | 'login' | 'dashboard' | 'compose' | 'decrypt' | 'onboarding' | 'connect' | 'settings' | 'import' | 'import-fresh';

function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const [masterPassword, setMasterPassword] = useState<string>('');

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    const initId = Math.random().toString(36).substring(7);
    console.log(`🚀 [initialize:${initId}] START`);
    
    // Check if vault exists
    const exists = await vaultExists();
    console.log(`🚀 [initialize:${initId}] Vault exists: ${exists}`);
    
    if (!exists) {
      console.log(`🚀 [initialize:${initId}] No vault, going to setup`);
      setScreen('setup');
      return;
    }
    
    // Check if already unlocked
    const session = await getSession();
    console.log(`🚀 [initialize:${initId}] Session unlocked: ${session.unlocked}`);
    
    if (session.unlocked) {
      // Try to pull cached vault data from background (no password prompt)
      try {
        console.log(`🚀 [initialize:${initId}] Requesting cached vault from background...`);
        const resp = await chrome.runtime.sendMessage({ type: 'GET_VAULT_DATA' });
        console.log(`🚀 [initialize:${initId}] Background response:`, resp ? 'got response' : 'null');
        
        if (resp?.vault) {
          const vault = resp.vault as VaultData;
          console.log(`🚀 [initialize:${initId}] Cached vault - keys: ${vault.keys?.length}, groups: ${vault.groups?.length}`);
          console.log(`🚀 [initialize:${initId}] Cached group IDs:`, vault.groups?.map(g => ({ id: g.id, name: g.name })));
          setVaultData(vault);
          setScreen('dashboard');
          return;
        } else {
          console.log(`🚀 [initialize:${initId}] No vault in response, fallback to login`);
        }
      } catch (e) {
        console.warn(`🚀 [initialize:${initId}] Could not retrieve cached vault, fallback to login`, e);
      }
    }
    console.log(`🚀 [initialize:${initId}] Going to login screen`);
    setScreen('login');
  }

  async function handleSetup(password: string) {
    const setupId = Math.random().toString(36).substring(7);
    console.log(`🎬 [handleSetup:${setupId}] START`);
    
    try {
      console.log(`🎬 [handleSetup:${setupId}] Creating vault...`);
      await createVault(password);
      
      console.log(`🎬 [handleSetup:${setupId}] Setting master password in state`);
      setMasterPassword(password);
      
      const emptyVault: VaultData = { keys: [], groups: [] };
      console.log(`🎬 [handleSetup:${setupId}] Setting empty vault in state`);
      setVaultData(emptyVault);
      
      console.log(`🎬 [handleSetup:${setupId}] Marking vault unlocked`);
      await markVaultUnlocked();
      
      console.log(`🎬 [handleSetup:${setupId}] Caching in background...`);
      await cacheVaultInBackground(emptyVault, password);
      
      console.log(`🎬 [handleSetup:${setupId}] SUCCESS - going to onboarding`);
      // New vault = needs onboarding
      setScreen('onboarding');
    } catch (error) {
      console.error(`🎬 [handleSetup:${setupId}] FAILED:`, error);
      alert('Failed to create vault. Please try again.');
    }
  }

  async function handleLogin(password: string) {
    const loginId = Math.random().toString(36).substring(7);
    console.log(`🔐 [handleLogin:${loginId}] START`);
    
    try {
      console.log(`🔐 [handleLogin:${loginId}] Calling unlockVault...`);
      const data = await unlockVault(password);
      if (!data) {
        console.log(`🔐 [handleLogin:${loginId}] unlockVault returned null (wrong password)`);
        alert('Incorrect password');
        return;
      }
      
      console.log(`🔐 [handleLogin:${loginId}] unlockVault returned - keys: ${data.keys.length}, groups: ${data.groups.length}`);
      console.log(`🔐 [handleLogin:${loginId}] Group IDs from storage:`, data.groups.map(g => ({ id: g.id, name: g.name })));
      
      setMasterPassword(password);
      setVaultData(data);
      await markVaultUnlocked();
      
      // Cache vault in background script
      console.log(`🔐 [handleLogin:${loginId}] Caching in background...`);
      await cacheVaultInBackground(data, password);
      
      console.log(`🔐 [handleLogin:${loginId}] SUCCESS - going to dashboard`);
      setScreen('dashboard');
    } catch (error) {
      console.error(`🔐 [handleLogin:${loginId}] FAILED:`, error);
      alert('Failed to unlock vault. Please try again.');
    }
  }

  async function cacheVaultInBackground(_data: VaultData, _password: string) {
    const cacheId = Math.random().toString(36).substring(7);
    console.log(`📤 [cacheVaultInBackground:${cacheId}] START - Sending CACHE_VAULT to background`);
    console.log(`📤 [cacheVaultInBackground:${cacheId}] Current local state - keys: ${_data.keys.length}, groups: ${_data.groups.length}`);
    console.log(`📤 [cacheVaultInBackground:${cacheId}] Group IDs in local state:`, _data.groups.map(g => ({ id: g.id, name: g.name })));
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CACHE_VAULT',
        payload: { masterPassword: _password },
      });
      console.log(`📤 [cacheVaultInBackground:${cacheId}] Response from background:`, response);
    } catch (err) {
      console.error(`📤 [cacheVaultInBackground:${cacheId}] FAILED:`, err);
    }
  }

  async function handleLock() {
    console.log(`🔒 [handleLock] Locking vault...`);
    console.log(`🔒 [handleLock] Current state before lock - keys: ${vaultData?.keys?.length}, groups: ${vaultData?.groups?.length}`);
    await markVaultLocked();
    setVaultData(null);
    setMasterPassword('');
    setScreen('login');
    console.log(`🔒 [handleLock] Vault locked, going to login`);
  }

  function handleCompose() {
    setScreen('compose');
  }

  function handleDecrypt() {
    setScreen('decrypt');
  }

  function handleConnect() {
    setScreen('connect');
  }

  function handleSettings() {
    setScreen('settings');
  }

  function handleImport() {
    setScreen('import');
  }

  async function handleSetupAndImport(password: string) {
    const setupId = Math.random().toString(36).substring(7);
    console.log(`🎬 [handleSetupAndImport:${setupId}] START`);
    
    try {
      console.log(`🎬 [handleSetupAndImport:${setupId}] Creating vault...`);
      await createVault(password);
      
      console.log(`🎬 [handleSetupAndImport:${setupId}] Setting master password in state`);
      setMasterPassword(password);
      
      const emptyVault: VaultData = { keys: [], groups: [] };
      console.log(`🎬 [handleSetupAndImport:${setupId}] Setting empty vault in state`);
      setVaultData(emptyVault);
      
      console.log(`🎬 [handleSetupAndImport:${setupId}] Marking vault unlocked`);
      await markVaultUnlocked();
      
      console.log(`🎬 [handleSetupAndImport:${setupId}] Caching in background...`);
      await cacheVaultInBackground(emptyVault, password);
      
      console.log(`🎬 [handleSetupAndImport:${setupId}] SUCCESS - going to import-fresh`);
      setScreen('import-fresh');
    } catch (error) {
      console.error(`🎬 [handleSetupAndImport:${setupId}] FAILED:`, error);
      alert('Failed to create vault. Please try again.');
    }
  }

  function handleBackToDashboard() {
    setScreen('dashboard');
  }

  async function handleImportComplete(newVault: VaultData) {
    setVaultData(newVault);
    // Save to storage
    await saveVault(newVault, masterPassword);
    // Update background cache
    await cacheVaultInBackground(newVault, masterPassword);
    setScreen('dashboard');
  }

  async function handleImportFreshComplete(newVault: VaultData) {
    setVaultData(newVault);
    // Save to storage
    await saveVault(newVault, masterPassword);
    // Update background cache
    await cacheVaultInBackground(newVault, masterPassword);
    // Go directly to dashboard since they have restored keys
    setScreen('dashboard');
  }

  function handleOnboardingComplete() {
    setScreen('dashboard');
  }

  async function handleVaultUpdate(updatedVault: VaultData) {
    const updateId = Math.random().toString(36).substring(7);
    console.log(`📝 [handleVaultUpdate:${updateId}] START`);
    console.log(`📝 [handleVaultUpdate:${updateId}] Incoming vault - keys: ${updatedVault.keys.length}, groups: ${updatedVault.groups.length}`);
    console.log(`📝 [handleVaultUpdate:${updateId}] Group IDs:`, updatedVault.groups.map(g => ({ id: g.id, name: g.name })));
    console.log(`📝 [handleVaultUpdate:${updateId}] Current state - keys: ${vaultData?.keys?.length}, groups: ${vaultData?.groups?.length}`);
    
    try {
      // Save to storage FIRST before updating UI state
      console.log(`📝 [handleVaultUpdate:${updateId}] Step 1: Calling saveVault...`);
      const { saveVault } = await import('@/storage/vault');
      await saveVault(updatedVault, masterPassword);
      console.log(`📝 [handleVaultUpdate:${updateId}] saveVault completed successfully`);
      
      // Only update state after successful save
      console.log(`📝 [handleVaultUpdate:${updateId}] Step 2: Updating React state...`);
      setVaultData(updatedVault);
      
      // Update background cache
      console.log(`📝 [handleVaultUpdate:${updateId}] Step 3: Updating background cache...`);
      await cacheVaultInBackground(updatedVault, masterPassword);
      
      console.log(`📝 [handleVaultUpdate:${updateId}] SUCCESS - all steps completed`);
    } catch (error) {
      console.error(`📝 [handleVaultUpdate:${updateId}] FAILED:`, error);
      alert('⚠️ Failed to save changes. Please try again. If this persists, export your vault backup from Settings.');
      // Don't update UI state if save failed - keep showing old data
    }
  }

  if (screen === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">🦆</div>
          <div className="text-gray-600">Loading Quack...</div>
        </div>
      </div>
    );
  }

  if (screen === 'setup') {
    return <SetupScreen onSetup={handleSetup} onSetupAndImport={handleSetupAndImport} />;
  }

  if (screen === 'login') {
    return <LoginScreen onLogin={handleLogin} />;
  }

  if (screen === 'compose' && vaultData) {
    return (
      <SecureComposeScreen
        vaultData={vaultData}
        onBack={handleBackToDashboard}
      />
    );
  }

  if (screen === 'decrypt' && vaultData) {
    return (
      <ManualDecryptScreen
        vaultData={vaultData}
        onBack={handleBackToDashboard}
      />
    );
  }

  if (screen === 'onboarding' && vaultData) {
    return (
      <OnboardingScreen
        vaultData={vaultData}
        onVaultUpdate={handleVaultUpdate}
        onComplete={handleOnboardingComplete}
      />
    );
  }

  if (screen === 'import-fresh' && vaultData) {
    return (
      <ImportScreen
        vaultData={vaultData}
        onComplete={handleImportFreshComplete}
        onBack={() => setScreen('onboarding')}
        isFreshInstall={true}
      />
    );
  }

  if (screen === 'connect' && vaultData) {
    return (
      <ConnectFlowScreen
        vaultData={vaultData}
        onVaultUpdate={handleVaultUpdate}
        onBack={handleBackToDashboard}
      />
    );
  }

  if (screen === 'settings' && vaultData) {
    return (
      <SettingsScreen
        vaultData={vaultData}
        onBack={handleBackToDashboard}
        onImport={handleImport}
      />
    );
  }

  if (screen === 'import' && vaultData) {
    return (
      <ImportScreen
        vaultData={vaultData}
        onComplete={handleImportComplete}
        onBack={handleSettings}
      />
    );
  }

  if (screen === 'dashboard' && vaultData) {
    return (
      <DashboardScreen
        vaultData={vaultData}
        onVaultUpdate={handleVaultUpdate}
        onLock={handleLock}
        onCompose={handleCompose}
        onDecrypt={handleDecrypt}
        onConnect={handleConnect}
        onSettings={handleSettings}
      />
    );
  }

  return null;
}

export default App;

