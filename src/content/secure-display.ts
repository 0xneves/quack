/**
 * Secure Display Manager
 * 
 * SECURITY: Plaintext NEVER touches the page DOM.
 * All decrypted content displays in extension-controlled UI only:
 * - Sandboxed iframe bubbles (floating near ciphertext)
 * - Chrome Side Panel (list view)
 * 
 * Detection flow:
 * 1. Scan DOM for Quack:// patterns
 * 2. Apply CSS underline (visual indicator only, no text modification)
 * 3. Display decrypted content in secure UI based on hierarchy:
 *    - Side Panel open → show in panel list
 *    - Side Panel closed → show floating bubble
 *    - Bubble dismissed → re-access via hover → "Quack?" button
 */

import { QUACK_MSG_PREFIX, QUACK_MSG_REGEX, MAX_AUTO_DECRYPTS } from '@/utils/constants';
import { sendMessageSafe, isWithinEditable, positionCard } from './utils';
import { showNotification, showExcessiveQuacksWarning } from './notifications';

// ============================================================================
// Types
// ============================================================================

interface DetectedCipher {
  id: string;
  encrypted: string;
  rects: DOMRect[];
  element: HTMLElement;
  underlines: HTMLElement[];
  hitboxes: HTMLElement[];
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
let warningShown = false;
let hoverCardEl: HTMLElement | null = null;
let hoverTimer: ReturnType<typeof setTimeout> | null = null;
let activeHoverId: string | null = null;

// ============================================================================
// Side Panel Communication
// ============================================================================

/**
 * Set side panel open state (called from content-script message handler)
 */
export function setSidePanelOpen(open: boolean): void {
  sidePanelOpen = open;
  
  if (open) {
    // Close all floating bubbles when panel opens
    activeBubbles.forEach((bubble, id) => {
      bubble.frame.remove();
      activeBubbles.delete(id);
    });
    // Send all detections to side panel
    syncToSidePanel();
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
    yPosition: cipher.rects[0]?.top ?? 0,
    decrypted: cipher.decrypted,
  }));
  
  chrome.runtime.sendMessage({
    type: 'SIDEPANEL_SYNC',
    payload: { items },
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
  if (activeBubbles.has(cipher.id)) {
    return activeBubbles.get(cipher.id)!;
  }
  
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
  
  // Position near the ciphertext
  const anchorRect = cipher.rects[cipher.rects.length - 1]; // Use last rect (bottom)
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
async function showBubbleForCipher(cipher: DetectedCipher): Promise<void> {
  if (sidePanelOpen) {
    syncToSidePanel();
    return;
  }
  
  if (cipher.dismissed) return;
  
  createBubble(cipher);
}

// ============================================================================
// Hover Card (Quack? / Dismiss)
// ============================================================================

/**
 * Show hover card for a cipher
 */
function showHoverCard(cipher: DetectedCipher, anchorRect: DOMRect): void {
  if (hoverTimer) {
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }
  
  activeHoverId = cipher.id;
  setUnderlineHover(cipher.id, true);
  
  if (hoverCardEl) {
    positionCard(anchorRect, hoverCardEl);
    return;
  }
  
  hoverCardEl = document.createElement('div');
  hoverCardEl.className = 'quack-selection-card';
  hoverCardEl.innerHTML = `
    <button class="quack-card-btn quack-card-primary" aria-label="Decrypt with Quack">Quack?</button>
    <button class="quack-card-btn quack-card-secondary" aria-label="Dismiss">Dismiss</button>
  `;
  
  hoverCardEl.addEventListener('mouseenter', () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  });
  
  hoverCardEl.addEventListener('mouseleave', () => {
    scheduleHoverHide();
  });
  
  document.body.appendChild(hoverCardEl);
  positionCard(anchorRect, hoverCardEl);
  
  hoverCardEl.querySelector('.quack-card-primary')?.addEventListener('click', async () => {
    if (!activeHoverId) return;
    const c = detectedCiphers.get(activeHoverId);
    if (c) {
      c.dismissed = false;
      await decryptAndShow(c);
    }
    hideHoverCard();
  });
  
  hoverCardEl.querySelector('.quack-card-secondary')?.addEventListener('click', () => {
    if (activeHoverId) {
      const c = detectedCiphers.get(activeHoverId);
      if (c) c.dismissed = true;
    }
    hideHoverCard();
  });
}

/**
 * Schedule hiding the hover card
 */
function scheduleHoverHide(): void {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    hoverTimer = null;
    hideHoverCard();
  }, 800);
}

/**
 * Hide the hover card
 */
function hideHoverCard(): void {
  if (activeHoverId) {
    setUnderlineHover(activeHoverId, false);
  }
  activeHoverId = null;
  hoverCardEl?.remove();
  hoverCardEl = null;
}

