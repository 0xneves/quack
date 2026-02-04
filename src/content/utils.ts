/**
 * Content Script Utilities
 * 
 * Shared helpers and safe wrappers for the content script modules.
 */

import { isEditableElement } from '@/utils/helpers';

/**
 * Check if an element lives inside an editable context
 */
export function isWithinEditable(element: HTMLElement): boolean {
  if (isEditableElement(element)) return true;
  return Boolean(
    element.closest('input, textarea, [contenteditable="true"], [contenteditable=""]')
  );
}

/**
 * Get the root editable element from a given element
 */
export function getEditableRoot(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    if (isEditableElement(node)) return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Check if error message indicates vault is locked
 */
export function isLockedError(msg?: string | null): boolean {
  if (!msg) return false;
  return msg.toLowerCase().includes('locked');
}

/**
 * Request vault unlock via popup
 */
export function requestUnlock(): void {
  chrome.runtime.sendMessage({ type: 'OPEN_UNLOCK' });
}

/**
 * Safe wrapper for chrome.runtime.sendMessage to handle "Extension context invalidated"
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendMessageSafe<T = any>(msg: any): Promise<T> {
  try {
    console.log('🦆 sendMessage', msg?.type || msg);
    return await chrome.runtime.sendMessage(msg);
  } catch (err) {
    const text = (err as Error)?.message || '';
    if (text.toLowerCase().includes('context invalidated')) {
      console.warn('Extension context invalidated. Reloading page to re-inject scripts.');
      location.reload();
    }
    throw err;
  }
}

/**
 * Position a card element relative to an anchor rect
 */
export function positionCard(anchorRect: DOMRect, card: HTMLElement): void {
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
 * Get a Range for a text offset within an element
 */
export function getRangeForOffset(root: HTMLElement, start: number, length: number): Range | null {
  if (start < 0 || length <= 0) return null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = start;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    const text = textNode.textContent || '';
    if (remaining <= text.length) {
      const range = document.createRange();
      const rangeStart = Math.max(0, remaining);
      const rangeEnd = Math.min(text.length, rangeStart + length);
      range.setStart(textNode, rangeStart);
      range.setEnd(textNode, rangeEnd);
      return range;
    }
    remaining -= text.length;
  }
  return null;
}

/**
 * Get anchor rect for a trigger position within an editable
 */
export function getTriggerAnchorRect(editable: HTMLElement, start: number, length: number): DOMRect {
  if (editable.isContentEditable) {
    const range = getRangeForOffset(editable, start, length);
    if (range) {
      const rects = range.getClientRects();
      if (rects.length > 0) return rects[0];
      const rect = range.getBoundingClientRect();
      if (rect) return rect;
    }
  }
  return editable.getBoundingClientRect();
}
