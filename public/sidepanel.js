/**
 * Quack Side Panel
 * 
 * SECURITY: All decrypted content displays here, never in page DOM.
 * Shows ONLY decrypted messages - no pending state.
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
  
  // Listen for messages from content script
  chrome.runtime.onMessage.addListener(handleMessage);
  
  // Handle tab changes
  chrome.tabs.onActivated?.addListener(async (activeInfo) => {
    currentTabId = activeInfo.tabId;
    clearMessages();
    
    const tab = await chrome.tabs.get(activeInfo.tabId);
    currentTabUrl = tab.url;
    
    notifyPanelState(true);
  });
  
  // Handle tab URL changes (navigation/refresh)
  chrome.tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
    if (tabId === currentTabId) {
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
  if (sender.tab?.id !== currentTabId) return;
  
  if (message.type === 'SIDEPANEL_SYNC') {
    // Only keep decrypted messages
    messages = (message.payload?.items || []).filter(m => m.decrypted);
    render();
  } else if (message.type === 'SIDEPANEL_UPDATE') {
    const item = message.payload;
    // Only add if decrypted
    if (!item.decrypted) return;
    
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
    const cards = messagesList.querySelectorAll('.message-card');
    cards.forEach(c => c.remove());
    return;
  }
  
  emptyState.style.display = 'none';
  
  // Clear and rebuild
  const cards = messagesList.querySelectorAll('.message-card');
  cards.forEach(c => c.remove());
  
  // Sort by Y position for page order
  messages.sort((a, b) => (a.yPosition || 0) - (b.yPosition || 0));
  
  messages.forEach(msg => {
    const card = createMessageCard(msg);
    messagesList.appendChild(card);
  });
}

/**
 * Create a message card element (decrypted only)
 */
function createMessageCard(msg) {
  const card = document.createElement('div');
  card.className = 'message-card';
  card.dataset.id = msg.id;
  
  const header = document.createElement('div');
  header.className = 'message-header';
  
  const keyInfo = document.createElement('div');
  keyInfo.className = 'message-key';
  keyInfo.innerHTML = `<span>🔑</span> ${msg.decrypted.keyName}`;
  
  const actions = document.createElement('div');
  actions.className = 'message-actions';
  
  // Copy plaintext button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'action-btn copy';
  copyBtn.textContent = 'Copy';
  copyBtn.onclick = () => copyText(msg.decrypted.plaintext, copyBtn);
  actions.appendChild(copyBtn);
  
  // Scroll to button
  const scrollBtn = document.createElement('button');
  scrollBtn.className = 'action-btn';
  scrollBtn.textContent = '📍';
  scrollBtn.title = 'Scroll to message';
  scrollBtn.onclick = () => scrollToMessage(msg.id);
  actions.appendChild(scrollBtn);
  
  // Remove button
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
  
  const plaintext = document.createElement('div');
  plaintext.className = 'message-plaintext';
  plaintext.textContent = msg.decrypted.plaintext || '(empty message)';
  content.appendChild(plaintext);
  
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
  notifyPanelState(false);
});

// Initialize
init();
