/**
 * Content Script Overlay Manager
 * 
 * Manages encrypt/decrypt overlay iframes, positioning, and messaging.
 */

import { QUACK_PREFIX } from '@/utils/constants';
import { isLockedError, requestUnlock, sendMessageSafe } from './utils';

// Overlay dimensions
const OVERLAY_WIDTH = 340;
const OVERLAY_HEIGHT = 260;
const OVERLAY_MAX_HEIGHT = 420;
const OVERLAY_MIN_HEIGHT = 180;
const OVERLAY_MARGIN = 12;

export type OverlayKind = 'decrypt' | 'encrypt';

const OVERLAY_SRC: Record<OverlayKind, string> = {
  decrypt: 'overlay-decrypt.html',
  encrypt: 'overlay-encrypt.html',
};

type OverlayPayload = Record<string, unknown>;

type OverlayState = {
  frame: HTMLIFrameElement | null;
  ready: boolean;
  readyPromise: Promise<void> | null;
  readyResolve: (() => void) | null;
  messageQueue: OverlayPayload[];
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

// Encrypt overlay state
let encryptOverlayActive = false;
let encryptOverlayDismissCleanup: (() => void) | null = null;

// Callbacks for external integrations
let onEncryptOverlayClose: (() => void) | null = null;
let onDecryptOverlayClose: (() => void) | null = null;

/**
 * Set callback for when encrypt overlay closes
 */
export function setEncryptOverlayCloseCallback(cb: (() => void) | null): void {
  onEncryptOverlayClose = cb;
}

/**
 * Set callback for when decrypt overlay closes
 */
export function setDecryptOverlayCloseCallback(cb: (() => void) | null): void {
  onDecryptOverlayClose = cb;
}

/**
 * Check if encrypt overlay is currently active
 */
export function isEncryptOverlayActive(): boolean {
  return encryptOverlayActive;
}

function stateFor(kind: OverlayKind): OverlayState {
  return overlayStates[kind];
}

function applyOverlayPosition(kind: OverlayKind): void {
  const state = overlayStates[kind];
  if (!state.frame) return;
  state.frame.style.left = `${state.position.left}px`;
  state.frame.style.top = `${state.position.top}px`;
}

function setOverlayPosition(kind: OverlayKind, top: number, left: number): void {
  const state = stateFor(kind);
  const width = state.frame?.offsetWidth || OVERLAY_WIDTH;
  const height = state.frame?.offsetHeight || OVERLAY_HEIGHT;
  const maxLeft = Math.max(0, window.innerWidth - width - OVERLAY_MARGIN);
  const maxTop = Math.max(0, window.innerHeight - height - OVERLAY_MARGIN);
  state.position = {
    top: Math.min(Math.max(OVERLAY_MARGIN, top), maxTop),
    left: Math.min(Math.max(OVERLAY_MARGIN, left), maxLeft),
  };
  applyOverlayPosition(kind);
}

function handleOverlayPortMessage(kind: OverlayKind, event: MessageEvent): void {
  const data = event.data;
  if (!data || data.quackOverlay !== true) return;
  
  switch (data.type) {
    case 'resize': {
      const state = stateFor(kind);
      if (state.frame && typeof data.height === 'number') {
        const clamped = Math.min(OVERLAY_MAX_HEIGHT, Math.max(OVERLAY_MIN_HEIGHT, data.height));
        state.frame.style.height = `${clamped}px`;
        setOverlayPosition(kind, state.position.top, state.position.left);
      }
      break;
    }
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

async function ensureOverlayFrame(kind: OverlayKind): Promise<void> {
  const state = overlayStates[kind];
  if (state.ready && state.frame) return;
  
  if (!state.readyPromise) {
    state.readyPromise = new Promise<void>((resolve) => {
      state.readyResolve = resolve;
    });
    
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL(OVERLAY_SRC[kind]);
    iframe.sandbox = 'allow-scripts allow-popups allow-forms allow-clipboard-write';
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

/**
 * Show an overlay at the given anchor position
 */
export async function showOverlay(kind: OverlayKind, anchor?: DOMRect): Promise<void> {
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

/**
 * Hide an overlay
 */
export function hideOverlay(kind: OverlayKind): void {
  const state = stateFor(kind);
  if (state.frame) {
    state.frame.style.display = 'none';
  }
  state.dragging = false;
  
  if (kind === 'encrypt') {
    encryptOverlayActive = false;
    if (encryptOverlayDismissCleanup) {
      encryptOverlayDismissCleanup();
      encryptOverlayDismissCleanup = null;
    }
    onEncryptOverlayClose?.();
  }
  
  if (kind === 'decrypt') {
    onDecryptOverlayClose?.();
  }
}

/**
 * Send a message to an overlay
 */
export function sendOverlayMessage(kind: OverlayKind, msg: OverlayPayload): void {
  const state = stateFor(kind);
  if (state.portReady && state.port) {
    state.port.postMessage(msg);
    return;
  }
  state.messageQueue.push(msg);
}

function setupEncryptOverlayDismiss(): void {
  if (encryptOverlayDismissCleanup) {
    encryptOverlayDismissCleanup();
  }
  
  const onPointerDown = (evt: PointerEvent) => {
    const frame = overlayStates.encrypt.frame;
    if (!frame) return;
    const target = evt.target as Node | null;
    if (target && frame.contains(target)) return;
    hideOverlay('encrypt');
  };
  
  const onKeydown = (evt: KeyboardEvent) => {
    if (evt.key === 'Escape') {
      hideOverlay('encrypt');
    }
  };
  
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeydown, true);
  
  encryptOverlayDismissCleanup = () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeydown, true);
  };
}

async function handleOverlayEncryptRequest(plaintext: string, keyId: string): Promise<void> {
  if (!keyId) {
    sendOverlayMessage('encrypt', { type: 'encrypt-result', error: 'No key selected' });
    return;
  }
  
  try {
    const resp = await sendMessageSafe({
      type: 'ENCRYPT_MESSAGE',
      payload: { plaintext, keyId },
    });
    
    if (isLockedError(resp?.error)) {
      hideOverlay('encrypt');
      requestUnlock();
      return;
    }
    
    if (resp?.encrypted) {
      const cipher = resp.encrypted.startsWith(QUACK_PREFIX)
        ? resp.encrypted
        : `${QUACK_PREFIX}${resp.encrypted}`;
      sendOverlayMessage('encrypt', { quackOverlay: true, type: 'encrypt-result', cipher });
    } else {
      sendOverlayMessage('encrypt', { quackOverlay: true, type: 'encrypt-result', error: 'Encryption failed' });
    }
  } catch (err) {
    console.error('Overlay encrypt error', err);
    sendOverlayMessage('encrypt', { quackOverlay: true, type: 'encrypt-result', error: 'Encryption failed' });
  }
}

/**
 * Open the decrypt overlay bubble
 */
export async function openDecryptBubble(encryptedMessage: string, anchor: DOMRect): Promise<void> {
  try {
    const response = await sendMessageSafe({
      type: 'DECRYPT_MESSAGE',
      payload: { encryptedMessage },
    });
    
    if (isLockedError(response?.error)) {
      hideOverlay('decrypt');
      requestUnlock();
      return;
    }
    
    await showOverlay('decrypt', anchor);
    
    if (response.plaintext) {
      sendOverlayMessage('decrypt', {
        type: 'open-decrypt',
        ciphertext: encryptedMessage,
        plaintext: response.plaintext,
        keyName: response.keyName,
        quackOverlay: true,
      });
    } else {
      sendOverlayMessage('decrypt', {
        type: 'open-decrypt',
        ciphertext: encryptedMessage,
        plaintext: '',
        error: response.error || 'Could not decrypt message',
        quackOverlay: true,
      });
    }
  } catch (error) {
    console.error('Inline decryption error:', error);
    sendOverlayMessage('decrypt', {
      type: 'open-decrypt',
      ciphertext: encryptedMessage,
      plaintext: '',
      error: 'Decryption failed',
      quackOverlay: true,
    });
  }
}

/**
 * Open the encrypt overlay bubble
 */
export async function openEncryptBubble(
  prefill: string,
  anchor: DOMRect | null,
  editable: HTMLElement
): Promise<void> {
  encryptOverlayActive = true;
  
  const keyResponse = await sendMessageSafe({ type: 'GET_KEYS' });
  const keys = keyResponse.keys || [];
  
  if (!keys.length) {
    encryptOverlayActive = false;
    requestUnlock();
    return;
  }
  
  await showOverlay('encrypt', anchor || editable.getBoundingClientRect());
  setupEncryptOverlayDismiss();
  sendOverlayMessage('encrypt', { quackOverlay: true, type: 'open-encrypt', keys, prefill });
}