// ============================================================================
// Underline Rendering (CSS Only - No Text Modification)
// ============================================================================

/**
 * Set hover state on underlines for a cipher
 */
function setUnderlineHover(cipherId: string, hovered: boolean): void {
  const cipher = detectedCiphers.get(cipherId);
  if (!cipher) return;
  cipher.underlines.forEach(u => u.classList.toggle('hovered', hovered));
}

/**
 * Render underlines for a detected cipher
 */
function renderUnderlines(cipher: DetectedCipher): void {
  // Clear old underlines
  cipher.underlines.forEach(u => u.remove());
  cipher.hitboxes.forEach(h => h.remove());
  cipher.underlines = [];
  cipher.hitboxes = [];
  
  cipher.rects.forEach((rect) => {
    const underline = document.createElement('div');
    underline.className = 'quack-underline';
    underline.style.left = `${rect.left}px`;
    underline.style.top = `${rect.bottom - 3}px`;
    underline.style.width = `${rect.width}px`;
    underline.style.height = '3px';
    underline.style.pointerEvents = 'none';
    
    const hitbox = document.createElement('div');
    hitbox.className = 'quack-underline-hit';
    hitbox.style.left = `${rect.left}px`;
    hitbox.style.top = `${rect.bottom - 8}px`;
    hitbox.style.width = `${rect.width}px`;
    hitbox.style.height = '10px';
    hitbox.tabIndex = -1;
    
    hitbox.addEventListener('mouseenter', () => {
      if (hoverTimer) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
      }
      // Get anchor rect (lowest point)
      const lowestRect = cipher.rects.reduce((acc, r) => 
        r.bottom > acc.bottom ? r : acc, cipher.rects[0]);
      showHoverCard(cipher, lowestRect);
    });
    
    hitbox.addEventListener('mouseleave', () => {
      scheduleHoverHide();
    });
    
    document.body.appendChild(underline);
    document.body.appendChild(hitbox);
    cipher.underlines.push(underline);
    cipher.hitboxes.push(hitbox);
  });
}

// ============================================================================
// Detection & Decryption
// ============================================================================

/**
 * Generate unique ID for a cipher based on content and position
 */
function generateCipherId(encrypted: string, element: HTMLElement): string {
  const rect = element.getBoundingClientRect();
  return `${encrypted.substring(0, 20)}-${Math.round(rect.top)}-${Math.round(rect.left)}`;
}

/**
 * Get bounding rects for a cipher string within an element
 */
function getCipherRects(element: HTMLElement, encrypted: string): DOMRect[] {
  const rects: DOMRect[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    const idx = text.indexOf(encrypted);
    if (idx !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + encrypted.length);
      const clientRects = Array.from(range.getClientRects());
      clientRects.forEach(r => {
        if (r.width > 0 && r.height > 0) {
          rects.push(r);
        }
      });
      range.detach();
    }
  }
  
  return rects;
}

/**
 * Decrypt a cipher and show in secure UI
 */
async function decryptAndShow(cipher: DetectedCipher): Promise<void> {
  if (cipher.decrypted) {
    // Already decrypted, just show
    await showBubbleForCipher(cipher);
    return;
  }
  
  try {
    const response = await sendMessageSafe({
      type: 'DECRYPT_MESSAGE',
      payload: { encryptedMessage: cipher.encrypted },
    });
    
    if (response.blacklisted) {
      return;
    }
    
    if (response.plaintext) {
      cipher.decrypted = {
        plaintext: response.plaintext,
        keyName: response.keyName || 'Unknown',
      };
      decryptionCount++;
      await showBubbleForCipher(cipher);
    }
  } catch (error) {
    console.error('🦆 Decryption error:', error);
  }
}

/**
 * Process a detected element (apply underline, auto-decrypt if limit not reached)
 */
async function processDetectedElement(element: HTMLElement, encrypted: string): Promise<void> {
  const id = generateCipherId(encrypted, element);
  
  // Skip if already processed
  if (detectedCiphers.has(id)) {
    // Update rects in case of scroll/resize
    const cipher = detectedCiphers.get(id)!;
    cipher.rects = getCipherRects(element, encrypted);
    renderUnderlines(cipher);
    return;
  }
  
  const rects = getCipherRects(element, encrypted);
  if (rects.length === 0) return;
  
  const cipher: DetectedCipher = {
    id,
    encrypted,
    rects,
    element,
    underlines: [],
    hitboxes: [],
    dismissed: false,
  };
  
  detectedCiphers.set(id, cipher);
  
  // ALWAYS render underlines (visual indicator)
  renderUnderlines(cipher);
  
  // Auto-decrypt and show if under limit
  if (decryptionCount < MAX_AUTO_DECRYPTS) {
    await decryptAndShow(cipher);
  } else {
    if (!warningShown) {
      showExcessiveQuacksWarning();
      warningShown = true;
    }
    showNotification('🔒 Hover the underlined text and click "Quack?" to decrypt');
  }
}

