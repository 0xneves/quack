/**
 * Quack Side Panel
 * 
 * SECURITY: All decrypted content displays here, never in page DOM.
 * Shows list of all encrypted messages on the current page with their decrypted plaintext.
 */

// State
let messages = [];
let currentTabId = null;

// DOM Elements
const messagesList = document.getElementById('messagesList');
const messageCount = document.getElementById('messageCount');
const emptyState = document.getElementById('emptyState');

/**
 * Initialize side panel
 */
async function init() {
  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    currentTabId = tab.id;
  }
  
  // Notify content script that panel is open
  if (currentTabId) {
    try {
      await chrome.tabs.sendMessage(currentTabId, { type: 'SIDEPANEL_OPENED' });
    } catch (e) {
      // Content script may not be loaded yet
    }
  }
  
  // Listen for messages from background/content script
  chrome.runtime.onMessage.addListener(handleMessage);
  
  // Handle tab changes
  chrome.tabs.onActivated?.addListener(async (activeInfo) => {
    currentTabId = activeInfo.tabId;
    messages = [];
    render();
    try {
      await chrome.tabs.sendMessage(currentTabId, { type: 'SIDEPANEL_OPENED' });
    } catch (e) {
      // Content script may not be loaded
    }
  });
}

/**
 * Handle incoming messages
 */
function handleMessage(message, sender) {
  if (message.type === 'SIDEPANEL_SYNC' && sender.tab?.id === currentTabId) {
    messages = message.payload?.items || [];
    // Sort by Y position to match page order
    messages.sort((a, b) => a.yPosition - b.yPosition);
    render();
  } else if (message.type === 'SIDEPANEL_UPDATE' && sender.tab?.id === currentTabId) {
    // Update single message
    const item = message.payload;
    const idx = messages.findIndex(m => m.id === item.id);
    if (idx !== -1) {
      messages[idx] = { ...messages[idx], ...item };
    } else {
      messages.push(item);
      messages.sort((a, b) => a.yPosition - b.yPosition);
    }
    render();
  }
}

/**
 * Render the messages list
 */
function render() {
  messageCount.textContent = messages.length;
  
  if (messages.length === 0) {
    emptyState.style.display = 'block';
    // Remove all message cards
    const cards = messagesList.querySelectorAll('.message-card');
    cards.forEach(c => c.remove());
    return;
  }
  
  emptyState.style.display = 'none';
  
  // Clear and rebuild
  const cards = messagesList.querySelectorAll('.message-card');
  cards.forEach(c => c.remove());
  
  messages.forEach(msg => {
    const card = createMessageCard(msg);
    messagesList.appendChild(card);
  });
}

/**
 * Create a message card element
 */
function createMessageCard(msg) {
  const card = document.createElement('div');
  card.className = 'message-card' + (msg.decrypted ? '' : ' pending');
  card.dataset.id = msg.id;
  
  const header = document.createElement('div');
  header.className = 'message-header';
  
  const keyInfo = document.createElement('div');
  keyInfo.className = 'message-key';
  keyInfo.innerHTML = `<span>🔑</span> ${msg.decrypted?.keyName || 'Pending decryption...'}`;
  
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  
  if (msg.decrypted) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn copy';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = () => copyText(msg.decrypted.plaintext, copyBtn);
    actions.appendChild(copyBtn);
  } else {
    const decryptBtn = document.createElement('button');
    decryptBtn.className = 'decrypt-btn';
    decryptBtn.textContent = 'Decrypt';
    decryptBtn.onclick = () => requestDecrypt(msg.id);
    actions.appendChild(decryptBtn);
  }
  
  const scrollBtn = document.createElement('button');
  scrollBtn.className = 'action-btn';
  scrollBtn.textContent = '📍';
  scrollBtn.title = 'Scroll to message';
  scrollBtn.onclick = () => scrollToMessage(msg.id);
  actions.appendChild(scrollBtn);
  
  header.appendChild(keyInfo);
  header.appendChild(actions);
  card.appendChild(header);
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  if (msg.decrypted) {
    const plaintext = document.createElement('div');
    plaintext.className = 'message-plaintext';
    plaintext.textContent = msg.decrypted.plaintext || '(empty message)';
    content.appendChild(plaintext);
  } else {
    const pending = document.createElement('div');
    pending.className = 'message-pending';
    pending.textContent = 'Click "Decrypt" to view message';
    content.appendChild(pending);
  }
  
  const cipherSection = document.createElement('div');
  cipherSection.className = 'message-cipher';
  
  const cipherPreview = document.createElement('div');
  cipherPreview.className = 'cipher-preview';
  cipherPreview.textContent = msg.ciphertextPreview || msg.encrypted?.substring(0, 50) + '...';
  cipherPreview.title = msg.encrypted;
  cipherSection.appendChild(cipherPreview);
  
  content.appendChild(cipherSection);
  card.appendChild(content);
  
  return card;
}

/**
 * Copy text to clipboard
 */
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = original;
    }, 1500);
  } catch (e) {
    console.error('Copy failed:', e);
  }
}

/**
 * Request decryption from content script
 */
async function requestDecrypt(messageId) {
  if (!currentTabId) return;
  try {
    await chrome.tabs.sendMessage(currentTabId, {
      type: 'SIDEPANEL_DECRYPT',
      payload: { id: messageId },
    });
  } catch (e) {
    console.error('Decrypt request failed:', e);
  }
}

/**
 * Scroll to message in page
 */
async function scrollToMessage(messageId) {
  if (!currentTabId) return;
  try {
    await chrome.tabs.sendMessage(currentTabId, {
      type: 'SIDEPANEL_SCROLL',
      payload: { id: messageId },
    });
  } catch (e) {
    console.error('Scroll request failed:', e);
  }
}

/**
 * Notify content script when panel is closing
 */
window.addEventListener('beforeunload', () => {
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, { type: 'SIDEPANEL_CLOSED' }).catch(() => {});
  }
});

// Initialize
init();
