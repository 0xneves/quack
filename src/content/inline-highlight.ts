/**
 * Content Script Inline Highlights
 * 
 * Underlines, hover cards, and cipher highlights for Quack messages in editable fields.
 */

import { QUACK_MSG_REGEX } from '@/utils/constants';
import { positionCard } from './utils';
import { openDecryptBubble } from './overlay-manager';

// State
let inlineCardEl: HTMLElement | null = null;
let inlineHideTimer: ReturnType<typeof setTimeout> | null = null;
let inlineEncrypted: string | null = null;
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
let activeCipherHighlights: HTMLElement[] = [];

/**
 * Set hover state on underlines for a given match
 */
function setUnderlineHover(matchId: string, hovered: boolean): void {
  inlineItems
    .filter(i => i.matchId === matchId)
    .forEach(i => i.underline.classList.toggle('hovered', hovered));
}

/**
 * Remove only the inline card (not the underlines)
 */
function removeInlineCardOnly(): void {
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

/**
 * Clear all active cipher highlight overlays
 */
export function clearActiveCipherHighlights(): void {
  activeCipherHighlights.forEach(el => el.remove());
  activeCipherHighlights = [];
}

/**
 * Set a highlight overlay on the cipher text
 */
function setActiveCipherHighlight(matchId: string): void {
  clearActiveCipherHighlights();
  const targets = inlineItems.filter(i => i.matchId === matchId);
  targets.forEach(t => {
    const h = document.createElement('div');
    h.style.position = 'fixed';
    h.style.left = `${t.rect.left}px`;
    h.style.top = `${t.rect.top}px`;
    h.style.width = `${t.rect.width}px`;
    h.style.height = `${t.rect.height}px`;
    h.style.background = 'rgba(247, 146, 101, 0.35)';
    h.style.borderRadius = '4px';
    h.style.pointerEvents = 'none';
    h.style.zIndex = '1000002';
    document.body.appendChild(h);
    activeCipherHighlights.push(h);
  });
}

/**
 * Schedule hiding the inline card after a delay
 */
function scheduleInlineHide(): void {
  if (inlineHideTimer) clearTimeout(inlineHideTimer);
  inlineHideTimer = setTimeout(() => {
    inlineHideTimer = null;
    if (inlineHovering) return;
    removeInlineCardOnly();
  }, 1000);
}

/**
 * Get the anchor rect for a match (lowest rect on screen)
 */
function getAnchorRectForMatch(matchId: string, fallback: DOMRect): DOMRect {
  const matches = inlineItems.filter(i => i.matchId === matchId);
  if (matches.length === 0) return fallback;
  const target = matches.reduce((acc, cur) => (cur.rect.bottom > acc.rect.bottom ? cur : acc), matches[0]);
  return target.rect;
}

/**
 * Show the inline action card for a match
 */
function showInlineCardFor(item: { rect: DOMRect; encrypted: string; matchId: string }, underlineEl: HTMLElement): void {
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
    <button class="quack-card-btn quack-card-primary" aria-label="Decrypt with Quack">Quack?</button>
    <button class="quack-card-btn quack-card-secondary" aria-label="Dismiss action">Dismiss</button>
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
    setActiveCipherHighlight(item.matchId);
    const anchorRect = getAnchorRectForMatch(item.matchId, item.rect);
    await openDecryptBubble(inlineEncrypted, anchorRect);
    cleanupInlineHighlight();
  });

  inlineCardEl.querySelector('.quack-card-secondary')?.addEventListener('click', () => {
    cleanupInlineHighlight();
  });
}

/**
 * Collect all Quack message matches from text
 */
function collectQuackMatches(value: string): string[] {
  const regex = new RegExp(QUACK_MSG_REGEX.source, 'g');
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(value)) !== null) {
    found.push(m[0]);
  }
  return found;
}

/**
 * Get rects for Quack matches within an element
 */
function getQuackRects(element: HTMLElement, matches: string[]): Array<{ rect: DOMRect; encrypted: string; matchId: string }> {
  if ((element as HTMLElement).isContentEditable) {
    return getRectsFromContentEditable(element, matches);
  }
  // Fallback for inputs/textareas: use whole element
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return [];
  return matches.map((m, idx) => ({ rect, encrypted: m, matchId: `match-${idx}` }));
}

/**
 * Get rects from contenteditable element
 */
function getRectsFromContentEditable(element: HTMLElement, _matches: string[]): Array<{ rect: DOMRect; encrypted: string; matchId: string }> {
  const items: Array<{ rect: DOMRect; encrypted: string; matchId: string }> = [];
  const regex = new RegExp(QUACK_MSG_REGEX.source, 'g');
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

/**
 * Build a signature for inline items (for change detection)
 */
function buildInlineSignature(value: string, rects: Array<{ rect: DOMRect; encrypted: string; matchId: string }>): string {
  const rectSig = rects
    .map(r => `${r.matchId}:${r.encrypted}:${Math.round(r.rect.left)}:${Math.round(r.rect.top)}:${Math.round(r.rect.width)}:${Math.round(r.rect.height)}`)
    .join('|');
  return `${value}|${rectSig}`;
}

/**
 * Render underline elements for inline matches
 */
function renderInlineUnderlines(items: Array<{ rect: DOMRect; encrypted: string; matchId: string }>): void {
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
    hit.style.top = `${item.rect.bottom - 6}px`;
    hit.style.width = `${item.rect.width}px`;
    hit.style.height = '6px';
    hit.tabIndex = -1;
    
    hit.addEventListener('mouseenter', () => {
      inlineHovering = true;
      if (inlineHideTimer) {
        clearTimeout(inlineHideTimer);
        inlineHideTimer = null;
      }
      // Clear hover state for all other matches
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

/**
 * Update inline highlights for an editable element
 */
export function updateInlineHighlight(target: HTMLElement, value: string): void {
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

/**
 * Clean up all inline highlight elements
 */
export function cleanupInlineHighlight(): void {
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

// Register callback to clear highlights when decrypt overlay closes
import { setDecryptOverlayCloseCallback } from './overlay-manager';
setDecryptOverlayCloseCallback(clearActiveCipherHighlights);