// ============================================================================
// DOM Scanning
// ============================================================================

const scannedElements = new WeakSet<HTMLElement>();

/**
 * Scan an element tree for Quack ciphertexts
 */
function scanElement(element: HTMLElement, observer: IntersectionObserver): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    if (text.includes(QUACK_MSG_PREFIX) || /Quack:\/\/[A-Fa-f0-9]{8}:/.test(text)) {
      const parent = node.parentElement;
      if (parent && !scannedElements.has(parent) && !isWithinEditable(parent)) {
        observer.observe(parent);
      }
    }
  }
}

/**
 * Process visible element for ciphertexts
 */
async function processVisibleElement(element: HTMLElement): Promise<void> {
  scannedElements.add(element);
  
  const text = element.textContent || '';
  const regex = new RegExp(QUACK_MSG_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(text)) !== null) {
    await processDetectedElement(element, match[0]);
  }
}

/**
 * Setup secure DOM scanning
 */
export function setupSecureScanning(): void {
  // Intersection Observer for viewport tracking
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          processVisibleElement(element);
        }
      });
    },
    { threshold: 0.1 }
  );
  
  // Mutation Observer for DOM changes
  const mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanElement(node as HTMLElement, intersectionObserver);
        }
      });
    });
  });
  
  // Initial scan
  scanElement(document.body, intersectionObserver);
  
  // Start observing mutations
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
  
  // Handle scroll/resize - update underline positions
  let rafPending = false;
  const updatePositions = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      detectedCiphers.forEach(cipher => {
        if (document.body.contains(cipher.element)) {
          cipher.rects = getCipherRects(cipher.element, cipher.encrypted);
          renderUnderlines(cipher);
        } else {
          // Element removed from DOM
          cipher.underlines.forEach(u => u.remove());
          cipher.hitboxes.forEach(h => h.remove());
          closeBubble(cipher.id);
          detectedCiphers.delete(cipher.id);
        }
      });
    });
  };
  
  window.addEventListener('scroll', updatePositions, { passive: true });
  window.addEventListener('resize', updatePositions, { passive: true });
}

/**
 * Reset scanner state (called on vault update)
 */
export function resetSecureScanner(): void {
  decryptionCount = 0;
  warningShown = false;
  
  // Clear decryption cache but keep detections
  detectedCiphers.forEach(cipher => {
    cipher.decrypted = undefined;
    cipher.dismissed = false;
  });
  
  // Re-attempt decryption for visible ciphers
  detectedCiphers.forEach(async cipher => {
    if (decryptionCount < MAX_AUTO_DECRYPTS) {
      await decryptAndShow(cipher);
    }
  });
}

/**
 * Force rescan of page (after vault update)
 */
export function rescanSecure(): void {
  resetSecureScanner();
  
  // Re-scan all text nodes
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
    if (text.includes(QUACK_MSG_PREFIX) || /Quack:\/\/[A-Fa-f0-9]{8}:/.test(text)) {
      const parent = node.parentElement;
      if (parent && !isWithinEditable(parent)) {
        elements.add(parent);
      }
    }
  }
  
  elements.forEach(el => intersectionObserver.observe(el));
  console.log(`🦆 Rescanning ${elements.size} elements securely`);
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
  
  await decryptAndShow(cipher);
}

/**
 * Handle scroll request from side panel - scroll to and highlight cipher
 */
export function handleSidePanelScroll(cipherId: string): void {
  const cipher = detectedCiphers.get(cipherId);
  if (!cipher || cipher.rects.length === 0) {
    console.warn('🦆 Cipher not found for scroll request:', cipherId);
    return;
  }
  
  // Get element center position
  const rect = cipher.rects[0];
  const targetY = rect.top + window.scrollY - window.innerHeight / 3;
  
  // Smooth scroll
  window.scrollTo({
    top: targetY,
    behavior: 'smooth',
  });
  
  // Flash highlight effect
  cipher.underlines.forEach(u => {
    u.style.transition = 'background 0.15s ease';
    u.style.background = '#ea711a';
    u.style.boxShadow = '0 0 8px rgba(234, 113, 26, 0.5)';
  });
  
  setTimeout(() => {
    cipher.underlines.forEach(u => {
      u.style.background = '';
      u.style.boxShadow = '';
    });
  }, 1500);
}

/**
 * Get all detected ciphers (for external access)
 */
export function getDetectedCiphers(): Map<string, DetectedCipher> {
  return detectedCiphers;
}
