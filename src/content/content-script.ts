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
  rect: DOMRect;
  encrypted: string;
  matchId: string;
}> = [];
let lastInlineSignature: string | null = null;
let inlineHovering = false;
function removeInlineCardOnly() {
  if (inlineCardEl) {
    inlineCardEl.remove();
    inlineCardEl = null;
  }
  inlineEncrypted = null;
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
  setupSelectionMenu();
  
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

  document.addEventListener('focusout', () => {
    setActiveEditable(null);
    cleanupInlineHighlight();
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
 * Setup selection-based decryption
 */
function setupSelectionMenu() {
  let underlineEl: HTMLElement | null = null;
  let cardEl: HTMLElement | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  
  const cleanup = () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    underlineEl?.remove();
    cardEl?.remove();
    underlineEl = null;
    cardEl = null;
  };
  
  document.addEventListener('mouseup', () => {
    cleanup();
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const selectedText = selection.toString();
    const match = selectedText.match(new RegExp(`${QUACK_PREFIX}[A-Za-z0-9+/=]+`));
    if (!match) return;
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    
    // Create animated underline
    underlineEl = document.createElement('div');
    underlineEl.className = 'quack-underline';
    underlineEl.style.left = `${rect.left}px`;
    underlineEl.style.top = `${rect.bottom - 2}px`;
    underlineEl.style.width = `${rect.width}px`;
    document.body.appendChild(underlineEl);
    // Keep underline dark while modal is open after initial sweep
    hoverTimer = setTimeout(() => {
      underlineEl?.classList.add('hovered');
    }, 200);
    
    // Create action card
    cardEl = document.createElement('div');
    cardEl.className = 'quack-selection-card';
    cardEl.innerHTML = `
      <button class="quack-card-btn quack-card-primary">Decrypt with Quack</button>
      <button class="quack-card-btn quack-card-secondary">Dismiss</button>
    `;
    document.body.appendChild(cardEl);
    
    positionCard(rect, cardEl);
    
    // Button handlers
    cardEl.querySelector('.quack-card-primary')?.addEventListener('click', async () => {
      const encrypted = match[0];
      try {
        const response = await sendMessageSafe({
          type: 'DECRYPT_MESSAGE',
          payload: { ciphertext: encrypted },
        });
        
        if (response.plaintext) {
          showNotification(`✅ Decrypted: ${response.plaintext.substring(0, 50)}...`);
        } else {
          showNotification('❌ Could not decrypt message');
        }
      } catch (error) {
        console.error('Selection decryption error:', error);
        showNotification('❌ Decryption failed');
      }
      cleanup();
    });
    
    cardEl.querySelector('.quack-card-secondary')?.addEventListener('click', cleanup);
  });
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
  inlineItems.forEach(i => i.underline.remove());
  inlineItems = [];
  inlineCardEl?.remove();
  inlineCardEl = null;
  inlineEncrypted = null;

  items.forEach(item => {
    const u = document.createElement('div');
    u.className = 'quack-underline';
    u.style.left = `${item.rect.left}px`;
    u.style.top = `${item.rect.bottom - 2}px`;
    u.style.width = `${item.rect.width}px`;
    u.style.pointerEvents = 'auto';
    u.addEventListener('mouseenter', () => {
      inlineHovering = true;
      if (inlineHideTimer) {
        clearTimeout(inlineHideTimer);
        inlineHideTimer = null;
      }
      showInlineCardFor(item, u);
    });
    u.addEventListener('mouseleave', () => {
      inlineHovering = false;
      scheduleInlineHide();
    });
    document.body.appendChild(u);
    inlineItems.push({ underline: u, rect: item.rect, encrypted: item.encrypted, matchId: item.matchId });
    // keep underline dark after initial sweep
    setTimeout(() => u.classList.add('hovered'), 200);
  });
}

function cleanupInlineHighlight() {
  if (inlineHideTimer) {
    clearTimeout(inlineHideTimer);
    inlineHideTimer = null;
  }
  inlineHovering = false;
  inlineItems.forEach(i => i.underline.remove());
  inlineItems = [];
  inlineCardEl?.remove();
  inlineCardEl = null;
  inlineEncrypted = null;
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
    <button class="quack-card-btn quack-card-primary">Decrypt with Quack</button>
    <button class="quack-card-btn quack-card-secondary">Dismiss</button>
  `;

  inlineCardEl.addEventListener('mouseenter', () => {
    inlineHovering = true;
    if (inlineHideTimer) {
      clearTimeout(inlineHideTimer);
      inlineHideTimer = null;
    }
    underlineEl.classList.add('hovered');
  });

  inlineCardEl.addEventListener('mouseleave', () => {
    underlineEl.classList.remove('hovered');
    inlineHovering = false;
    scheduleInlineHide();
  });

  document.body.appendChild(inlineCardEl);
  positionCard(getAnchorRectForMatch(item.matchId, item.rect), inlineCardEl);

  inlineCardEl.querySelector('.quack-card-primary')?.addEventListener('click', async () => {
    if (!inlineEncrypted) return;
    try {
      const response = await sendMessageSafe({
        type: 'DECRYPT_MESSAGE',
        payload: { ciphertext: inlineEncrypted },
      });
      if (response.plaintext) {
        showNotification(`✅ Decrypted: ${response.plaintext.substring(0, 50)}...`);
      } else {
        showNotification('❌ Could not decrypt message');
      }
    } catch (error) {
      console.error('Inline decryption error:', error);
      showNotification('❌ Decryption failed');
    }
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
      height: 2px;
      background: linear-gradient(90deg, #fca55d 0%, #f97316 100%);
      transform-origin: left center;
      animation: quack-underline-sweep 180ms ease-out forwards;
      z-index: 999999;
      pointer-events: none;
      opacity: 1;
    }
    .quack-underline.hovered {
      background: linear-gradient(90deg, #f97316 0%, #ea580c 100%);
    }
    .quack-selection-card {
      position: fixed;
      background: #1f2937;
      color: white;
      border-radius: 10px;
      padding: 10px;
      box-shadow: 0 8px 20px rgba(0,0,0,0.35);
      z-index: 1000000;
      width: 180px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
    }
    .quack-card-btn {
      border: none;
      border-radius: 6px;
      padding: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: background-color 120ms ease, color 120ms ease;
    }
    .quack-card-primary {
      background: #f97316;
      color: white;
    }
    .quack-card-primary:hover {
      background: #ea580c;
    }
    .quack-card-secondary {
      background: #374151;
      color: #e5e7eb;
    }
    .quack-card-secondary:hover {
      background: #4b5563;
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

