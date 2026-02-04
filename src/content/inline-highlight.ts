/**
 * Content Script Inline Highlights
 * 
 * DISABLED: No longer showing underlines in editable fields.
 * If a user is typing/pasting a Quack message, they already know what it is.
 * Underlines in input fields were confusing and unnecessary.
 * 
 * This module now only provides stub exports for backward compatibility.
 */

// State for active cipher highlights (still used by overlay-manager)
let activeCipherHighlights: HTMLElement[] = [];

/**
 * Clear all active cipher highlight overlays
 */
export function clearActiveCipherHighlights(): void {
  activeCipherHighlights.forEach(el => el.remove());
  activeCipherHighlights = [];
}

/**
 * Update inline highlights for an editable element
 * 
 * DISABLED: Now a no-op. See module header for details.
 */
export function updateInlineHighlight(_target: HTMLElement, _value: string): void {
  // Intentionally empty - feature disabled
}

/**
 * Clean up all inline highlight elements
 */
export function cleanupInlineHighlight(): void {
  clearActiveCipherHighlights();
}

// Register callback to clear highlights when decrypt overlay closes
import { setDecryptOverlayCloseCallback } from './overlay-manager';
setDecryptOverlayCloseCallback(clearActiveCipherHighlights);
