/**
 * Content Script Notifications
 * 
 * Toast notifications, warning banners, and user prompts.
 */

import { MAX_AUTO_DECRYPTS } from '@/utils/constants';

/**
 * Show a toast notification
 */
export function showNotification(message: string): void {
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
 * Show warning for excessive encrypted messages on page
 */
export function showExcessiveQuacksWarning(): void {
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
 * Show prompt for secure compose mode (triggered by Quack://)
 */
export function showSecureComposePrompt(
  inputElement: HTMLElement,
  onYes: () => void,
  onNo: () => void
): void {
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
  
  prompt.querySelector('.quack-prompt-yes')?.addEventListener('click', () => {
    prompt.remove();
    onYes();
  });
  
  prompt.querySelector('.quack-prompt-no')?.addEventListener('click', () => {
    prompt.remove();
    onNo();
  });
  
  // Auto-dismiss after 10 seconds
  setTimeout(() => prompt.remove(), 10000);
}

/**
 * Add a failed decrypt indicator to an element
 */
export function addDecryptFailedIndicator(
  element: HTMLElement,
  onClickDecrypt: () => void
): void {
  const indicator = document.createElement('span');
  indicator.textContent = ' 🔒';
  indicator.title = 'Encrypted message (click to decrypt)';
  indicator.style.cssText = `
    font-size: 0.8em;
    opacity: 0.6;
    cursor: pointer;
    margin-left: 4px;
  `;
  
  indicator.onclick = onClickDecrypt;
  element.appendChild(indicator);
}

/**
 * Inject selection/inline highlight styles into the page
 */
export function injectSelectionStyles(): void {
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
      border-radius: 6px;
      padding: 4px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      z-index: 1000000;
      display: flex;
      flex-direction: row;
      gap: 4px;
      align-items: center;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
    }
    .quack-card-btn {
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 6px 12px;
      cursor: pointer;
      font-weight: 600;
      transition: all 150ms ease;
      text-align: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1.2;
      white-space: nowrap;
      min-width: 70px;
    }
    .quack-card-btn:focus-visible {
      outline: 2px solid #ea711a;
      outline-offset: 2px;
    }
    .quack-card-primary {
      background: #ea711a;
      color: #ffffff;
    }
    .quack-card-primary:hover {
      background: #db5810;
      transform: scale(1.02);
    }
    .quack-card-primary:active {
      transform: scale(0.98);
    }
    .quack-card-secondary {
      background: #f3f4f6;
      color: #374151;
      border-color: #e5e7eb;
    }
    .quack-card-secondary:hover {
      background: #e5e7eb;
      color: #111827;
    }
    .quack-card-secondary:active {
      transform: scale(0.98);
    }
    .quack-card-secondary.copied {
      background: #10b981;
      color: #ffffff;
      border-color: #10b981;
    }
  `;
  document.head.appendChild(style);
}
