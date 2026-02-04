/**
 * Content Script DOM Scanner
 * 
 * Handles MutationObserver, IntersectionObserver, and element processing
 * for automatic decryption of Quack messages in the DOM.
 */

import { QUACK_MSG_PREFIX, QUACK_MSG_REGEX, MAX_AUTO_DECRYPTS } from '@/utils/constants';
import { isEditableElement, getElementValue, setElementValue } from '@/utils/helpers';
import { isWithinEditable, sendMessageSafe } from './utils';
import { showNotification, showExcessiveQuacksWarning, addDecryptFailedIndicator } from './notifications';

// Track processed elements and decryption count
const processedElements = new WeakSet<HTMLElement>();
const decryptedElements = new Map<HTMLElement, string>();
let decryptedCount = 0;
let warningShown = false;

/**
 * Reset scanner state (called on vault update)
 */
export function resetScannerState(): void {
  decryptedCount = 0;
  warningShown = false;
}

/**
 * Replace encrypted text with decrypted plaintext
 */
function replaceWithDecrypted(
  element: HTMLElement,
  encrypted: string,
  plaintext: string,
  keyName: string
): void {
  // If element is editable, update its value directly
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
      indicator.className = 'quack-decrypted-indicator';
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
 * Add manual decrypt button to an element
 */
function addManualDecryptButton(element: HTMLElement): void {
  if (isWithinEditable(element)) return;

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
    const match = text.match(new RegExp(QUACK_MSG_REGEX.source));
    
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
        payload: { encryptedMessage: encrypted },
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
 * Process an element with encrypted content
 */
async function processElement(element: HTMLElement): Promise<void> {
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
  const match = text.match(new RegExp(QUACK_MSG_REGEX.source));
  
  if (!match) return;
  
  const encrypted = match[0];
  
  // Attempt decryption
  try {
    const response = await sendMessageSafe({
      type: 'DECRYPT_MESSAGE',
      payload: { encryptedMessage: encrypted },
    });
    
    if (response.blacklisted) {
      return;
    }
    
    if (response.plaintext) {
      replaceWithDecrypted(element, encrypted, response.plaintext, response.keyName);
      decryptedCount++;
    } else {
      addDecryptFailedIndicator(element, () => addManualDecryptButton(element));
    }
  } catch (error) {
    console.error('Decryption error:', error);
    addDecryptFailedIndicator(element, () => addManualDecryptButton(element));
  }
}

/**
 * Force process an element even if previously processed
 */
async function forceProcessElement(element: HTMLElement): Promise<void> {
  if (isWithinEditable(element)) return;
  
  if (decryptedCount >= MAX_AUTO_DECRYPTS) {
    if (!element.querySelector('.quack-manual-decrypt')) {
      addManualDecryptButton(element);
    }
    if (!warningShown) {
      showExcessiveQuacksWarning();
      warningShown = true;
    }
    return;
  }
  
  const text = element.textContent || '';
  const match = text.match(new RegExp(QUACK_MSG_REGEX.source));
  if (!match) return;
  
  const encrypted = match[0];
  
  // Skip if already decrypted
  if (element.querySelector('.quack-decrypted-indicator')) return;
  
  try {
    const response = await sendMessageSafe({
      type: 'DECRYPT_MESSAGE',
      payload: { encryptedMessage: encrypted },
    });
    
    if (response.plaintext) {
      replaceWithDecrypted(element, encrypted, response.plaintext, response.keyName);
      decryptedCount++;
      console.log(`🔓 Decrypted message from ${response.keyName || 'unknown'}`);
    }
  } catch (error) {
    console.error('Rescan decrypt error:', error);
  }
}

/**
 * Scan an element tree for encrypted messages
 */
function scanElement(element: HTMLElement, observer: IntersectionObserver): void {
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    if (text.includes(QUACK_MSG_PREFIX)) {
      const parent = node.parentElement;
      if (parent && !processedElements.has(parent) && !isWithinEditable(parent)) {
        observer.observe(parent);
      }
    }
  }
}

/**
 * Force rescan of all text nodes containing Quack messages
 */
function forceRescanDOM(): void {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          forceProcessElement(element);
          observer.unobserve(element);
        }
      });
    },
    { threshold: 0.1 }
  );
  
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  const elementsToRescan = new Set<HTMLElement>();
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent || '';
    if (text.includes(QUACK_MSG_PREFIX)) {
      const parent = node.parentElement;
      if (parent && !isWithinEditable(parent)) {
        elementsToRescan.add(parent);
      }
    }
  }
  
  elementsToRescan.forEach(el => observer.observe(el));
  console.log(`🦆 Rescanning ${elementsToRescan.size} elements with encrypted messages`);
}

/**
 * Rescan page after vault update
 */
export function rescanPage(): void {
  resetScannerState();
  forceRescanDOM();
}

/**
 * Setup DOM scanning with observers
 */
export function setupDOMScanning(): void {
  // Intersection Observer for viewport tracking
  const intersectionObserver = new IntersectionObserver(
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
}
