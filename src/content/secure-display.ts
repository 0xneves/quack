/**
 * Secure Display Manager
 * 
 * SECURITY: Plaintext NEVER touches the page DOM.
 * All decrypted content displays in extension-controlled UI only:
 * - Sandboxed iframe bubbles (floating near ciphertext)
 * - Chrome Side Panel (list view)
 * 
 * Detection flow:
 * 1. Auto-scan page for Quack:// patterns
 * 2. Auto-decrypt each cipher found
 * 3. Display ONLY decrypted messages (no pending state)
 * 4. Selection as backup for missed ciphers
 */

import { QUACK_MSG_REGEX, MAX_AUTO_DECRYPTS } from '@/utils/constants';
import { sendMessageSafe, isWithinEditable, positionCard } from './utils';
import { showNotification } from './notifications';

// ============================================================================
// Types
// ============================================================================

interface DetectedCipher {
  id: string;
  encrypted: string;
  element: HTMLElement;
  decrypted?: {
    plaintext: string;
    keyName: string;
  };
}

interface BubbleState {
  frame: HTMLIFrameElement;
  cipherId: string;
  port: MessagePort | null;
  dragging: boolean;
  position: { top: number; left: number };
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
    
    // Sync all decrypted ciphers to side panel
    syncToSidePanel();
  }
  
  if (wasOpen && !open) {
    console.log('🦆 Side panel closed');
  }
}

/**
 * Sync ONLY decrypted ciphers to the side panel
 */
