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
import { debounce, isEditableElement, getElementValue } from '@/utils/helpers';

console.log('🦆 Quack content script loaded');

// Track processed elements and decryption count
const processedElements = new WeakSet<HTMLElement>();
const decryptedElements = new Map<HTMLElement, string>();
let decryptedCount = 0;
let warningShown = false;

/**
 * Initialize content script
 */
function init() {
  setupInputDetection();
  setupDOMScanning();
  setupSelectionMenu();
  
  console.log('✅ Quack content script initialized');
}

/**
 * Setup detection for "Quack://" trigger in input fields
 */
function setupInputDetection() {
  const handleInput = (event: Event) => {
    const target = event.target as HTMLElement;
    
    if (!isEditableElement(target)) return;
    
    const value = getElementValue(target);
    if (value.endsWith('Quack://')) {
      showSecureComposePrompt(target);
    }
  };

  const debouncedHandler = debounce(handleInput, 300);
  document.addEventListener('input', debouncedHandler as unknown as EventListener);
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
      if (parent && !processedElements.has(parent)) {
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
    const response = await chrome.runtime.sendMessage({
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
  // Find and replace text node
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
      
      // Create wrapper with indicator
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
  const button = document.createElement('button');
  button.textContent = '🔒 Decrypt';
  button.className = 'quack-manual-decrypt-btn';
  button.style.cssText = `
    background: #ea711a;
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-family: system-ui;
    font-size: 12px;
    margin-left: 8px;
  `;
  
  button.onclick = async () => {
    const text = element.textContent || '';
    const match = text.match(new RegExp(`${QUACK_PREFIX}[A-Za-z0-9+/=]+`));
    
    if (!match) return;
    
    const encrypted = match[0];
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DECRYPT_MESSAGE',
        payload: { ciphertext: encrypted },
      });
      
      if (response.plaintext) {
        replaceWithDecrypted(element, encrypted, response.plaintext, response.keyName);
        button.remove();
      } else {
        showNotification('❌ Could not decrypt message');
      }
    } catch (error) {
      console.error('Manual decryption error:', error);
      showNotification('❌ Decryption failed');
    }
  };
  
  element.appendChild(button);
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
  let selectionMenu: HTMLElement | null = null;
  
  document.addEventListener('mouseup', () => {
    // Remove existing menu
    if (selectionMenu) {
      selectionMenu.remove();
      selectionMenu = null;
    }
    
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    
    const selectedText = selection.toString();
    if (!selectedText.includes(QUACK_PREFIX)) return;
    
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    selectionMenu = document.createElement('div');
    selectionMenu.className = 'quack-selection-menu';
    selectionMenu.innerHTML = `
      <div style="
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.bottom + 5}px;
        background: #1f2937;
        color: white;
        padding: 4px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 999999;
        font-family: system-ui;
        font-size: 14px;
      ">
        <button class="quack-decrypt-selection" style="
          background: #ea711a;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          width: 100%;
          font-weight: 600;
        ">🔓 Decrypt with Quack</button>
      </div>
    `;
    
    document.body.appendChild(selectionMenu);
    
    selectionMenu.querySelector('.quack-decrypt-selection')?.addEventListener('click', async () => {
      const match = selectedText.match(new RegExp(`${QUACK_PREFIX}[A-Za-z0-9+/=]+`));
      if (!match) return;
      
      const encrypted = match[0];
      
      try {
        const response = await chrome.runtime.sendMessage({
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
      
      selectionMenu?.remove();
      selectionMenu = null;
    });
  });
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

