/**
 * Secure Display Manager
 * 
 * SECURITY: Plaintext NEVER touches the page DOM.
 * All decrypted content displays in extension-controlled UI only:
 * - Sandboxed iframe bubbles (floating near ciphertext)
 * - Chrome Side Panel (list view)
 * 
 * Detection flow:
 * 1. User SELECTS text containing Quack:// pattern
 * 2. Show "Quack? / Copy" card near selection
 * 3. Display decrypted content in secure UI based on hierarchy:
 *    - Side Panel open → show in panel list
 *    - Side Panel closed → show floating bubble
 */

import { QUACK_MSG_REGEX } from '@/utils/constants';
import { sendMessageSafe, positionCard } from './utils';
import { showNotification } from './notifications';

// ============================================================================
// Types
// ============================================================================

interface DetectedCipher {
  id: string;
  encrypted: string;
  dismissed: boolean;
  decrypted?: {
    plaintext: string;
    keyName: string;
  };
}

interface BubbleState {
  frame: HTMLIFrameElement;
  cipherId: string;
  port: MessagePort | null;
}

// ============================================================================
// State
// ============================================================================

const detectedCiphers = new Map<string, DetectedCipher>();
const activeBubbles = new Map<string, BubbleState>();
let sidePanelOpen = false;
let decryptionCount = 0;
let selectionCardEl: HTMLElement | null = null;

// ============================================================================
// Side Panel Communication
// ============================================================================

/**
 * Set side panel open state (called from content-script message handler)
 */
export function setSidePanelOpen(open: boolean): void {
  const wasOpen = sidePanelOpen;
  sidePanelOpen = open;
  
  if (open) {
    // Close all floating bubbles when panel opens
    activeBubbles.forEach((bubble) => {
      bubble.frame.remove();
    });
    activeBubbles.clear();
    
    // Sync all detections to side panel
    syncToSidePanel();
  }
  
  // If panel just closed, nothing special to do - user can use selection to trigger decryption
  if (wasOpen && !open) {
    console.log('🦆 Side panel closed');
  }
}

/**
 * Sync all detected ciphers to the side panel
 */
function syncToSidePanel(): void {
  if (!sidePanelOpen) return;
  
  const items = Array.from(detectedCiphers.values()).map(cipher => ({
    id: cipher.id,
    encrypted: cipher.encrypted,
    ciphertextPreview: cipher.encrypted.substring(0, 50) + '...',
    yPosition: 0, // No position tracking without underlines
    decrypted: cipher.decrypted,
  }));
  
  chrome.runtime.sendMessage({
    type: 'SIDEPANEL_SYNC',
    payload: { items },
  }).catch(() => {
    // Side panel might not be ready yet
  });
}

// ============================================================================
// Bubble Management (Secure Iframe Display)
// ============================================================================

const BUBBLE_WIDTH = 320;
const BUBBLE_HEIGHT = 140;
const BUBBLE_MARGIN = 8;

/**
 * Create a secure bubble iframe for displaying decrypted content
 */
function createBubble(cipher: DetectedCipher, anchorRect: DOMRect): BubbleState | null {
  // Close any existing bubble for this cipher
  closeBubble(cipher.id);
  
  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('bubble-decrypt.html');
  frame.sandbox = 'allow-scripts';
  frame.style.cssText = `
    position: fixed;
    width: ${BUBBLE_WIDTH}px;
    height: ${BUBBLE_HEIGHT}px;
    border: none;
    z-index: 1000001;
    background: transparent;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    border-radius: 12px;
    pointer-events: auto;
  `;
  
  // Position near the selection
  const pos = calculateBubblePosition(anchorRect);
  frame.style.left = `${pos.left}px`;
  frame.style.top = `${pos.top}px`;
  
  const state: BubbleState = {
    frame,
    cipherId: cipher.id,
    port: null,
  };
  
  frame.onload = () => {
    const channel = new MessageChannel();
    state.port = channel.port1;
    
    state.port.onmessage = (evt) => {
      const data = evt.data;
      if (data?.type === 'close') {
        closeBubble(cipher.id);
        cipher.dismissed = true;
      } else if (data?.type === 'copy' && typeof data.text === 'string') {
        navigator.clipboard?.writeText(data.text).catch(console.error);
      }
    };
    
    frame.contentWindow?.postMessage({ type: 'init' }, '*', [channel.port2]);
    
    // Send decrypted content to bubble
    if (cipher.decrypted) {
      state.port.postMessage({
        type: 'show',
        plaintext: cipher.decrypted.plaintext,
        keyName: cipher.decrypted.keyName,
        ciphertextPreview: cipher.encrypted.substring(0, 40) + '...',
      });
    }
  };
  
  document.body.appendChild(frame);
  activeBubbles.set(cipher.id, state);
  
  return state;
}

/**
 * Calculate optimal bubble position (adapts to viewport edges)
 */
