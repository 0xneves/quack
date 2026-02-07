/**
 * Quack - Content Script
 * 
 * Entry point for the content script. Handles:
 * - Detection of "Quack://" trigger in input fields
 * - SECURE DOM scanning for encrypted messages (plaintext NEVER touches page DOM)
 * - Display of decrypted content in extension-controlled UI only
 * - Viewport-based performance optimization
 * 
 * This file orchestrates the modular content script components:
 * - utils.ts: Shared helpers and safe wrappers
 * - notifications.ts: Toast notifications and warnings
 * - overlay-manager.ts: Encrypt/decrypt overlay iframes
 * - inline-highlight.ts: Underlines and hover cards (for editable fields)
 * - input-detector.ts: Editable tracking and triggers
 * - secure-display.ts: SECURE DOM scanning (CSS-only detection, no DOM text modification)
 * 
 * SECURITY NOTE: The old dom-scanner.ts wrote plaintext to page DOM which allowed
 * page scripts/analytics to read decrypted content. The new secure-display.ts
 * NEVER modifies page text - all plaintext stays in sandboxed iframes and side panel.
 */

import { injectSelectionStyles } from './notifications';
import { setupInputDetection } from './input-detector';
import { 
  setupSecureScanning, 
  rescanSecure, 
  setSidePanelOpen,
  handleSidePanelDecrypt,
  handleSidePanelScroll
} from './secure-display';

console.log('🦆 Quack content script loaded (secure mode)');

/**
 * Initialize content script
 */
function init(): void {
  // Inject CSS for selection cards and underlines
  injectSelectionStyles();
  
  // Setup input field detection (Quack:// triggers)
  setupInputDetection();
  
  // Setup SECURE DOM scanning for encrypted messages
  // Plaintext NEVER touches the page DOM
  setupSecureScanning();
  
  console.log('✅ Quack content script initialized (secure display enabled)');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Listen for messages from service worker and side panel
 */
chrome.runtime.onMessage.addListener((message) => {
  switch (message?.type) {
    case 'VAULT_UPDATED':
      console.log('🦆 Vault updated, rescanning page securely...');
      rescanSecure();
      break;
      
    case 'SIDEPANEL_OPENED':
      console.log('🦆 Side panel opened, switching to panel mode');
      setSidePanelOpen(true);
      break;
      
    case 'SIDEPANEL_CLOSED':
      console.log('🦆 Side panel closed, switching to bubble mode');
      setSidePanelOpen(false);
      break;
      
    case 'SIDEPANEL_DECRYPT':
      // Request from side panel to decrypt a specific message
      if (message.payload?.id) {
        console.log('🦆 Side panel decrypt request:', message.payload.id);
        handleSidePanelDecrypt(message.payload.id);
      }
      break;
      
    case 'SIDEPANEL_SCROLL':
      // Request from side panel to scroll to a message
      if (message.payload?.id) {
        console.log('🦆 Side panel scroll request:', message.payload.id);
        handleSidePanelScroll(message.payload.id);
      }
      break;
  }
  
});
