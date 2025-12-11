/**
 * Quack - Content Script
 * 
 * Handles:
 * - Detection of "Quack://" trigger in input fields
 * - DOM scanning for encrypted messages
 * - Auto-decryption of visible messages
 * - Manual decryption via selection
 * - Viewport-based performance optimization
 */

import { QUACK_PREFIX, MAX_AUTO_DECRYPTS } from '@/utils/constants';
import { debounce, isEditableElement, getElementValue, setElementValue } from '@/utils/helpers';

console.log('🦆 Quack content script loaded');

// Track processed elements and decryption count
const processedElements = new WeakSet<HTMLElement>();
const decryptedElements = new Map<HTMLElement, string>();
let decryptedCount = 0;
let warningShown = false;
let inlineCardEl: HTMLElement | null = null;
let inlineHideTimer: ReturnType<typeof setTimeout> | null = null;
let inlineEncrypted: string | null = null;
let activeEditable: HTMLElement | null = null;
let activeObserver: MutationObserver | null = null;
let inlineItems: Array<{
  underline: HTMLElement;
  hitbox: HTMLElement;
  rect: DOMRect;
  matchId: string;
  encrypted: string;
}> = [];
let lastInlineSignature: string | null = null;
let inlineHovering = false;
let inlineHoverCounts = new Map<string, number>();
let inlineActiveMatchId: string | null = null;
const OVERLAY_WIDTH = 340;
const OVERLAY_HEIGHT = 260;
const OVERLAY_MARGIN = 12;
type OverlayKind = 'decrypt' | 'encrypt';
const OVERLAY_SRC: Record<OverlayKind, string> = {
  decrypt: 'overlay-decrypt.html',
  encrypt: 'overlay-encrypt.html',
};
type OverlayState = {
  frame: HTMLIFrameElement | null;
  ready: boolean;
  readyPromise: Promise<void> | null;
  readyResolve: (() => void) | null;
  messageQueue: any[];
  port: MessagePort | null;
  portReady: boolean;
  portReadyPromise: Promise<void> | null;
  portReadyResolve: (() => void) | null;
  dragging: boolean;
  position: { top: number; left: number };
};
const overlayStates: Record<OverlayKind, OverlayState> = {
  decrypt: {
    frame: null,
    ready: false,
    readyPromise: null,
    readyResolve: null,
    messageQueue: [],
    port: null,
    portReady: false,
    portReadyPromise: null,
    portReadyResolve: null,
    dragging: false,
    position: { top: 120, left: 120 },
  },
  encrypt: {
    frame: null,
    ready: false,
    readyPromise: null,
    readyResolve: null,
    messageQueue: [],
    port: null,
    portReady: false,
    portReadyPromise: null,
    portReadyResolve: null,
    dragging: false,
    position: { top: 120, left: 120 },
  },
};
let encryptOverlayActive = false;
let pendingDuckEditable: HTMLElement | null = null;

function setUnderlineHover(matchId: string, hovered: boolean) {
  inlineItems
    .filter(i => i.matchId === matchId)
    .forEach(i => i.underline.classList.toggle('hovered', hovered));
}
function removeInlineCardOnly() {
  if (inlineCardEl) {
    inlineCardEl.remove();
    inlineCardEl = null;
  }
  if (inlineActiveMatchId) {
    const count = inlineHoverCounts.get(inlineActiveMatchId) ?? 0;
    if (count === 0) setUnderlineHover(inlineActiveMatchId, false);
  }
  inlineActiveMatchId = null;
  inlineEncrypted = null;
}

async function ensureOverlayFrame(kind: OverlayKind): Promise<void> {
  const state = overlayStates[kind];
  if (state.ready && state.frame) return;
  if (!state.readyPromise) {
    state.readyPromise = new Promise<void>((resolve) => {
      state.readyResolve = resolve;
    });
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL(OVERLAY_SRC[kind]);
    iframe.sandbox = 'allow-scripts allow-popups allow-forms';
    iframe.style.position = 'fixed';
    iframe.style.width = `${OVERLAY_WIDTH}px`;
    iframe.style.height = `${OVERLAY_HEIGHT}px`;
    iframe.style.border = 'none';
    iframe.style.zIndex = '1000001';
    iframe.style.display = 'none';
    iframe.style.background = 'transparent';
    iframe.style.boxShadow = 'none';
    iframe.style.pointerEvents = 'auto';
    iframe.onload = () => {
      state.ready = true;
      const channel = new MessageChannel();
      state.port = channel.port1;
      state.port.onmessage = (evt) => handleOverlayPortMessage(kind, evt);
      state.portReady = true;
      if (!state.portReadyPromise) {
        state.portReadyPromise = Promise.resolve();
      } else {
        state.portReadyResolve?.();
      }
      iframe.contentWindow?.postMessage({ quackOverlay: true, type: 'init' }, '*', [channel.port2]);
      state.messageQueue.forEach(msg => state.port?.postMessage(msg));
      state.messageQueue = [];
      state.readyResolve?.();
    };
    state.frame = iframe;
    document.body.appendChild(iframe);
  }
  await state.readyPromise;
}