function calculateBubblePosition(anchorRect: DOMRect): { top: number; left: number } {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  
  let top = anchorRect.bottom + BUBBLE_MARGIN;
  let left = anchorRect.left;
  
  // Flip above if off-screen bottom
  if (top + BUBBLE_HEIGHT > viewportH - BUBBLE_MARGIN) {
    top = anchorRect.top - BUBBLE_HEIGHT - BUBBLE_MARGIN;
  }
  
  // Clamp to viewport
  if (top < BUBBLE_MARGIN) top = BUBBLE_MARGIN;
  if (left + BUBBLE_WIDTH > viewportW - BUBBLE_MARGIN) {
    left = viewportW - BUBBLE_WIDTH - BUBBLE_MARGIN;
  }
  if (left < BUBBLE_MARGIN) left = BUBBLE_MARGIN;
  
  return { top, left };
}

/**
 * Close and remove a bubble
 */
function closeBubble(cipherId: string): void {
  const bubble = activeBubbles.get(cipherId);
  if (bubble) {
    bubble.frame.remove();
    activeBubbles.delete(cipherId);
  }
}

/**
 * Show bubble for a cipher (if panel not open)
 */
async function showBubbleForCipher(cipher: DetectedCipher, anchorRect: DOMRect): Promise<void> {
  if (sidePanelOpen) {
    syncToSidePanel();
    return;
  }
  
  if (cipher.dismissed) return;
  
  createBubble(cipher, anchorRect);
}

// ============================================================================
// Selection Detection
// ============================================================================

/**
 * Extract Quack cipher from selected text
 */
function extractCipherFromSelection(text: string): string | null {
  const match = text.match(QUACK_MSG_REGEX);
  return match ? match[0] : null;
}

/**
 * Generate unique ID for a cipher based on content
 */
function generateCipherId(encrypted: string): string {
  let hash = 0;
  for (let i = 0; i < encrypted.length; i++) {
    const char = encrypted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `quack-${Math.abs(hash).toString(36)}-${encrypted.length}`;
}

/**
 * Show selection card near the selection
 */
function showSelectionCard(encrypted: string, selectionRect: DOMRect): void {
  const cipherId = generateCipherId(encrypted);
  
  // Get or create cipher entry
  if (!detectedCiphers.has(cipherId)) {
    detectedCiphers.set(cipherId, {
      id: cipherId,
      encrypted,
      dismissed: false,
    });
  }
  
  // Remove existing card
  hideSelectionCard();
  
  selectionCardEl = document.createElement('div');
  selectionCardEl.className = 'quack-selection-card';
  selectionCardEl.innerHTML = `
    <button class="quack-card-btn quack-card-primary" aria-label="Decrypt with Quack">Quack?</button>
    <button class="quack-card-btn quack-card-secondary" aria-label="Copy encrypted text">Copy</button>
  `;
  
  document.body.appendChild(selectionCardEl);
  positionCard(selectionRect, selectionCardEl);
  
  const quackBtn = selectionCardEl.querySelector('.quack-card-primary');
  const copyBtn = selectionCardEl.querySelector('.quack-card-secondary');
  
  quackBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const cipher = detectedCiphers.get(cipherId);
    if (cipher) {
      cipher.dismissed = false;
      (quackBtn as HTMLButtonElement).disabled = true;
      (quackBtn as HTMLButtonElement).textContent = '...';
      await decryptAndShow(cipher, selectionRect);
    }
    hideSelectionCard();
  });
  
  copyBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await navigator.clipboard.writeText(encrypted);
      copyBtn.classList.add('copied');
      (copyBtn as HTMLButtonElement).textContent = '✓';
      setTimeout(() => {
        hideSelectionCard();
      }, 500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  });
  
  // Prevent card from disappearing immediately when clicking it
  selectionCardEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
}

/**
 * Hide the selection card
 */
function hideSelectionCard(): void {
  if (selectionCardEl) {
    selectionCardEl.remove();
    selectionCardEl = null;
  }
}

/**
 * Handle selection change
 */
function handleSelectionChange(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    // Small delay before hiding to allow clicking the card
    setTimeout(() => {
      if (!selectionCardEl?.matches(':hover')) {
        hideSelectionCard();
      }
    }, 100);
    return;
  }
  
  const text = selection.toString();
  if (!text || text.length < 20) {
    hideSelectionCard();
    return;
  }
  
  // Check if selection contains a Quack cipher
  const encrypted = extractCipherFromSelection(text);
  if (!encrypted) {
    hideSelectionCard();
    return;
  }
  
  // Get selection rect
  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length === 0) {
    hideSelectionCard();
    return;
  }
  
  // Use the last rect (bottom of selection)
  const lastRect = rects[rects.length - 1];
  showSelectionCard(encrypted, lastRect);
}

// ============================================================================
// Decryption
// ============================================================================

/**
 * Decrypt a cipher and show in secure UI
 */
