/**
 * Bubble Decrypt - Secure iframe for displaying decrypted content
 * 
 * SECURITY: This iframe is sandboxed. Plaintext stays here, never touches page DOM.
 */

let port = null;
let currentPlaintext = '';

// DOM Elements
const plaintextEl = document.getElementById('plaintext');
const keyNameEl = document.getElementById('keyName');
const cipherPreviewEl = document.getElementById('cipherPreview');
const copyBtn = document.getElementById('copyBtn');
const closeBtn = document.getElementById('closeBtn');

/**
 * Initialize MessagePort communication with content script
 */
window.addEventListener('message', (event) => {
  const data = event.data;
  if (data?.type === 'init' && event.ports?.[0]) {
    port = event.ports[0];
    port.onmessage = handlePortMessage;
    port.start();
  }
});

/**
 * Handle messages from content script
 */
function handlePortMessage(event) {
  const data = event.data;
  
  switch (data?.type) {
    case 'show':
      showDecrypted(data.plaintext, data.keyName, data.ciphertextPreview);
      break;
    case 'error':
      showError(data.message || 'Decryption failed');
      break;
  }
}

/**
 * Display decrypted content
 */
function showDecrypted(plaintext, keyName, ciphertextPreview) {
  currentPlaintext = plaintext || '';
  plaintextEl.textContent = plaintext || '(empty message)';
  keyNameEl.textContent = keyName ? `Key: ${keyName}` : 'Unknown key';
  cipherPreviewEl.textContent = ciphertextPreview || '';
  cipherPreviewEl.title = ciphertextPreview || '';
}

/**
 * Display error state
 */
function showError(message) {
  plaintextEl.textContent = `❌ ${message}`;
  plaintextEl.style.color = '#ef4444';
  keyNameEl.textContent = 'Error';
  cipherPreviewEl.textContent = '';
}

/**
 * Copy plaintext to clipboard
 */
copyBtn.addEventListener('click', async () => {
  if (!currentPlaintext) return;
  
  // Request copy via content script (clipboard access may be restricted in sandboxed iframe)
  if (port) {
    port.postMessage({ type: 'copy', text: currentPlaintext });
  }
  
  // Also try direct copy
  try {
    await navigator.clipboard.writeText(currentPlaintext);
  } catch (e) {
    // Ignore - copy via port should work
  }
  
  // Visual feedback
  copyBtn.textContent = 'Copied!';
  copyBtn.classList.add('copied');
  setTimeout(() => {
    copyBtn.textContent = 'Copy';
    copyBtn.classList.remove('copied');
  }, 1500);
});

/**
 * Close bubble
 */
closeBtn.addEventListener('click', () => {
  if (port) {
    port.postMessage({ type: 'close' });
  }
});

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && port) {
    port.postMessage({ type: 'close' });
  }
});
