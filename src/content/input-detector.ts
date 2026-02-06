/**
 * Content Script Input Detection
 * 
 * Detects Quack triggers in input fields and shows "Start a secure message?" prompt.
 * All triggers (Quack://, Quack:, quack:, ___) use the same UX flow:
 * 1. User types a trigger pattern
 * 2. "Start a secure message?" prompt appears
 * 3. Clicking "Yes" opens the encrypt bubble
 */

import { debounce, getElementValue } from '@/utils/helpers';
import { getEditableRoot, getTriggerAnchorRect } from './utils';
import { showSecureComposePrompt } from './notifications';
import { updateInlineHighlight } from './inline-highlight';
import { openEncryptBubble, isEncryptOverlayActive, setEncryptOverlayCloseCallback } from './overlay-manager';

// Unified trigger pattern: Quack://, Quack:, quack:, or ___
const TRIGGER_PATTERN = /(?:Quack:\/\/|Quack:|quack:|___)/g;

// State
let activeEditable: HTMLElement | null = null;
let activeObserver: MutationObserver | null = null;

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
 * Find the last trigger match in the text
 */
function findTrigger(value: string): { token: string; index: number } | null {
  const regex = new RegExp(TRIGGER_PATTERN);
  let match: RegExpExecArray | null = null;
  let current: RegExpExecArray | null;
  while ((current = regex.exec(value)) !== null) {
    match = current;
  }
  if (!match) return null;
  return { token: match[0], index: match.index };
}

/**
 * Open the encrypt bubble at the given anchor position
 */
function handleEncryptYes(editable: HTMLElement, anchor: DOMRect): void {
  openEncryptBubble('', anchor, editable).catch(err => {
    console.error('Encrypt overlay error', err);
  });
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

  // Don't show prompt if encrypt overlay is already open
  if (isEncryptOverlayActive()) return;

  // Check for any trigger pattern
  const triggerMatch = findTrigger(value);
  if (triggerMatch) {
    // Don't re-show if the prompt is already visible in the DOM
    const existingPrompt = document.querySelector('.quack-secure-prompt');
    if (existingPrompt) return;

    const anchorRect = getTriggerAnchorRect(editable, triggerMatch.index, triggerMatch.token.length);
    const anchor = anchorRect || editable.getBoundingClientRect();

    showSecureComposePrompt(
      editable,
      () => handleEncryptYes(editable, anchor),
      () => {} // "No" clicked — prompt removes itself, next trigger will work
    );
  } else {
    // Trigger text was deleted — dismiss the prompt immediately
    const existingPrompt = document.querySelector('.quack-secure-prompt');
    if (existingPrompt) existingPrompt.remove();
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

// Clear any lingering prompt when encrypt overlay closes
setEncryptOverlayCloseCallback(() => {
  const prompt = document.querySelector('.quack-secure-prompt');
  if (prompt) prompt.remove();
});