async function decryptAndShow(cipher: DetectedCipher, anchorRect: DOMRect): Promise<void> {
  if (cipher.decrypted) {
    // Already decrypted, just show
    await showBubbleForCipher(cipher, anchorRect);
    return;
  }
  
  try {
    console.log('🦆 Attempting to decrypt:', cipher.encrypted.substring(0, 50) + '...');
    
    const response = await sendMessageSafe({
      type: 'DECRYPT_MESSAGE',
      payload: { encryptedMessage: cipher.encrypted },
    });
    
    console.log('🦆 Decrypt response:', response);
    
    if (response.blacklisted) {
      showNotification('🚫 This message is from a blacklisted source');
      return;
    }
    
    if (response.error) {
      if (response.error.includes('locked')) {
        showNotification('🔒 Vault is locked. Click the Quack icon to unlock.');
      } else if (response.error.includes('No key')) {
        showNotification('🔑 No matching key found for this message');
      } else {
        showNotification(`❌ ${response.error}`);
      }
      return;
    }
    
    if (response.plaintext) {
      cipher.decrypted = {
        plaintext: response.plaintext,
        keyName: response.keyName || 'Unknown',
      };
      decryptionCount++;
      await showBubbleForCipher(cipher, anchorRect);
      
      // Also sync to side panel if open
      if (sidePanelOpen) {
        syncToSidePanel();
      }
    } else {
      showNotification('❌ Could not decrypt message');
    }
  } catch (error) {
    console.error('🦆 Decryption error:', error);
    showNotification('❌ Decryption failed. Is the extension active?');
  }
}

// ============================================================================
// Setup
// ============================================================================

/**
 * Setup secure selection-based detection
 */
export function setupSecureScanning(): void {
  // Listen for text selection changes
  let selectionTimeout: ReturnType<typeof setTimeout> | null = null;
  
  document.addEventListener('selectionchange', () => {
    // Debounce selection changes
    if (selectionTimeout) {
      clearTimeout(selectionTimeout);
    }
    selectionTimeout = setTimeout(handleSelectionChange, 150);
  });
  
  // Hide card on click outside
  document.addEventListener('mousedown', (e) => {
    if (selectionCardEl && !selectionCardEl.contains(e.target as Node)) {
      // Don't hide immediately - let selection handler deal with it
    }
  });
  
  // Hide card on scroll
  window.addEventListener('scroll', () => {
    hideSelectionCard();
  }, { passive: true });
  
  // SPA navigation detection - clear all state when URL changes
  let lastUrl = window.location.href;
  const checkUrlChange = () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log('🦆 URL changed, clearing state');
      clearAllState();
    }
  };
  
  window.addEventListener('popstate', checkUrlChange);
  setInterval(checkUrlChange, 500);
  
  console.log('🦆 Secure selection-based detection enabled');
}

/**
 * Clear all state (for SPA navigation)
 */
function clearAllState(): void {
  detectedCiphers.clear();
  activeBubbles.forEach(bubble => bubble.frame.remove());
  activeBubbles.clear();
  hideSelectionCard();
  decryptionCount = 0;
  
  // Notify side panel to clear
  if (sidePanelOpen) {
    syncToSidePanel();
  }
}

/**
 * Reset scanner state (called on vault update)
 */
export function resetSecureScanner(): void {
  decryptionCount = 0;
  
  // Clear decryption cache but keep cipher entries
  detectedCiphers.forEach(cipher => {
    cipher.decrypted = undefined;
    cipher.dismissed = false;
  });
}

/**
 * Force rescan - with selection-based detection, just reset state
 */
export function rescanSecure(): void {
  resetSecureScanner();
  console.log('🦆 Scanner reset, ready for new selections');
}

// ============================================================================
// Side Panel Message Handlers
// ============================================================================

/**
 * Handle decrypt request from side panel
 */
export async function handleSidePanelDecrypt(cipherId: string): Promise<void> {
  const cipher = detectedCiphers.get(cipherId);
  if (!cipher) {
    console.warn('🦆 Cipher not found for decrypt request:', cipherId);
    return;
  }
  
  // Create a dummy rect for the bubble (center of screen if no position)
  const dummyRect = new DOMRect(
    window.innerWidth / 2 - 100,
    window.innerHeight / 2 - 50,
    200,
    100
  );
  
  await decryptAndShow(cipher, dummyRect);
}

/**
 * Handle scroll request from side panel - not applicable without underlines
 */
export function handleSidePanelScroll(cipherId: string): void {
  const cipher = detectedCiphers.get(cipherId);
  if (!cipher) {
    console.warn('🦆 Cipher not found for scroll request:', cipherId);
    return;
  }
  
  // Without underlines, we can't scroll to position
  // Just show a notification
  showNotification('📍 Select the encrypted text to decrypt it');
}

/**
 * Get all detected ciphers (for external access)
 */
export function getDetectedCiphers(): Map<string, DetectedCipher> {
  return detectedCiphers;
}