function applyOverlayPosition(kind: OverlayKind) {
  const state = overlayStates[kind];
  if (!state.frame) return;
  state.frame.style.left = `${state.position.left}px`;
  state.frame.style.top = `${state.position.top}px`;
}

function setOverlayPosition(kind: OverlayKind, top: number, left: number) {
  const maxLeft = Math.max(0, window.innerWidth - OVERLAY_WIDTH - OVERLAY_MARGIN);
  const maxTop = Math.max(0, window.innerHeight - OVERLAY_HEIGHT - OVERLAY_MARGIN);
  stateFor(kind).position = {
    top: Math.min(Math.max(OVERLAY_MARGIN, top), maxTop),
    left: Math.min(Math.max(OVERLAY_MARGIN, left), maxLeft),
  };
  applyOverlayPosition(kind);
}

function stateFor(kind: OverlayKind): OverlayState {
  return overlayStates[kind];
}

async function showOverlay(kind: OverlayKind, anchor?: DOMRect) {
  const other: OverlayKind = kind === 'decrypt' ? 'encrypt' : 'decrypt';
  hideOverlay(other);
  await ensureOverlayFrame(kind);
  const state = stateFor(kind);
  if (anchor) {
    const preferredTop = anchor.bottom + OVERLAY_MARGIN;
    const preferredLeft = anchor.left;
    setOverlayPosition(kind, preferredTop, preferredLeft);
  } else {
    applyOverlayPosition(kind);
  }
  if (state.frame) {
    state.frame.style.display = 'block';
  }
}

function hideOverlay(kind: OverlayKind) {
  const state = stateFor(kind);
  if (state.frame) {
    state.frame.style.display = 'none';
  }
  state.dragging = false;
  if (kind === 'encrypt') {
    encryptOverlayActive = false;
    pendingDuckEditable = null;
  }
}

function sendOverlayMessage(kind: OverlayKind, msg: any) {
  const state = stateFor(kind);
  if (state.portReady && state.port) {
    state.port.postMessage(msg);
    return;
  }
  state.messageQueue.push(msg);
}

function handleOverlayPortMessage(kind: OverlayKind, event: MessageEvent) {
  const data = event.data;
  if (!data || data.quackOverlay !== true) return;
  switch (data.type) {
    case 'close': {
      hideOverlay(kind);
      break;
    }
    case 'copy': {
      if (typeof data.text === 'string') {
        navigator.clipboard?.writeText(data.text).catch(err => console.error('Copy failed', err));
      }
      break;
    }
    case 'encrypt-request': {
      handleOverlayEncryptRequest(data.plaintext ?? '', data.keyId);
      break;
    }
    case 'drag-start': {
      stateFor(kind).dragging = true;
      break;
    }
    case 'drag-end': {
      stateFor(kind).dragging = false;
      break;
    }
    case 'drag-move': {
      const st = stateFor(kind);
      if (!st.dragging) break;
      const nextTop = st.position.top + (data.deltaY ?? 0);
      const nextLeft = st.position.left + (data.deltaX ?? 0);
      setOverlayPosition(kind, nextTop, nextLeft);
      break;
    }
  }
}

async function openDecryptBubble(ciphertext: string, anchor: DOMRect) {
  await showOverlay('decrypt', anchor);
  try {
    const response = await sendMessageSafe({
      type: 'DECRYPT_MESSAGE',
      payload: { ciphertext },
    });
    if (response.plaintext) {
      sendOverlayMessage('decrypt', {
        type: 'open-decrypt',
        ciphertext,
        plaintext: response.plaintext,
        keyName: response.keyName,
        quackOverlay: true,
      });
    } else {
      sendOverlayMessage('decrypt', {
        type: 'open-decrypt',
        ciphertext,
        plaintext: '',
        error: response.error || 'Could not decrypt message',
        quackOverlay: true,
      });
    }
  } catch (error) {
    console.error('Inline decryption error:', error);
    sendOverlayMessage('decrypt', {
      type: 'open-decrypt',
      ciphertext,
      plaintext: '',
      error: 'Decryption failed',
      quackOverlay: true,
    });
  }
}

