/**
 * Content Script Input Detection
 * 
 * Detects Quack:// triggers in input fields, tracks editables, and shows encrypt prompts.
 */

import { debounce, getElementValue } from '@/utils/helpers';
import { getEditableRoot, getTriggerAnchorRect, positionCard } from './utils';
import { showNotification, showSecureComposePrompt } from './notifications';
import { updateInlineHighlight } from './inline-highlight';
import { openEncryptBubble, isEncryptOverlayActive, setEncryptOverlayCloseCallback } from './overlay-manager';

// Encrypt trigger patterns: Quack: or quack: or ___ (but not Quack://)
const ENCRYPT_TRIGGER_PATTERNS = /(Quack:|quack:|___)(?!\/\/)/g;

// State
let activeEditable: HTMLElement | null = null;
let activeObserver: MutationObserver | null = null;
let encryptPromptEl: HTMLElement | null = null;
let encryptPromptCleanup: (() => void) | null = null;
let encryptTriggerToken: string | null = null;
let encryptTriggerIndex: number | null = null;
let encryptTriggerEditable: HTMLElement | null = null;

/**
 * Set the active editable element and observe mutations
 */
function setActiveEditable(el: HTMLElement | null): void {
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
 * Find encrypt trigger in text (last occurrence of Quack: or quack: or ___)
 */
function findEncryptTrigger(value: string): { token: string; index: number } | null {
  const regex = new RegExp(ENCRYPT_TRIGGER_PATTERNS);
  let match: RegExpExecArray | null = null;
  let current: RegExpExecArray | null;
  while ((current = regex.exec(value)) !== null) {
    match = current;
  }
  if (!match) return null;
  return { token: match[1], index: match.index };
}

/**
 * Clear the encrypt prompt
 */
export function clearEncryptPrompt(): void {
  if (encryptPromptEl) {
    encryptPromptEl.remove();
  }
  encryptPromptEl = null;
  encryptTriggerEditable = null;
  encryptTriggerIndex = null;
  encryptTriggerToken = null;
  if (encryptPromptCleanup) {
    encryptPromptCleanup();
    encryptPromptCleanup = null;
  }
}

/**
 * Show the encrypt prompt card
 */
function showEncryptPrompt(
  editable: HTMLElement,
  token: string,
  index: number,
  anchorRect: DOMRect | null
): void {
  if (isEncryptOverlayActive()) return;
  const anchor = anchorRect || editable.getBoundingClientRect();
  
  if (
    encryptPromptEl &&
    encryptTriggerEditable === editable &&
    encryptTriggerIndex === index &&
    encryptTriggerToken === token
  ) {
    positionCard(anchor, encryptPromptEl);
    return;
  }

  clearEncryptPrompt();
  
  const card = document.createElement('div');
  card.className = 'quack-selection-card';
  card.innerHTML = `
    <button class="quack-card-btn quack-card-primary" aria-label="Encrypt with Quack">Duck it</button>
    <button class="quack-card-btn quack-card-secondary" aria-label="Dismiss encrypt prompt">Dismiss</button>
  `;

  const handleOutside = (evt: PointerEvent) => {
    const target = evt.target as Node | null;
    if (target && card.contains(target)) return;
    clearEncryptPrompt();
  };
  
  const handleKeydown = (evt: KeyboardEvent) => {
    if (evt.key === 'Escape') {
      clearEncryptPrompt();
    }
  };
  
  document.addEventListener('pointerdown', handleOutside, true);
  document.addEventListener('keydown', handleKeydown, true);
  
  encryptPromptCleanup = () => {
    document.removeEventListener('pointerdown', handleOutside, true);
    document.removeEventListener('keydown', handleKeydown, true);
  };

  card.querySelector('.quack-card-primary')?.addEventListener('click', () => {
    clearEncryptPrompt();
    openEncryptBubble('', anchor, editable).catch(err => {
      console.error('Encrypt overlay error', err);
    });
  });
  
  card.querySelector('.quack-card-secondary')?.addEventListener('click', () => {
    clearEncryptPrompt();
  });

  encryptPromptEl = card;
  encryptTriggerEditable = editable;
  encryptTriggerIndex = index;
  encryptTriggerToken = token;
  document.body.appendChild(card);
  positionCard(anchor, card);
}

/**
 * Open secure compose (triggered by Quack://)
 */
function openSecureCompose(): void {
  chrome.runtime.sendMessage({
    type: 'OPEN_SECURE_COMPOSE',
    payload: {
      url: window.location.href,
    }
  });
  
  showNotification('Click the Quack extension icon to compose securely');
}

/**
 * Handle input update event
 */
function handleInputUpdate(event: Event): void {
  const target = event.target as HTMLElement;
  const editable = getEditableRoot(target);
  if (!editable) return;
  
  setActiveEditable(editable);
  const value = getElementValue(editable);

  // Check for Quack:// trigger (secure compose)
  if (value.endsWith('Quack://')) {
    showSecureComposePrompt(editable, openSecureCompose, () => {});
  }

  // Check for encrypt trigger (Quack: or quack: or ___)
  const encryptMatch = findEncryptTrigger(value);
  if (encryptMatch && !isEncryptOverlayActive()) {
    const anchorRect = getTriggerAnchorRect(editable, encryptMatch.index, encryptMatch.token.length);
    showEncryptPrompt(editable, encryptMatch.token, encryptMatch.index, anchorRect);
  } else if (!encryptMatch) {
    clearEncryptPrompt();
  }

  // Update inline highlights
  updateInlineHighlight(editable, value);
}

/**
 * Setup input detection listeners
 */
export function setupInputDetection(): void {
  const debouncedHandler = debounce(handleInputUpdate, 200);
  
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

// Register callback to clear encrypt prompt when overlay closes
setEncryptOverlayCloseCallback(clearEncryptPrompt);
