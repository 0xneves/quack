/**
 * Quack Side Panel
 * 
 * SECURITY: All decrypted content displays here, never in page DOM.
 * Shows list of all encrypted messages detected via text selection.
 * 
 * Messages are cleared on:
 * - Tab switch
 * - Page refresh/navigation
 * - Panel close
 */

// State
let messages = [];
let currentTabId = null;
let currentTabUrl = null;

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
    currentTabUrl = tab.url;
  }
  
  // Notify content script that panel is open
  notifyPanelState(true);
  
  // Listen for messages from background/content script
  chrome.runtime.onMessage.addListener(handleMessage);
  
  // Handle tab changes
  chrome.tabs.onActivated?.addListener(async (activeInfo) => {
    currentTabId = activeInfo.tabId;
    // Clear messages when switching tabs
    clearMessages();
    
    // Get new tab URL
    const tab = await chrome.tabs.get(activeInfo.tabId);
    currentTabUrl = tab.url;
    
    notifyPanelState(true);
  });
  
  // Handle tab URL changes (navigation/refresh)
  chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
    if (tabId === currentTabId) {
      // Clear on URL change or page load complete
      if (changeInfo.url || changeInfo.status === 'complete') {
        if (changeInfo.url && changeInfo.url !== currentTabUrl) {
          console.log('🦆 Tab URL changed, clearing messages');
          currentTabUrl = changeInfo.url;
          clearMessages();
        } else if (changeInfo.status === 'complete') {
          console.log('🦆 Page loaded, clearing messages');
          clearMessages();
        }
        notifyPanelState(true);
      }
    }
  });
  
  render();
}

/**
 * Notify content script about panel state
 */
async function notifyPanelState(open) {
  if (!currentTabId) return;
  try {
    await chrome.tabs.sendMessage(currentTabId, { 
      type: open ? 'SIDEPANEL_OPENED' : 'SIDEPANEL_CLOSED' 
    });
  } catch (e) {
    // Content script may not be loaded yet
    console.log('🦆 Could not notify content script:', e.message);
  }
}

/**
 * Clear all messages
 */
function clearMessages() {
  messages = [];
  render();
}

/**
 * Handle incoming messages
 */
function handleMessage(message, sender) {
  // Only accept messages from the current tab's content script
  if (sender.tab?.id !== currentTabId) {
    return;
  }
  
  if (message.type === 'SIDEPANEL_SYNC') {
    messages = message.payload?.items || [];
    // Sort by detection order (no y-position without underlines)
    render();
  } else if (message.type === 'SIDEPANEL_UPDATE') {
    // Update single message
    const item = message.payload;
    const idx = messages.findIndex(m => m.id === item.id);
    if (idx !== -1) {
      messages[idx] = { ...messages[idx], ...item };
    } else {
      messages.push(item);
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
  
  // Remove button for each message
  const removeBtn = document.createElement('button');
  removeBtn.className = 'action-btn remove';
  removeBtn.textContent = '×';
  removeBtn.title = 'Remove from list';
  removeBtn.onclick = () => removeMessage(msg.id);
  actions.appendChild(removeBtn);
  
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
  cipherPreview.title = 'Click to copy full ciphertext';
  cipherPreview.style.cursor = 'pointer';
  cipherPreview.onclick = () => copyText(msg.encrypted, cipherPreview);
  cipherSection.appendChild(cipherPreview);
  
  content.appendChild(cipherSection);
  card.appendChild(content);
  
  return card;
}

/**
 * Remove a message from the list
 */
function removeMessage(messageId) {
  messages = messages.filter(m => m.id !== messageId);
  render();
}

/**
 * Copy text to clipboard
 */
async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = '✓';
    btn.style.color = '#22c55e';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.color = '';
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
 * Notify content script when panel is closing
 */
window.addEventListener('beforeunload', () => {
  notifyPanelState(false);
});

// Initialize
init();
