/**
 * Quack - Content Script
 * 
 * Entry point for the content script. Handles:
 * - Detection of "Quack://" trigger in input fields
 * - DOM scanning for encrypted messages
 * - Auto-decryption of visible messages
 * - Manual decryption via selection
 * - Viewport-based performance optimization
 * 
 * This file orchestrates the modular content script components:
 * - utils.ts: Shared helpers and safe wrappers
 * - notifications.ts: Toast notifications and warnings
 * - overlay-manager.ts: Encrypt/decrypt overlay iframes
 * - inline-highlight.ts: Underlines and hover cards
 * - input-detector.ts: Editable tracking and triggers
 * - dom-scanner.ts: DOM scanning and element processing
 */

import { injectSelectionStyles } from './notifications';
import { setupInputDetection } from './input-detector';
import { setupDOMScanning, rescanPage } from './dom-scanner';

console.log('🦆 Quack content script loaded');

/**
 * Initialize content script
 */
function init(): void {
  // Inject CSS for selection cards and underlines
  injectSelectionStyles();
  
  // Setup input field detection (Quack:// triggers)
  setupInputDetection();
  
  // Setup DOM scanning for encrypted messages
  setupDOMScanning();
  
  console.log('✅ Quack content script initialized');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Listen for vault updates from service worker
 * When keys/groups change, rescan the page for newly decryptable messages
 */
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'VAULT_UPDATED') {
    console.log('🦆 Vault updated, rescanning page for decryptable messages...');
    rescanPage();
  }
});