function syncToSidePanel(): void {
  if (!sidePanelOpen) return;
  
  // Only send decrypted items - no pending state
  const items = Array.from(detectedCiphers.values())
    .filter(cipher => cipher.decrypted) // Only decrypted
    .map(cipher => ({
      id: cipher.id,
      encrypted: cipher.encrypted,
      ciphertextPreview: cipher.encrypted.substring(0, 50) + '...',
      yPosition: cipher.element.getBoundingClientRect().top,
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
function createBubble(cipher: DetectedCipher): BubbleState | null {
  if (!cipher.decrypted) return null;
  
  // Close any existing bubble for this cipher
  closeBubble(cipher.id);
  
  const rect = cipher.element.getBoundingClientRect();
  
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
  
  // Position near the element
  const pos = calculateBubblePosition(rect);
  frame.style.left = `${pos.left}px`;
  frame.style.top = `${pos.top}px`;
  
  const state: BubbleState = {
    frame,
    cipherId: cipher.id,
    port: null,
    dragging: false,
    position: { ...pos },
  };
  
  frame.onload = () => {
    const channel = new MessageChannel();
    state.port = channel.port1;
    
    state.port.onmessage = (evt) => {
      const data = evt.data;
      if (data?.type === 'close') {
        closeBubble(cipher.id);
      } else if (data?.type === 'copy' && typeof data.text === 'string') {
        navigator.clipboard?.writeText(data.text).catch(console.error);
      } else if (data?.type === 'drag-start') {
        state.dragging = true;
      } else if (data?.type === 'drag-end') {
        state.dragging = false;
      } else if (data?.type === 'drag-move' && state.dragging) {
        const deltaX = data.deltaX ?? 0;
        const deltaY = data.deltaY ?? 0;
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const frameW = state.frame.offsetWidth || BUBBLE_WIDTH;
        const frameH = state.frame.offsetHeight || BUBBLE_HEIGHT;
        
        state.position.left = Math.min(
          Math.max(BUBBLE_MARGIN, state.position.left + deltaX),
          viewportW - frameW - BUBBLE_MARGIN
        );
        state.position.top = Math.min(
          Math.max(BUBBLE_MARGIN, state.position.top + deltaY),
          viewportH - frameH - BUBBLE_MARGIN
        );
        
        state.frame.style.left = `${state.position.left}px`;
        state.frame.style.top = `${state.position.top}px`;
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
 * Show decrypted cipher (bubble or panel depending on state)
 */
function showDecrypted(cipher: DetectedCipher): void {
  if (!cipher.decrypted) return;
  
  if (sidePanelOpen) {
    syncToSidePanel();
  } else {
    createBubble(cipher);
  }
}

// ============================================================================
// Selection Card (Backup Detection Method)
// ============================================================================

/**
 * Extract Quack cipher from selected text
 */
function extractCipherFromSelection(text: string): string | null {
  const match = text.match(QUACK_MSG_REGEX);
  return match ? match[0] : null;
}

/**
 * Show selection card near the selection
 */
function showSelectionCard(encrypted: string, selectionRect: DOMRect): void {
  const cipherId = generateCipherId(encrypted);
  
  // Check if already decrypted
  const existing = detectedCiphers.get(cipherId);
  if (existing?.decrypted) {
    // Already have it - just show it
    showDecrypted(existing);
    return;
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
    
    (quackBtn as HTMLButtonElement).disabled = true;
    (quackBtn as HTMLButtonElement).textContent = '...';
    
    // Create a temporary element for positioning
    const tempEl = document.createElement('span');
    tempEl.style.cssText = `position:fixed;left:${selectionRect.left}px;top:${selectionRect.top}px;`;
    document.body.appendChild(tempEl);
    
    const success = await decryptCipher(encrypted, tempEl);
    
    tempEl.remove();
    hideSelectionCard();
    
    if (!success) {
      showNotification('🔒 You don\'t have the key to decrypt this message');
    }
  });
  
  copyBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await navigator.clipboard.writeText(encrypted);
      copyBtn.classList.add('copied');
      (copyBtn as HTMLButtonElement).textContent = '✓';
      setTimeout(() => hideSelectionCard(), 500);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  });
  
  // Prevent card from disappearing when clicking it
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
 * Handle selection change (backup method)
 */
function handleSelectionChange(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
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
  
  const encrypted = extractCipherFromSelection(text);
  if (!encrypted) {
    hideSelectionCard();
    return;
  }
  
  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();
  if (rects.length === 0) {
    hideSelectionCard();
    return;
  }
  
  const lastRect = rects[rects.length - 1];
  showSelectionCard(encrypted, lastRect);
}

// ============================================================================
// Auto-Detection & Decryption
// ============================================================================

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
 * Decrypt a cipher and store result
 */
async function decryptCipher(encrypted: string, element: HTMLElement): Promise<boolean> {
  const cipherId = generateCipherId(encrypted);
  
  // Already processed?
  if (detectedCiphers.has(cipherId)) {
    const existing = detectedCiphers.get(cipherId)!;
    if (existing.decrypted) {
      showDecrypted(existing);
      return true;
    }
    return false; // Already tried and failed
  }
  
  // Create entry
  const cipher: DetectedCipher = {
    id: cipherId,
    encrypted,
    element,
  };
  detectedCiphers.set(cipherId, cipher);
  
  try {
    console.log('🦆 Decrypting:', encrypted.substring(0, 50) + '...');
    
    const response = await sendMessageSafe({
      type: 'DECRYPT_MESSAGE',
      payload: { encryptedMessage: encrypted },
    });
    
    if (response.error) {
      console.log('🦆 Decrypt failed:', response.error);
      // Remove from map - don't track failures
      detectedCiphers.delete(cipherId);
      return false;
    }
    
    if (response.plaintext) {
      cipher.decrypted = {
        plaintext: response.plaintext,
        keyName: response.keyName || 'Unknown',
      };
      decryptionCount++;
      showDecrypted(cipher);
      return true;
    }
    
    // No plaintext = failed
    detectedCiphers.delete(cipherId);
    return false;
  } catch (error) {
    console.error('🦆 Decryption error:', error);
    detectedCiphers.delete(cipherId);
    return false;
  }
}

/**
 * Scan an element for Quack ciphertexts
 */
async function scanElement(element: HTMLElement): Promise<void> {
  const text = element.textContent || '';
  const regex = new RegExp(QUACK_MSG_REGEX.source, 'g');
  const matches = new Set<string>();
  
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.add(match[0]);
  }
  
  // Decrypt each unique match
  for (const encrypted of matches) {
    if (decryptionCount >= MAX_AUTO_DECRYPTS) {
      console.log('🦆 Auto-decrypt limit reached');
      break;
    }
    await decryptCipher(encrypted, element);
  }
}

/**
 * Scan visible elements in viewport
 */
async function processVisibleElement(element: HTMLElement): Promise<void> {
  await scanElement(element);
}

// ============================================================================
// Setup
// ============================================================================

const scannedElements = new WeakSet<HTMLElement>();

/**
 * Setup auto-scanning and selection detection
 */
export function setupSecureScanning(): void {
  // Intersection Observer for viewport-based scanning
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          if (!scannedElements.has(element)) {
            scannedElements.add(element);
            processVisibleElement(element);
          }
        }
      });
    },
    { threshold: 0.1 }
  );
  
  // Scan for Quack patterns and observe elements
  const scanForQuackPatterns = (root: HTMLElement) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    
    while ((node = walker.nextNode())) {
      const text = node.textContent || '';
      if (QUACK_MSG_REGEX.test(text)) {
        const parent = node.parentElement;
        if (parent && !isWithinEditable(parent)) {
          intersectionObserver.observe(parent);
        }
      }
    }
  };
  
  // Initial scan
  scanForQuackPatterns(document.body);
  
  // Mutation Observer for dynamic content
  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanForQuackPatterns(node as HTMLElement);
        }
      });
    });
  });
  
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  // Selection detection (backup method)
  let selectionTimeout: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener('selectionchange', () => {
    if (selectionTimeout) clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(handleSelectionChange, 150);
  });
  
  // Hide selection card on scroll
  window.addEventListener('scroll', () => hideSelectionCard(), { passive: true });
  
  // SPA navigation detection
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
  
  console.log('🦆 Auto-detection enabled (no underlines)');
}