async function openEncryptBubble(prefill: string, anchor: DOMRect | null, editable: HTMLElement) {
  encryptOverlayActive = true;
  pendingDuckEditable = editable;
  const keyResponse = await sendMessageSafe({ type: 'GET_KEYS' });
  const keys = keyResponse.keys || [];
  await showOverlay('encrypt', anchor || editable.getBoundingClientRect());
  sendOverlayMessage('encrypt', { quackOverlay: true, type: 'open-encrypt', keys, prefill });
}

async function handleOverlayEncryptRequest(plaintext: string, keyId: string) {
  if (!keyId) {
    sendOverlayMessage('encrypt', { type: 'encrypt-result', error: 'No key selected' });
    return;
  }
  try {
    const resp = await sendMessageSafe({
      type: 'ENCRYPT_MESSAGE',
      payload: { plaintext, keyId },
    });
    if (resp?.encrypted) {
      const cipher = `${QUACK_PREFIX}${resp.encrypted}`;
      try {
        await navigator.clipboard?.writeText(cipher);
      } catch (copyErr) {
        console.warn('Clipboard write failed', copyErr);
      }
      if (pendingDuckEditable) {
        const current = getElementValue(pendingDuckEditable);
        const replaced = current.replace('Duck:', cipher);
        setElementValue(pendingDuckEditable, replaced);
      }
      sendOverlayMessage('encrypt', { quackOverlay: true, type: 'encrypt-result', cipher });
      encryptOverlayActive = false;
      pendingDuckEditable = null;
    } else {
      sendOverlayMessage('encrypt', { quackOverlay: true, type: 'encrypt-result', error: 'Encryption failed' });
    }
  } catch (err) {
    console.error('Overlay encrypt error', err);
    sendOverlayMessage('encrypt', { quackOverlay: true, type: 'encrypt-result', error: 'Encryption failed' });
  }
}

/**
 * Check if an element lives inside an editable context
 */
function isWithinEditable(element: HTMLElement): boolean {
  if (isEditableElement(element)) return true;
  return Boolean(
    element.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')
  );
}

/**
 * Initialize content script
 */
function init() {
  setupInputDetection();
  setupDOMScanning();
  injectSelectionStyles();
  
  console.log('✅ Quack content script initialized');
}

/**
 * Setup detection for "Quack://" trigger in input fields
 */
function setupInputDetection() {
  const handleUpdate = (event: Event) => {
    const target = event.target as HTMLElement;
    const editable = getEditableRoot(target);
    if (!editable) return;
    setActiveEditable(editable);
    const value = getElementValue(editable);

    // Inline encryption trigger: __plaintext__
    const underlineMatch = value.match(/__(.+?)__/);
    if (underlineMatch) {
      const plaintext = underlineMatch[1];
      showInlineEncryptPrompt(editable, plaintext, underlineMatch[0]);
    }

    if (value.endsWith('Quack://')) {
      showSecureComposePrompt(editable);
    }

    const duckTrigger = value.match(/Duck:(?!\/\/)/);
    if (duckTrigger && !encryptOverlayActive) {
      const rect = editable.getBoundingClientRect();
      const anchor = new DOMRect(rect.left, rect.top, rect.width, rect.height);
      openEncryptBubble('', anchor, editable).catch(err => console.error('Encrypt overlay error', err));
    }

    updateInlineHighlight(editable, value);
  };

  const debouncedHandler = debounce(handleUpdate, 200);
  document.addEventListener('input', debouncedHandler as unknown as EventListener);
  document.addEventListener('keyup', debouncedHandler as unknown as EventListener);
  document.addEventListener('paste', debouncedHandler as unknown as EventListener);

  document.addEventListener('focusin', (e) => {
    const editable = getEditableRoot(e.target as HTMLElement);
    if (editable) {
      setActiveEditable(editable);
      updateInlineHighlight(editable, getElementValue(editable));
    }
  });

  document.addEventListener('focusout', (e) => {
    const next = (e.relatedTarget as HTMLElement | null);
    if (activeEditable && next && activeEditable.contains(next)) {
      return;
    }
    // Keep underlines rendered; they will clear when text changes
    setActiveEditable(null);
  });

}

function getEditableRoot(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    if (isEditableElement(node)) return node;
    node = node.parentElement;
  }
  return null;
}

function setActiveEditable(el: HTMLElement | null) {
  if (activeEditable === el) return;
  activeEditable = el;

  if (activeObserver) {
    activeObserver.disconnect();
    activeObserver = null;
  }

  if (activeEditable) {
    activeObserver = new MutationObserver(() => {
      updateInlineHighlight(activeEditable as HTMLElement, getElementValue(activeEditable as HTMLElement));
    });
    activeObserver.observe(activeEditable, {
      characterData: true,
      subtree: true,
      childList: true,
    });
  }
}

