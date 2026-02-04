import { useState, useEffect } from 'react';
import { vaultExists, unlockVault, createVault } from '@/storage/vault';
import { getSession, markVaultUnlocked, markVaultLocked } from '@/storage/settings';
import type { VaultData } from '@/types';
import SetupScreen from './screens/SetupScreen';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import SecureComposeScreen from './screens/SecureComposeScreen';
import ManualDecryptScreen from './screens/ManualDecryptScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ConnectFlowScreen from './screens/ConnectFlowScreen';

type Screen = 'loading' | 'setup' | 'login' | 'dashboard' | 'compose' | 'decrypt' | 'onboarding' | 'connect';

function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [vaultData, setVaultData] = useState<VaultData | null>(null);
  const [masterPassword, setMasterPassword] = useState<string>('');

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    // Check if vault exists
    const exists = await vaultExists();
    
    if (!exists) {
      setScreen('setup');
      return;
    }
    
    // Check if already unlocked
    const session = await getSession();
    if (session.unlocked) {
      // Try to pull cached vault data from background (no password prompt)
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'GET_VAULT_DATA' });
        if (resp?.vault) {
          setVaultData(resp.vault as VaultData);
          setScreen('dashboard');
          return;
        }
      } catch (e) {
        console.warn('Could not retrieve cached vault, fallback to login', e);
      }
    }
    setScreen('login');
  }

  async function handleSetup(password: string) {
    try {
      await createVault(password);
      setMasterPassword(password);
      const emptyVault: VaultData = { keys: [], groups: [] };
      setVaultData(emptyVault);
      await markVaultUnlocked();
      await cacheVaultInBackground(emptyVault, password);
      // New vault = needs onboarding
      setScreen('onboarding');
    } catch (error) {
      console.error('Setup failed:', error);
      alert('Failed to create vault. Please try again.');
    }
  }

  async function handleLogin(password: string) {
    try {
      const data = await unlockVault(password);
      if (!data) {
        alert('Incorrect password');
        return;
      }
      
      setMasterPassword(password);
      setVaultData(data);
      await markVaultUnlocked();
      
      // Cache vault in background script
      await cacheVaultInBackground(data, password);
      
      setScreen('dashboard');
    } catch (error) {
      console.error('Login failed:', error);
      alert('Failed to unlock vault. Please try again.');
    }
  }

  async function cacheVaultInBackground(_data: VaultData, _password: string) {
    try {
      await chrome.runtime.sendMessage({
        type: 'CACHE_VAULT',
        payload: { masterPassword: _password },
      });
    } catch (err) {
      console.error('Failed to cache vault in background', err);
    }
  }

  async function handleLock() {
    await markVaultLocked();
    setVaultData(null);
    setMasterPassword('');
    setScreen('login');
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

  function handleBackToDashboard() {
    setScreen('dashboard');
  }

  function handleOnboardingComplete() {
    setScreen('dashboard');
  }

  async function handleVaultUpdate(updatedVault: VaultData) {
    setVaultData(updatedVault);
    // Save to storage
    const { saveVault } = await import('@/storage/vault');
    await saveVault(updatedVault, masterPassword);
    // Update background cache
    await cacheVaultInBackground(updatedVault, masterPassword);
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
    return <SetupScreen onSetup={handleSetup} />;
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

  if (screen === 'connect' && vaultData) {
    return (
      <ConnectFlowScreen
        vaultData={vaultData}
        onVaultUpdate={handleVaultUpdate}
        onBack={handleBackToDashboard}
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
      />
    );
  }

  return null;
}

export default App;