/**
 * Clear all state
 */
function clearAllState(): void {
  detectedCiphers.clear();
  activeBubbles.forEach(bubble => bubble.frame.remove());
  activeBubbles.clear();
  hideSelectionCard();
  decryptionCount = 0;
  scannedElements.delete = () => false; // Can't actually clear WeakSet, but new elements will be tracked
  
  if (sidePanelOpen) {
    syncToSidePanel();
  }
}

/**
 * Reset scanner state
 */
export function resetSecureScanner(): void {
  decryptionCount = 0;
  detectedCiphers.forEach(cipher => {
    cipher.decrypted = undefined;
  });
  detectedCiphers.clear();
}

/**
 * Force rescan
 */
export function rescanSecure(): void {
  resetSecureScanner();
  
  // Re-scan visible elements
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          processVisibleElement(entry.target as HTMLElement);
          intersectionObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const elements = new Set<HTMLElement>();
  let node: Node | null;
  
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    if (QUACK_MSG_REGEX.test(text)) {
      const parent = node.parentElement;
      if (parent && !isWithinEditable(parent)) {
        elements.add(parent);
      }
    }
  }
  
  elements.forEach(el => intersectionObserver.observe(el));
  console.log(`🦆 Rescanning ${elements.size} elements`);
}

// ============================================================================
// Side Panel Message Handlers
// ============================================================================

/**
 * Handle decrypt request from side panel (not needed anymore but keep for compatibility)
 */
export async function handleSidePanelDecrypt(cipherId: string): Promise<void> {
  const cipher = detectedCiphers.get(cipherId);
  if (!cipher || cipher.decrypted) return;
  
  // This shouldn't happen since we only show decrypted items
  console.warn('🦆 Unexpected decrypt request for:', cipherId);
}

/**
 * Handle scroll request from side panel
 */
export function handleSidePanelScroll(cipherId: string): void {
  const cipher = detectedCiphers.get(cipherId);
  if (!cipher) return;
  
  const rect = cipher.element.getBoundingClientRect();
  const targetY = rect.top + window.scrollY - window.innerHeight / 3;
  
  window.scrollTo({
    top: targetY,
    behavior: 'smooth',
  });
  
  // Flash effect on element
  const originalBg = cipher.element.style.background;
  cipher.element.style.transition = 'background 0.2s ease';
  cipher.element.style.background = 'rgba(234, 113, 26, 0.2)';
  setTimeout(() => {
    cipher.element.style.background = originalBg;
  }, 1500);
}

/**
 * Get all detected ciphers
 */
export function getDetectedCiphers(): Map<string, DetectedCipher> {
  return detectedCiphers;
}