/**
 * Show prompt for secure compose mode
 */
function showSecureComposePrompt(inputElement: HTMLElement) {
  // Remove existing prompt
  const existing = document.querySelector('.quack-secure-prompt');
  if (existing) existing.remove();
  
  const rect = inputElement.getBoundingClientRect();
  
  const prompt = document.createElement('div');
  prompt.className = 'quack-secure-prompt';
  prompt.innerHTML = `
    <div style="
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.bottom + 5}px;
      background: #ea711a;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 999999;
      font-family: system-ui;
      font-size: 14px;
      display: flex;
      gap: 8px;
      align-items: center;
      animation: slideUp 0.2s ease-out;
    ">
      <span>🦆 Start a secure message?</span>
      <button class="quack-prompt-yes" style="
        background: white;
        color: #ea711a;
        border: none;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
      ">Yes</button>
      <button class="quack-prompt-no" style="
        background: transparent;
        color: white;
        border: 1px solid white;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
      ">No</button>
    </div>
  `;
  
  document.body.appendChild(prompt);
  
  // Handle Yes button
  prompt.querySelector('.quack-prompt-yes')?.addEventListener('click', () => {
    prompt.remove();
    openSecureCompose(inputElement);
  });
  
  // Handle No button
  prompt.querySelector('.quack-prompt-no')?.addEventListener('click', () => {
    prompt.remove();
  });
  
  // Auto-dismiss after 10 seconds
  setTimeout(() => prompt.remove(), 10000);
}

/**
 * Inline encrypt prompt for __text__
 */
function showInlineEncryptPrompt(inputElement: HTMLElement, plaintext: string, token: string) {
  // Remove existing prompt if any
  const existing = document.querySelector('.quack-inline-encrypt');
  if (existing) existing.remove();

  const rect = inputElement.getBoundingClientRect();
  const prompt = document.createElement('div');
  prompt.className = 'quack-inline-encrypt';
  prompt.innerHTML = `
    <div style="
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.bottom + 5}px;
      background: #1f2937;
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      z-index: 999999;
      font-family: system-ui;
      font-size: 13px;
      display: flex;
      gap: 8px;
      align-items: center;
    ">
      <span>Encrypt detected text?</span>
      <button class="quack-inline-encrypt-btn" style="
        background: #ea711a;
        color: white;
        border: none;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
      ">Encrypt</button>
      <button class="quack-inline-encrypt-cancel" style="
        background: transparent;
        color: white;
        border: 1px solid #fff;
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
      ">Dismiss</button>
    </div>
  `;

  document.body.appendChild(prompt);

  prompt.querySelector('.quack-inline-encrypt-btn')?.addEventListener('click', async () => {
    try {
      // get keys
      const keyResponse = await sendMessageSafe({ type: 'GET_KEYS' });
      const firstKey = keyResponse.keys?.[0];
      if (!firstKey) {
        showNotification('❌ No keys available. Create a key first.');
        prompt.remove();
        return;
      }

      const encryptedResp = await sendMessageSafe({
        type: 'ENCRYPT_MESSAGE',
        payload: { plaintext, keyId: firstKey.id },
      });

      if (encryptedResp?.encrypted) {
        const current = getElementValue(inputElement);
        const replaced = current.replace(token, encryptedResp.encrypted);
        setElementValue(inputElement, replaced);
        showNotification('✅ Encrypted and replaced');
      } else {
        showNotification('❌ Encryption failed');
      }
    } catch (err) {
      console.error('Inline encryption error', err);
      showNotification('❌ Encryption failed');
    } finally {
      prompt.remove();
    }
  });

  prompt.querySelector('.quack-inline-encrypt-cancel')?.addEventListener('click', () => {
    prompt.remove();
  });

  setTimeout(() => prompt.remove(), 8000);
}

/**
 * Open secure compose interface
 */
function openSecureCompose(_inputElement: HTMLElement) {
  // For MVP, open popup window
  // In future, could be an iframe overlay
  chrome.runtime.sendMessage({
    type: 'OPEN_SECURE_COMPOSE',
    payload: {
      url: window.location.href,
    }
  });
  
  // Open extension popup
  // Note: Cannot programmatically open popup from content script
  // User must click extension icon
  showNotification('Click the Quack extension icon to compose securely');
}

/**
 * Setup DOM scanning for encrypted messages
 */
