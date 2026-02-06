import { useState, useEffect } from 'react';
import { vaultExists, createVault } from '@/storage/vault';
import { markVaultUnlocked } from '@/storage/settings';
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

/**
 * SECURITY MODEL:
 * 
 * - The master password ONLY lives in the background service worker memory.
 * - The popup NEVER stores the password (no React state, no session storage).
 * - All vault write operations go through the background via SAVE_VAULT message.
 * - On lock: background wipes password + decrypted vault from memory.
 * - On popup open: CHECK_AUTH asks background "do you have the password?"
 *   - If yes: proceed (user is authenticated)
 *   - If no: force login (regardless of session flag)
 */
function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [vaultData, setVaultData] = useState<VaultData | null>(null);

  useEffect(() => {
    initialize();
  }, []);

  /**
   * Initialize: Check if background is authenticated (has password in memory).
   * This is the ONLY source of truth for auth state.
   */
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
    
    // Ask background: "Do you have the password?"
    // This is the source of truth - NOT the session flag
    try {
      console.log(`🚀 [initialize:${initId}] Checking auth with background...`);
      const resp = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
      
      if (resp?.authenticated && resp?.vault) {
        const vault = resp.vault as VaultData;
        console.log(`🚀 [initialize:${initId}] Authenticated - keys: ${vault.keys?.length}, groups: ${vault.groups?.length}`);
        setVaultData(vault);
        
        // Check if user has completed onboarding
        const hasPersonalKey = vault.keys?.some(k => k.type === 'personal') ?? false;
        if (!hasPersonalKey) {
          console.log(`🚀 [initialize:${initId}] No personal key, going to onboarding`);
          setScreen('onboarding');
          return;
        }
        
        setScreen('dashboard');
        return;
      }
      
      console.log(`🚀 [initialize:${initId}] Not authenticated, going to login`);
    } catch (e) {
      console.warn(`🚀 [initialize:${initId}] Auth check failed, going to login`, e);
    }
    
    setScreen('login');
  }

  /**
   * Setup: Create new vault, then cache password in background.
   * Password is used briefly here for vault creation, then handed to background.
   */
  async function handleSetup(password: string) {
    const setupId = Math.random().toString(36).substring(7);
    console.log(`🎬 [handleSetup:${setupId}] START`);
    
    try {
      // Create vault on disk
      console.log(`🎬 [handleSetup:${setupId}] Creating vault...`);
      await createVault(password);
      
      // Mark session as unlocked
      await markVaultUnlocked();
      
      // Cache password in background (background becomes the password holder)
      console.log(`🎬 [handleSetup:${setupId}] Caching password in background...`);
      const resp = await chrome.runtime.sendMessage({
        type: 'CACHE_VAULT',
        payload: { masterPassword: password },
      });
      
      if (!resp?.cached) {
        throw new Error('Failed to cache vault in background');
      }
      
      const emptyVault: VaultData = { keys: [], groups: [] };
      setVaultData(emptyVault);
      
      console.log(`🎬 [handleSetup:${setupId}] SUCCESS - going to onboarding`);
      setScreen('onboarding');
    } catch (error) {
      console.error(`🎬 [handleSetup:${setupId}] FAILED:`, error);
      alert('Failed to create vault. Please try again.');
    }
  }

  /**
   * Login: Send password to background, background decrypts + caches everything.
   * Password NEVER stored in popup state.
   */
  async function handleLogin(password: string) {
    const loginId = Math.random().toString(36).substring(7);
    console.log(`🔐 [handleLogin:${loginId}] START`);
    
    try {
      // Send password to background - it handles decryption and caching
      const resp = await chrome.runtime.sendMessage({
        type: 'CACHE_VAULT',
        payload: { masterPassword: password },
      });
      
      if (!resp?.cached || !resp?.vault) {
        console.log(`🔐 [handleLogin:${loginId}] Background returned cached=${resp?.cached}`);
        alert('Incorrect password');
        return;
      }
      
      const vault = resp.vault as VaultData;
      console.log(`🔐 [handleLogin:${loginId}] Background cached vault - keys: ${vault.keys.length}, groups: ${vault.groups.length}`);
      
      // Mark session as unlocked
      await markVaultUnlocked();
      
      // Set local display copy (password stays in background only)
      setVaultData(vault);
      
      // Check if user has completed onboarding
      const hasPersonalKey = vault.keys?.some(k => k.type === 'personal') ?? false;
      if (!hasPersonalKey) {
        console.log(`🔐 [handleLogin:${loginId}] SUCCESS - going to onboarding`);
        setScreen('onboarding');
        return;
      }
      
      console.log(`🔐 [handleLogin:${loginId}] SUCCESS - going to dashboard`);
      setScreen('dashboard');
    } catch (error) {
      console.error(`🔐 [handleLogin:${loginId}] FAILED:`, error);
      alert('Failed to unlock vault. Please try again.');
    }
  }

  /**
   * Lock: Tell background to wipe password + decrypted data.
   * Clear local display copy. Force login.
   */
  async function handleLock() {
    console.log(`🔒 [handleLock] Locking vault...`);
    
    try {
      await chrome.runtime.sendMessage({ type: 'LOCK_VAULT' });
    } catch (e) {
      console.warn('🔒 [handleLock] Lock message failed:', e);
    }
    
    // Clear local display copy
    setVaultData(null);
    setScreen('login');
    console.log(`🔒 [handleLock] Vault locked, all sensitive data wiped`);
  }

  /**
   * Force lock: Called when background reports NOT_AUTHENTICATED.
   * This handles the case where background lost its password (worker restart, etc.)
   */
  function forceLock() {
    console.warn('🔒 [forceLock] Session expired - forcing lock');
    setVaultData(null);
    setScreen('login');
    alert('Session expired. Please log in again.');
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

  /**
   * Setup + Import: Create vault then go to import flow.
   */
  async function handleSetupAndImport(password: string) {
    const setupId = Math.random().toString(36).substring(7);
    console.log(`🎬 [handleSetupAndImport:${setupId}] START`);
    
    try {
      await createVault(password);
      await markVaultUnlocked();
      
      // Cache password in background
      const resp = await chrome.runtime.sendMessage({
        type: 'CACHE_VAULT',
        payload: { masterPassword: password },
      });
      
      if (!resp?.cached) {
        throw new Error('Failed to cache vault in background');
      }
      
      const emptyVault: VaultData = { keys: [], groups: [] };
      setVaultData(emptyVault);
      
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

  /**
   * Import complete: Save imported vault via background.
   */
  async function handleImportComplete(newVault: VaultData) {
    const resp = await chrome.runtime.sendMessage({
      type: 'SAVE_VAULT',
      payload: { vaultData: newVault },
    });
    
    if (resp?.error === 'NOT_AUTHENTICATED') {
      forceLock();
      return;
    }
    
    if (resp?.error) {
      alert(`Failed to save imported data: ${resp.error}`);
      return;
    }
    
    setVaultData(newVault);
    setScreen('dashboard');
  }

  /**
   * Import fresh complete: Save imported vault via background (fresh install path).
   */
  async function handleImportFreshComplete(newVault: VaultData) {
    const resp = await chrome.runtime.sendMessage({
      type: 'SAVE_VAULT',
      payload: { vaultData: newVault },
    });
    
    if (resp?.error === 'NOT_AUTHENTICATED') {
      forceLock();
      return;
    }
    
    if (resp?.error) {
      alert(`Failed to save imported data: ${resp.error}`);
      return;
    }
    
    setVaultData(newVault);
    setScreen('dashboard');
  }

  function handleOnboardingComplete() {
    setScreen('dashboard');
  }

  /**
   * Vault update: All writes go through background (which has the password).
   * If background has lost the password, force lock.
   */
  async function handleVaultUpdate(updatedVault: VaultData) {
    const updateId = Math.random().toString(36).substring(7);
    console.log(`📝 [handleVaultUpdate:${updateId}] START`);
    console.log(`📝 [handleVaultUpdate:${updateId}] Incoming - keys: ${updatedVault.keys.length}, groups: ${updatedVault.groups.length}`);
    
    try {
      // Send to background - it uses cached password to encrypt and save
      const resp = await chrome.runtime.sendMessage({
        type: 'SAVE_VAULT',
        payload: { vaultData: updatedVault },
      });
      
      if (resp?.error === 'NOT_AUTHENTICATED') {
        console.error(`📝 [handleVaultUpdate:${updateId}] NOT_AUTHENTICATED - forcing lock`);
        forceLock();
        return;
      }
      
      if (resp?.error) {
        console.error(`📝 [handleVaultUpdate:${updateId}] Save error: ${resp.error}`);
        alert('Failed to save changes. Please try again. If this persists, export your vault backup from Settings.');
        return;
      }
      
      // Only update local display copy after successful save
      setVaultData(updatedVault);
      console.log(`📝 [handleVaultUpdate:${updateId}] SUCCESS`);
    } catch (error) {
      console.error(`📝 [handleVaultUpdate:${updateId}] FAILED:`, error);
      alert('Failed to save changes. Please try again.');
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