function setupDOMScanning() {
  // Intersection Observer for viewport tracking
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          if (!processedElements.has(element)) {
            processElement(element);
          }
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
          scanElement(node as HTMLElement, observer);
        }
      });
    });
  });
  
  // Initial scan
  scanElement(document.body, observer);
  
  // Start observing mutations
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Scan element for encrypted messages
 */
function scanElement(element: HTMLElement, observer: IntersectionObserver) {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    if (text.includes(QUACK_PREFIX)) {
      const parent = node.parentElement;
      if (parent && !processedElements.has(parent) && !isWithinEditable(parent)) {
        observer.observe(parent);
      }
    }
  }
}

/**
 * Process element with encrypted content
 */
async function processElement(element: HTMLElement) {
  processedElements.add(element);

  // Never auto-decrypt inside editable contexts
  if (isWithinEditable(element)) {
    return;
  }
  
  // Check if we've hit the auto-decrypt limit
  if (decryptedCount >= MAX_AUTO_DECRYPTS) {
    addManualDecryptButton(element);
    
    if (!warningShown) {
      showExcessiveQuacksWarning();
      warningShown = true;
    }
    return;
  }
  
  // Extract encrypted text
  const text = element.textContent || '';
  const match = text.match(new RegExp(`${QUACK_PREFIX}[A-Za-z0-9+/=]+`));
  
  if (!match) return;
  
  const encrypted = match[0];
  
  // Attempt decryption
  try {
    const response = await sendMessageSafe({
      type: 'DECRYPT_MESSAGE',
      payload: { ciphertext: encrypted },
    });
    
    if (response.blacklisted) {
      // Don't decrypt blacklisted messages
      return;
    }
    
    if (response.plaintext) {
      replaceWithDecrypted(element, encrypted, response.plaintext, response.keyName);
      decryptedCount++;
    } else {
      addDecryptFailedIndicator(element);
    }
  } catch (error) {
    console.error('Decryption error:', error);
    addDecryptFailedIndicator(element);
  }
}

/**
 * Replace encrypted text with decrypted plaintext
 */
function replaceWithDecrypted(
  element: HTMLElement,
  encrypted: string,
  plaintext: string,
  keyName: string
) {
  // If element is editable (input/textarea/contenteditable), update its value directly
  if (isEditableElement(element)) {
    const current = getElementValue(element);
    const newVal = current.replace(encrypted, plaintext);
    setElementValue(element, newVal);
    decryptedElements.set(element, plaintext);
    return;
  }

  // For non-editable text, replace the text node and add indicator
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    if (text.includes(encrypted)) {
      const newText = text.replace(encrypted, plaintext);
      
      const wrapper = document.createElement('span');
      wrapper.textContent = newText;
      wrapper.style.position = 'relative';
      
      const indicator = document.createElement('span');
      indicator.textContent = ' 🔓';
      indicator.title = `Decrypted by Quack (Key: ${keyName})`;
      indicator.style.cssText = `
        font-size: 0.8em;
        opacity: 0.6;
        cursor: help;
        margin-left: 2px;
      `;
      
      wrapper.appendChild(indicator);
      node.parentNode?.replaceChild(wrapper, node);
      
      decryptedElements.set(element, plaintext);
      break;
    }
  }
}

/**
 * Add manual decrypt button
 */
function addManualDecryptButton(element: HTMLElement) {
  if (isWithinEditable(element)) return;

  // Determine target rect
  const rect = element.getBoundingClientRect();
  const button = document.createElement('button');
  button.textContent = '🔒 Decrypt';
  button.className = 'quack-manual-decrypt-btn';
  button.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.bottom + 6}px;
    background: #ea711a;
    color: white;
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-family: system-ui;
    font-size: 12px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    pointer-events: auto;
  `;
  
  button.onclick = async () => {
    console.log('🦆 decrypt button clicked');
    const text = element.textContent || '';
    const match = text.match(new RegExp(`${QUACK_PREFIX}[A-Za-z0-9+/=]+`));
    
    if (!match) {
      showNotification('❌ No encrypted text found');
      button.remove();
      return;
    }
    
    const encrypted = match[0];
    
    try {
      console.log('🦆 sending decrypt request', encrypted);
    const response = await sendMessageSafe({
      type: 'DECRYPT_MESSAGE',
      payload: { ciphertext: encrypted },
    });
      
      if (response.plaintext) {
        replaceWithDecrypted(element, encrypted, response.plaintext, response.keyName);
        button.remove();
      } else {
        console.log('🦆 decrypt failed response', response);
        showNotification('❌ Could not decrypt message');
      }
    } catch (error) {
      console.error('Manual decryption error:', error);
      showNotification('❌ Decryption failed');
    }
  };
  
  document.body.appendChild(button);
  setTimeout(() => button.remove(), 12000);
}

/**
 * Add failed decrypt indicator
 */
function addDecryptFailedIndicator(element: HTMLElement) {
  const indicator = document.createElement('span');
  indicator.textContent = ' 🔒';
  indicator.title = 'Encrypted message (click to decrypt)';
  indicator.style.cssText = `
    font-size: 0.8em;
    opacity: 0.6;
    cursor: pointer;
    margin-left: 4px;
  `;
  
  indicator.onclick = () => addManualDecryptButton(element);
  
  element.appendChild(indicator);
}

/**
 * Show warning for excessive encrypted messages
 */
function showExcessiveQuacksWarning() {
  const banner = document.createElement('div');
  banner.className = 'quack-warning-banner';
  banner.innerHTML = `
    <div style="
      position: fixed;
      top: 10px;
      right: 10px;
      background: #f59e0b;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 999999;
      font-family: system-ui;
      max-width: 350px;
    ">
      <strong>⚠️ Excessive encrypted messages detected</strong>
      <p style="margin: 8px 0 0; font-size: 14px;">
        Auto-decryption limited to ${MAX_AUTO_DECRYPTS} messages per page.
        Use manual decrypt buttons for others.
      </p>
      <button onclick="this.parentElement.parentElement.remove()" style="
        margin-top: 8px;
        background: white;
        color: #f59e0b;
        border: none;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
      ">Dismiss</button>
    </div>
  `;
  
  document.body.appendChild(banner);
}

/**
 * Inline highlight for Quack ciphers inside editable fields (no selection needed)
 */
function updateInlineHighlight(target: HTMLElement, value: string) {
  if (!document.body.contains(target)) {
    cleanupInlineHighlight();
    return;
  }

  const matches = collectQuackMatches(value);
  if (matches.length === 0) {
    cleanupInlineHighlight();
    return;
  }

  const rects = getQuackRects(target, matches);
  const signature = buildInlineSignature(value, rects);
  if (signature === lastInlineSignature) return;
  lastInlineSignature = signature;
  renderInlineUnderlines(rects);
}

function collectQuackMatches(value: string): string[] {
  const regex = new RegExp(`${QUACK_PREFIX}[A-Za-z0-9+/=]+`, 'g');
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(value)) !== null) {
    found.push(m[0]);
  }
  return found;
}

function renderInlineUnderlines(items: Array<{ rect: DOMRect; encrypted: string; matchId: string }>) {
  // Remove old underlines/cards
  inlineItems.forEach(i => {
    i.underline.remove();
    i.hitbox.remove();
  });
  inlineItems = [];
  inlineCardEl?.remove();
  inlineCardEl = null;
  inlineEncrypted = null;
  inlineActiveMatchId = null;
  inlineHoverCounts = new Map<string, number>();

  items.forEach(item => {
    const u = document.createElement('div');
    u.className = 'quack-underline';
    u.style.left = `${item.rect.left}px`;
    u.style.top = `${item.rect.bottom - 3}px`;
    u.style.width = `${item.rect.width}px`;
    u.style.height = `3px`;
    u.style.pointerEvents = 'none';
    const hit = document.createElement('div');
    hit.className = 'quack-underline-hit';
    hit.style.left = `${item.rect.left}px`;
    // Keep the hover hitbox narrow near the underline so clicks still reach text
    hit.style.top = `${item.rect.bottom - 6}px`;
    hit.style.width = `${item.rect.width}px`;
    hit.style.height = `6px`;
    hit.tabIndex = -1;
    hit.addEventListener('mouseenter', () => {
      inlineHovering = true;
      if (inlineHideTimer) {
        clearTimeout(inlineHideTimer);
        inlineHideTimer = null;
      }
      // Clear hover state for all other matches to avoid stuck dark underlines
      inlineHoverCounts.forEach((_, key) => {
        if (key !== item.matchId) {
          inlineHoverCounts.set(key, 0);
          setUnderlineHover(key, false);
        }
      });
      inlineHoverCounts.set(item.matchId, 1);
      setUnderlineHover(item.matchId, true);
      inlineActiveMatchId = item.matchId;
      showInlineCardFor(item, u);
    });
    hit.addEventListener('mouseleave', () => {
      inlineHovering = false;
      const count = inlineHoverCounts.get(item.matchId) ?? 0;
      const next = Math.max(0, count - 1);
      inlineHoverCounts.set(item.matchId, next);
      if (!inlineCardEl && next === 0) {
        setUnderlineHover(item.matchId, false);
      }
      scheduleInlineHide();
    });
    document.body.appendChild(u);
    document.body.appendChild(hit);
    inlineItems.push({ underline: u, hitbox: hit, rect: item.rect, encrypted: item.encrypted, matchId: item.matchId });
  });
}

function cleanupInlineHighlight() {
  if (inlineHideTimer) {
    clearTimeout(inlineHideTimer);
    inlineHideTimer = null;
  }
  inlineHovering = false;
  inlineItems.forEach(i => {
    i.underline.remove();
    i.hitbox.remove();
  });
  inlineItems = [];
  inlineCardEl?.remove();
  inlineCardEl = null;
  inlineEncrypted = null;
  inlineActiveMatchId = null;
  inlineHoverCounts.clear();
  lastInlineSignature = null;
}

function scheduleInlineHide() {
  if (inlineHideTimer) clearTimeout(inlineHideTimer);
  inlineHideTimer = setTimeout(() => {
    inlineHideTimer = null;
    if (inlineHovering) return;
    removeInlineCardOnly();
  }, 1300);
}

function showInlineCardFor(item: { rect: DOMRect; encrypted: string; matchId: string }, underlineEl: HTMLElement) {
  if (inlineHideTimer) {
    clearTimeout(inlineHideTimer);
    inlineHideTimer = null;
  }
  inlineHovering = true;
  inlineEncrypted = item.encrypted;
  underlineEl.classList.add('hovered');

  if (inlineCardEl) {
    positionCard(getAnchorRectForMatch(item.matchId, item.rect), inlineCardEl);
    return;
  }

  inlineCardEl = document.createElement('div');
  inlineCardEl.className = 'quack-selection-card';
  inlineCardEl.innerHTML = `
    <button class="quack-card-btn quack-card-primary" aria-label="Decrypt with Quack">🦆 Duck it</button>
    <button class="quack-card-btn quack-card-secondary" aria-label="Dismiss action">🗑️ Dismiss</button>
  `;

  inlineCardEl.addEventListener('mouseenter', () => {
    inlineHovering = true;
    if (inlineHideTimer) {
      clearTimeout(inlineHideTimer);
      inlineHideTimer = null;
    }
    setUnderlineHover(item.matchId, true);
  });

  inlineCardEl.addEventListener('mouseleave', () => {
    const remaining = inlineHoverCounts.get(item.matchId) ?? 0;
    if (remaining === 0) setUnderlineHover(item.matchId, false);
    inlineHovering = false;
    scheduleInlineHide();
  });

  document.body.appendChild(inlineCardEl);
  positionCard(getAnchorRectForMatch(item.matchId, item.rect), inlineCardEl);

  inlineCardEl.querySelector('.quack-card-primary')?.addEventListener('click', async () => {
    if (!inlineEncrypted) return;
    const anchorRect = getAnchorRectForMatch(item.matchId, item.rect);
    await openDecryptBubble(inlineEncrypted, anchorRect);
    cleanupInlineHighlight();
  });

  inlineCardEl.querySelector('.quack-card-secondary')?.addEventListener('click', () => {
    cleanupInlineHighlight();
  });
}

function getAnchorRectForMatch(matchId: string, fallback: DOMRect): DOMRect {
  const matches = inlineItems.filter(i => i.matchId === matchId);
  if (matches.length === 0) return fallback;
  // Choose the rect with the greatest bottom (lowest on screen) for this occurrence
  const target = matches.reduce((acc, cur) => (cur.rect.bottom > acc.rect.bottom ? cur : acc), matches[0]);
  return target.rect;
}

function getQuackRects(element: HTMLElement, matches: string[]): Array<{ rect: DOMRect; encrypted: string; matchId: string }> {
  if ((element as HTMLElement).isContentEditable) {
    return getRectsFromContentEditable(element, matches);
  }
  // Fallback for inputs/textareas: use whole element
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return [];
  return matches.map((m, idx) => ({ rect, encrypted: m, matchId: `match-${idx}` }));
}

function getRectsFromContentEditable(element: HTMLElement, _matches: string[]): Array<{ rect: DOMRect; encrypted: string; matchId: string }> {
  const items: Array<{ rect: DOMRect; encrypted: string; matchId: string }> = [];
  const regex = new RegExp(`${QUACK_PREFIX}[A-Za-z0-9+/=]+`, 'g');
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let matchCounter = 0;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const rects = Array.from(range.getClientRects());
      const matchId = `match-${matchCounter++}`;
      rects.forEach(r => {
        if (r.width > 0 && r.height > 0) {
          items.push({ rect: r, encrypted: m![0], matchId });
        }
      });
      range.detach();
    }
  }
  return items;
}

function buildInlineSignature(value: string, rects: Array<{ rect: DOMRect; encrypted: string; matchId: string }>): string {
  const rectSig = rects
    .map(r => `${r.matchId}:${r.encrypted}:${Math.round(r.rect.left)}:${Math.round(r.rect.top)}:${Math.round(r.rect.width)}:${Math.round(r.rect.height)}`)
    .join('|');
  return `${value}|${rectSig}`;
}

function injectSelectionStyles() {
  if (document.querySelector('#quack-selection-styles')) return;
  const style = document.createElement('style');
  style.id = 'quack-selection-styles';
  style.textContent = `
    @keyframes quack-underline-sweep {
      from { transform: scaleX(0); opacity: 0.8; }
      to { transform: scaleX(1); opacity: 1; }
    }
    .quack-underline {
      position: fixed;
      min-height: 3px;
      background: #f4b777;
      transform-origin: left center;
      animation: quack-underline-sweep 180ms ease-out forwards;
      z-index: 999999;
      pointer-events: none;
      opacity: 1;
      transition: background 160ms ease, box-shadow 160ms ease;
      box-shadow: 0 0 0 1px rgba(234, 113, 26, 0.25);
    }
    .quack-underline.hovered {
      background: #ea711a;
      box-shadow: 0 0 0 1px rgba(219, 88, 16, 0.35);
    }
    .quack-underline-hit {
      position: fixed;
      background: transparent;
      z-index: 999999;
      pointer-events: auto;
    }
    .quack-selection-card {
      position: fixed;
      background: #ffffff;
      color: #111827;
      border-radius: 12px;
      padding: 8px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 12px 30px rgba(17, 24, 39, 0.12);
      z-index: 1000000;
      width: 120px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
    }
    .quack-card-btn {
      border: 1px solid transparent;
      border-radius: 10px;
      padding: 8px 10px;
      cursor: pointer;
      font-weight: 700;
      transition: background-color 140ms ease, color 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
      text-align: left;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      justify-content: flex-start;
      line-height: 1.2;
      white-space: normal;
    }
    .quack-card-btn:focus-visible {
      outline: 2px solid #ea711a;
      outline-offset: 2px;
    }
    .quack-card-primary {
      background: #ea711a;
      color: #ffffff;
      box-shadow: 0 10px 18px rgba(234, 113, 26, 0.18);
    }
    .quack-card-primary:hover {
      background: #db5810;
      box-shadow: 0 12px 22px rgba(219, 88, 16, 0.24);
    }
    .quack-card-secondary {
      background: #ffffff;
      color: #374151;
      border-color: #e5e7eb;
    }
    .quack-card-secondary:hover {
      background: #f9fafb;
      border-color: #f4b777;
      color: #111827;
    }
  `;
  document.head.appendChild(style);
}

function positionCard(anchorRect: DOMRect, card: HTMLElement) {
  const margin = 6;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  
  // Default position: below anchor
  let top = anchorRect.bottom + margin;
  let left = anchorRect.left;
  
  // Measure card
  card.style.visibility = 'hidden';
  card.style.left = '0px';
  card.style.top = '0px';
  const rect = card.getBoundingClientRect();
  const cardWidth = rect.width;
  const cardHeight = rect.height;
  
  // Flip above if off-screen
  if (top + cardHeight > viewportH) {
    top = anchorRect.top - cardHeight - margin;
  }
  
  // Clamp horizontally
  const maxLeft = viewportW - cardWidth - margin;
  if (left > maxLeft) left = maxLeft;
  if (left < margin) left = margin;
  
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.visibility = 'visible';
}

/**
 * Show notification
 */
function showNotification(message: string) {
  const notification = document.createElement('div');
  notification.className = 'quack-notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #1f2937;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 999999;
    font-family: system-ui;
    font-size: 14px;
    animation: slideUp 0.3s ease-out;
  `;
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Safe wrapper for chrome.runtime.sendMessage to handle "Extension context invalidated"
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendMessageSafe<T = any>(msg: any): Promise<T> {
  try {
    console.log('🦆 sendMessage', msg?.type || msg);
    return await chrome.runtime.sendMessage(msg);
  } catch (err) {
    const text = (err as Error)?.message || '';
    if (text.toLowerCase().includes('context invalidated')) {
      console.warn('Extension context invalidated. Reloading page to re-inject scripts.');
      // Force a reload so the new content script attaches to the fresh extension context
      location.reload();
    }
    throw err;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

