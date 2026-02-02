# Quack - Development Plan & Technical Specification

## 🎯 Project Vision

**Quack** is a browser extension that enables end-to-end encrypted messaging on any web platform without requiring users to change their communication habits. Users can encrypt messages on YouTube, Twitter, Instagram, or any website, making private communication universally accessible.

---

## 🔑 Core Design Decisions

| Decision Area | Choice | Rationale |
|--------------|--------|-----------|
| **Key Sharing** | Out-of-band (manual copy/paste) | Simplest for MVP, users share keys via secure channels |
| **PQC Algorithm** | CRYSTALS-Kyber | NIST standard, quantum-resistant, ~2KB keys |
| **Prefix Format** | `Quack://` | Clear regex matching, URI-like format |
| **Browser Support** | Chromium (Chrome, Edge, Brave) | Manifest V3, 95% market coverage |
| **Failed Decryption** | Small icon indicator | Non-intrusive, allows manual decrypt |
| **Key Recovery** | None (like Metamask) | Keys lost if password forgotten - user responsibility |
| **Performance** | Viewport scanning + 10 entry limit | Balance between UX and performance |
| **Encryption Visibility** | Show `Quack:` prefix | Users "quacking" - visible indicator |
| **Multi-Key Decrypt** | Sequential key attempts | Simple for MVP, auto-finds correct key |
| **Spam Protection** | >10 entries → manual mode | Prevents DOS, protects performance |

---

## 🏗️ Technology Stack

### **Browser Extension**
- **Manifest V3**: Modern Chrome extension standard
- **TypeScript**: Type safety and better developer experience
- **Build Tool**: Webpack/Vite for bundling

### **Frontend (Popup UI)**
- **React/Preact**: Component-based UI
- **TailwindCSS**: Utility-first styling
- **shadcn/ui**: Modern component library

### **Cryptography**
- **CRYSTALS-Kyber JS**: Post-quantum key generation
- **Web Crypto API (SubtleCrypto)**: AES-256-GCM encryption
- **PBKDF2**: Master password derivation (100k+ iterations)

### **Storage**
- **chrome.storage.local**: Encrypted key vault
- **IndexedDB**: (Optional) for larger data structures

### **Content Script**
- **MutationObserver**: DOM change detection
- **IntersectionObserver**: Viewport visibility tracking
- **Shadow DOM**: UI component isolation
- **Selection API**: Text selection handling

---

## 🔐 Security Architecture

### **Secure Compose Mode** (Critical Feature)

**Problem**: Page-level analytics and keyloggers can capture messages before encryption.

**Solution**: Isolated composition environment

**Flow**:
```
1. User types "Quack://" in any input field
2. Extension detects trigger phrase
3. Prompt appears: "Start a secure message?"
4. User clicks "Yes"
5. Extension popup opens with compose interface
6. User types message in isolated environment
7. User selects encryption key
8. Message encrypted → "Quack://[encrypted_payload]"
9. Result copied to clipboard
10. User pastes back into original field
11. Extension blacklists this ciphertext from auto-decryption
```

**Benefits**:
- ✅ Protects against keyloggers
- ✅ Protects against page analytics (Google Analytics, Hotjar, etc.)
- ✅ Protects against malicious scripts
- ✅ Ensures plaintext never touches the webpage

### **Encryption Blacklist**

**Problem**: Auto-decryption might immediately show plaintext after encryption.

**Solution**: Maintain session-based blacklist of recently encrypted messages.

**Implementation**:
```typescript
// In-memory blacklist (cleared on page reload)
const encryptedMessageBlacklist = new Set<string>();

function encryptMessage(plaintext: string, key: Key): string {
  const ciphertext = encrypt(plaintext, key);
  encryptedMessageBlacklist.add(ciphertext);
  return `Quack://${ciphertext}`;
}

function shouldAttemptDecrypt(text: string): boolean {
  const ciphertext = text.replace(/^Quack:\/\//, '');
  return !encryptedMessageBlacklist.has(ciphertext);
}
```

### **Performance & DOS Protection**

**Problem**: Malicious pages could inject thousands of fake "Quack://" entries.

**Solution**: Viewport-based scanning with entry limits.

**Rules**:
- Only scan elements currently in viewport (IntersectionObserver)
- If >10 encrypted messages in viewport:
  - Disable auto-decryption
  - Show warning banner: "⚠️ Excessive encrypted messages detected. Manual decryption required."
  - Add manual decrypt button to each message

### **Key Storage Security**

```
Master Password (user input)
    ↓
PBKDF2 (100k iterations, salt)
    ↓
Derived Encryption Key (DEK)
    ↓
Encrypt Key Vault with DEK
    ↓
Store in chrome.storage.local
```

**Properties**:
- Keys never stored in plaintext
- Master password never stored
- Keys cleared from memory after use
- Vault locked after 15 min inactivity (optional feature)

---

## 📋 Development Phases & Timeline

### **Phase 1: Foundation (3-4 days)**

**Deliverables**:
- ✅ Extension boilerplate with Manifest V3
- ✅ TypeScript configuration
- ✅ Build system (Webpack/Vite)
- ✅ Content script injection
- ✅ Background service worker
- ✅ Popup scaffold

**Tasks**:
```
- Initialize project structure
- Set up manifest.json
- Configure build pipeline
- Create content script entry point
- Create background service worker
- Create popup HTML/CSS/JS skeleton
- Test extension loading in Chrome
```

---

### **Phase 2: Cryptography Core (4-5 days)**

**Deliverables**:
- ✅ CRYSTALS-Kyber integration
- ✅ AES-256-GCM encryption wrapper
- ✅ Key generation module
- ✅ Master password derivation
- ✅ Encrypted storage vault

**Tasks**:
```
- Research and integrate Kyber JS library
- Implement key generation functions
- Create AES-256-GCM encrypt/decrypt functions
- Build PBKDF2 password derivation
- Create secure storage abstraction
- Unit tests for crypto functions
- Benchmark encryption/decryption speed
```

**Technical Details**:

```typescript
// Key Generation
interface QuackKey {
  id: string;              // UUID
  name: string;            // User-friendly name
  publicKey: Uint8Array;   // Kyber public key
  privateKey: Uint8Array;  // Kyber private key
  aesKey: CryptoKey;       // Derived AES-256 key
  createdAt: number;       // Timestamp
}

// Encryption
async function encryptMessage(plaintext: string, key: QuackKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  // Encrypt with AES-GCM (produces ciphertext + auth tag)
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key.aesKey,
    encoded
  );
  
  // Concatenate: [IV (12 bytes)] + [encrypted_data + auth_tag]
  const blob = new Uint8Array(12 + encryptedData.byteLength);
  blob.set(iv, 0);
  blob.set(new Uint8Array(encryptedData), 12);
  
  // Base64 encode the entire blob
  const ciphertext = base64Encode(blob);
  
  return `Quack://${ciphertext}`;
}

// Decryption
async function decryptMessage(encrypted: string, keys: QuackKey[]): Promise<string | null> {
  const match = encrypted.match(/^Quack:\/\/(.+)$/);
  if (!match) return null;
  
  const ciphertext = match[1];
  const blob = base64Decode(ciphertext);
  
  // Extract IV from first 12 bytes
  const iv = blob.slice(0, 12);
  const encryptedData = blob.slice(12);
  
  // Try all keys sequentially
  for (const key of keys) {
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key.aesKey,
        encryptedData
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      continue; // Wrong key, try next
    }
  }
  
  return null; // No key worked
}
```

---

### **Phase 3: Key Management System (4-5 days)**

**Deliverables**:
- ✅ Master password setup flow
- ✅ Login/unlock interface
- ✅ Key vault CRUD operations
- ✅ Key management UI
- ✅ Key export/import (copy/paste)

**Tasks**:
```
- Design popup UI mockups
- Implement first-time setup wizard
- Create login screen
- Build key management dashboard
- Implement key generation flow
- Add key naming/editing
- Add key deletion with confirmation
- Create key export (show private key)
- Create key import (paste private key)
- Session management (auto-lock after timeout)
```

**UI Screens**:

1. **First-Time Setup**:
   ```
   ╔══════════════════════════════════╗
   ║  Welcome to Quack! 🦆            ║
   ║                                  ║
   ║  Create a master password to     ║
   ║  secure your encryption keys.    ║
   ║                                  ║
   ║  [___________________]  Password ║
   ║  [___________________]  Confirm  ║
   ║                                  ║
   ║  ⚠️ Cannot be recovered if lost! ║
   ║                                  ║
   ║         [Create Vault]           ║
   ╚══════════════════════════════════╝
   ```

2. **Login Screen**:
   ```
   ╔══════════════════════════════════╗
   ║  Quack 🦆                        ║
   ║                                  ║
   ║  Enter your master password      ║
   ║                                  ║
   ║  [___________________]           ║
   ║                                  ║
   ║         [Unlock Vault]           ║
   ╚══════════════════════════════════╝
   ```

3. **Key Management Dashboard**:
   ```
   ╔══════════════════════════════════╗
   ║  Quack 🦆          [⚙️] [🔒Lock] ║
   ╠══════════════════════════════════╣
   ║  Your Encryption Keys            ║
   ║                                  ║
   ║  📝 Personal                     ║
   ║     Created: Jan 1, 2025   [Edit]║
   ║                                  ║
   ║  📝 Work Team                    ║
   ║     Created: Jan 2, 2025   [Edit]║
   ║                                  ║
   ║  📝 Friends Group                ║
   ║     Created: Jan 3, 2025   [Edit]║
   ║                                  ║
   ║     [+ Generate New Key]         ║
   ╚══════════════════════════════════╝
   ```

4. **Key Details Screen**:
   ```
   ╔══════════════════════════════════╗
   ║  ← Back                          ║
   ╠══════════════════════════════════╣
   ║  Key: Personal                   ║
   ║                                  ║
   ║  Name: [Personal________]        ║
   ║                                  ║
   ║  Public Key:                     ║
   ║  ┌──────────────────────────┐   ║
   ║  │ MIIBIjANBgkqhki...       │   ║
   ║  │ (truncated)              │   ║
   ║  └──────────────────────────┘   ║
   ║        [Copy Key] [Share]        ║
   ║                                  ║
   ║  ⚠️ Private Key (Keep Secret)    ║
   ║  [Show Private Key]              ║
   ║                                  ║
   ║        [Save]  [Delete Key]      ║
   ╚══════════════════════════════════╝
   ```

---

### **Phase 4: Secure Compose Mode (5-6 days)**

**Deliverables**:
- ✅ `Quack://` trigger detection in input fields
- ✅ Secure compose popup interface
- ✅ Clipboard integration
- ✅ Encryption blacklist system
- ✅ Focus management

**Tasks**:
```
- Detect "Quack://" being typed in input fields
- Show confirmation prompt overlay
- Create secure compose interface
- Implement rich text composer
- Add key selection dropdown
- Encrypt message on submit
- Copy to clipboard with notification
- Track encrypted messages in blacklist
- Handle paste-back flow
- Test across different input types (textarea, contenteditable, input)
```

**Implementation Details**:

```typescript
// Content Script: Trigger Detection
document.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement;
  if (!isEditableElement(target)) return;
  
  const value = getElementValue(target);
  if (value.endsWith('Quack://')) {
    showSecureComposePrompt(target);
  }
});

function showSecureComposePrompt(inputElement: HTMLElement) {
  const rect = inputElement.getBoundingClientRect();
  
  // Show overlay prompt
  const prompt = createOverlay({
    position: { x: rect.left, y: rect.bottom + 5 },
    content: '🦆 Start a secure message?',
    buttons: [
      { text: 'Yes', action: () => openSecureCompose(inputElement) },
      { text: 'No', action: () => dismissPrompt() }
    ]
  });
  
  document.body.appendChild(prompt);
}

async function openSecureCompose(originalInput: HTMLElement) {
  // Send message to background script
  chrome.runtime.sendMessage({
    type: 'OPEN_SECURE_COMPOSE',
    inputContext: {
      url: window.location.href,
      inputId: generateInputId(originalInput)
    }
  });
  
  // Background script opens popup window
  // User composes message
  // Result is sent back via message passing
}

// Listen for encrypted result
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ENCRYPTED_MESSAGE_READY') {
    // Copy to clipboard
    navigator.clipboard.writeText(message.encrypted);
    
    // Add to blacklist
    encryptedMessageBlacklist.add(message.encrypted);
    
    // Show notification
    showNotification('✅ Encrypted message copied to clipboard!');
  }
});
```

**Secure Compose UI**:
```
╔═══════════════════════════════════════╗
║  Secure Message Compose 🔒            ║
╠═══════════════════════════════════════╣
║  Compose your message securely        ║
║  (protected from page analytics)      ║
║                                       ║
║  ┌─────────────────────────────────┐ ║
║  │                                 │ ║
║  │  [Type your message here...]    │ ║
║  │                                 │ ║
║  │                                 │ ║
║  └─────────────────────────────────┘ ║
║                                       ║
║  Encrypt with key:                    ║
║  [▼ Select Key___________]            ║
║     • Personal                        ║
║     • Work Team                       ║
║     • Friends Group                   ║
║                                       ║
║  [Cancel]        [Encrypt & Copy] 🦆  ║
╚═══════════════════════════════════════╝
```

---

### **Phase 5: Content Detection & Auto-Decryption (5-6 days)**

**Deliverables**:
- ✅ DOM scanning with MutationObserver
- ✅ Viewport tracking with IntersectionObserver
- ✅ `Quack://` pattern detection
- ✅ Auto-decryption engine
- ✅ DOM replacement with decrypted text
- ✅ Visual indicators (🔓 icon)
- ✅ Spam protection (10 entry limit)

**Tasks**:
```
- Set up MutationObserver for DOM changes
- Implement viewport tracking
- Create regex pattern for Quack:// detection
- Build auto-decrypt engine with key iteration
- Replace encrypted text with decrypted text
- Add visual indicators for decrypted content
- Implement viewport limit (max 10 auto-decrypts)
- Show warning banner for excessive entries
- Add manual decrypt buttons
- Handle dynamic content (SPAs, infinite scroll)
- Performance optimization
```

**Implementation**:

```typescript
// Viewport Detection System
class QuackDetector {
  private observer: IntersectionObserver;
  private mutationObserver: MutationObserver;
  private detectedElements = new Set<HTMLElement>();
  private decryptedCount = 0;
  private maxAutoDecrypts = 10;
  
  constructor() {
    this.setupObservers();
  }
  
  setupObservers() {
    // Track visible elements
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          this.onElementVisible(entry.target as HTMLElement);
        }
      });
    }, { threshold: 0.1 });
    
    // Track DOM mutations
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.scanElement(node as HTMLElement);
          }
        });
      });
    });
    
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  scanElement(element: HTMLElement) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent || '';
      if (text.includes('Quack://')) {
        this.observer.observe(node.parentElement!);
      }
    }
  }
  
  async onElementVisible(element: HTMLElement) {
    if (this.detectedElements.has(element)) return;
    this.detectedElements.add(element);
    
    // Check viewport limit
    if (this.decryptedCount >= this.maxAutoDecrypts) {
      this.addManualDecryptButton(element);
      return;
    }
    
    // Auto-decrypt
    const encrypted = this.extractEncryptedText(element);
    if (!encrypted) return;
    
    // Check blacklist
    if (encryptedMessageBlacklist.has(encrypted)) return;
    
    // Attempt decryption
    const keys = await getStoredKeys();
    const plaintext = await this.tryDecrypt(encrypted, keys);
    
    if (plaintext) {
      this.replaceWithDecrypted(element, plaintext);
      this.decryptedCount++;
    } else {
      this.addDecryptFailedIndicator(element);
    }
  }
  
  replaceWithDecrypted(element: HTMLElement, plaintext: string) {
    // Replace text while preserving structure
    const textNode = this.findTextNode(element, /Quack:\/\//);
    if (textNode) {
      const originalText = textNode.textContent || '';
      const newText = originalText.replace(
        /Quack:\/\/[A-Za-z0-9+\/=:]+/g,
        plaintext
      );
      
      // Create wrapper with indicator
      const wrapper = document.createElement('span');
      wrapper.textContent = newText;
      wrapper.style.cssText = 'position: relative;';
      
      const indicator = document.createElement('span');
      indicator.textContent = '🔓';
      indicator.title = 'Decrypted by Quack';
      indicator.style.cssText = `
        font-size: 0.8em;
        margin-left: 4px;
        opacity: 0.6;
        cursor: help;
      `;
      
      wrapper.appendChild(indicator);
      textNode.replaceWith(wrapper);
    }
  }
  
  async tryDecrypt(encrypted: string, keys: QuackKey[]): Promise<string | null> {
    for (const key of keys) {
      try {
        const plaintext = await decryptMessage(encrypted, key);
        if (plaintext) return plaintext;
      } catch {
        continue;
      }
    }
    return null;
  }
  
  addManualDecryptButton(element: HTMLElement) {
    const button = document.createElement('button');
    button.textContent = '🔒 Decrypt';
    button.className = 'quack-manual-decrypt-btn';
    button.onclick = async () => {
      const encrypted = this.extractEncryptedText(element);
      const keys = await getStoredKeys();
      const plaintext = await this.tryDecrypt(encrypted!, keys);
      if (plaintext) {
        this.replaceWithDecrypted(element, plaintext);
      }
    };
    
    element.appendChild(button);
  }
}

// Initialize on page load
const detector = new QuackDetector();
```

**Spam Protection**:

```typescript
// Show warning when limit exceeded
function showExcessiveQuacksWarning() {
  if (document.querySelector('.quack-warning-banner')) return;
  
  const banner = document.createElement('div');
  banner.className = 'quack-warning-banner';
  banner.innerHTML = `
    <div style="
      position: fixed;
      top: 10px;
      right: 10px;
      background: #ff9800;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      z-index: 999999;
      font-family: system-ui;
    ">
      ⚠️ Excessive encrypted messages detected on this page.
      <br>
      Auto-decryption limited to 10 messages.
      <br>
      Use manual decrypt buttons for others.
      <button onclick="this.parentElement.remove()" style="
        margin-top: 8px;
        background: white;
        color: #ff9800;
        border: none;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
      ">Dismiss</button>
    </div>
  `;
  
  document.body.appendChild(banner);
}
```

---

### **Phase 6: Manual Decryption & Selection (4-5 days)**

**Deliverables**:
- ✅ Text selection detection
- ✅ Context menu on selection
- ✅ Manual decrypt flow
- ✅ Key selection UI
- ✅ Error handling

**Tasks**:
```
- Detect text selection events
- Check if selection contains "Quack://"
- Show Grammarly-style floating menu
- Display key options
- Decrypt with selected key
- Replace selected text with plaintext
- Handle errors gracefully
- Add keyboard shortcuts
```

**Implementation**:

```typescript
// Selection Handler
document.addEventListener('mouseup', () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  
  const selectedText = selection.toString();
  if (!selectedText.includes('Quack://')) return;
  
  showDecryptMenu(selection);
});

function showDecryptMenu(selection: Selection) {
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  const menu = createFloatingMenu({
    position: { x: rect.left, y: rect.bottom + 5 },
    title: '🔒 Decrypt Message',
    options: [
      { label: 'Try All Keys', action: () => autoDecryptSelection(selection) },
      { type: 'separator' },
      ...getKeys().map(key => ({
        label: `🔑 ${key.name}`,
        action: () => decryptWithKey(selection, key)
      }))
    ]
  });
  
  document.body.appendChild(menu);
}

async function autoDecryptSelection(selection: Selection) {
  const encrypted = selection.toString();
  const keys = await getStoredKeys();
  
  for (const key of keys) {
    const plaintext = await tryDecrypt(encrypted, key);
    if (plaintext) {
      replaceSelection(selection, plaintext);
      showNotification(`✅ Decrypted with key: ${key.name}`);
      return;
    }
  }
  
  showNotification('❌ No key could decrypt this message');
}
```

---

### **Phase 7: UI Polish & Styling (3-4 days)**

**Deliverables**:
- ✅ Polished popup UI
- ✅ Beautiful floating menus
- ✅ Smooth animations
- ✅ Dark mode support
- ✅ Responsive design
- ✅ Loading states
- ✅ Error states

**Tasks**:
```
- Design system with Tailwind
- Implement component library
- Add transitions and animations
- Create loading spinners
- Design error messages
- Add tooltips and help text
- Implement dark mode toggle
- Test on different screen sizes
- Add accessibility features (ARIA labels)
```

---

### **Phase 8: Testing & Refinement (4-5 days)**

**Deliverables**:
- ✅ Cross-platform testing
- ✅ Performance benchmarks
- ✅ Security audit
- ✅ Bug fixes
- ✅ Documentation

**Test Cases**:
```
Platforms:
- ✅ YouTube (comments)
- ✅ Twitter/X (posts, DMs)
- ✅ Reddit (comments, posts)
- ✅ Instagram (comments - if accessible)
- ✅ Discord Web (messages)
- ✅ WhatsApp Web
- ✅ Gmail (compose)
- ✅ Generic input fields

Scenarios:
- ✅ Encrypt short message (10 chars)
- ✅ Encrypt long message (1000 chars)
- ✅ Decrypt with correct key
- ✅ Decrypt with wrong key
- ✅ Decrypt with multiple keys
- ✅ Secure compose flow
- ✅ Encryption blacklist
- ✅ Viewport limit (>10 messages)
- ✅ Manual decrypt
- ✅ Selection decrypt
- ✅ Page reload persistence
- ✅ Extension restart
- ✅ Master password lock/unlock
- ✅ Key export/import
- ✅ Dynamic content (SPA updates)

Performance:
- ✅ Encryption speed < 100ms
- ✅ Decryption speed < 150ms
- ✅ Page load impact < 50ms
- ✅ Memory usage < 50MB
- ✅ CPU usage minimal

Security:
- ✅ Key storage encrypted
- ✅ Master password never stored
- ✅ Keys cleared from memory
- ✅ No XSS vulnerabilities
- ✅ No key leakage in logs
- ✅ Secure compose isolation
```

---

## 📊 Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| **Phase 1: Foundation** | 3-4 days | Extension skeleton, build system |
| **Phase 2: Cryptography Core** | 4-5 days | Kyber + AES-256, key generation, storage vault |
| **Phase 3: Key Management** | 4-5 days | Master password, popup UI, key CRUD |
| **Phase 4: Secure Compose** | 5-6 days | Trigger detection, isolated composer, blacklist |
| **Phase 5: Auto-Decryption** | 5-6 days | DOM scanning, viewport tracking, spam protection |
| **Phase 6: Manual Decryption** | 4-5 days | Text selection, context menu, key selection |
| **Phase 7: UI Polish** | 3-4 days | Beautiful design, animations, dark mode |
| **Phase 8: Testing** | 4-5 days | Cross-platform testing, security audit, bug fixes |
| **TOTAL** | **~4-5 weeks** | **Functional MVP ready for demo** |

---

## 🎨 User Experience Flows

### **Flow 1: First-Time Setup**
```
1. Install extension
2. Click extension icon
3. See welcome screen: "Welcome to Quack! 🦆"
4. Enter master password (2x for confirmation)
5. Click "Create Vault"
6. Shown key management dashboard (empty)
7. Click "+ Generate New Key"
8. Enter key name: "Personal"
9. Key generated and saved
10. Success notification
```

### **Flow 2: Secure Compose & Encrypt**
```
1. Visit YouTube video
2. Click comment box
3. Type: "Quack://"
4. Overlay appears: "🦆 Start a secure message?"
5. Click "Yes"
6. Extension popup opens
7. Type message: "Hey, check out this link privately!"
8. Select key: "Personal"
9. Click "Encrypt & Copy"
10. Message encrypted: "Quack://h12od1j29DAk29Fd84jfDf39fhaG91..."
11. Copied to clipboard
12. Paste into comment box
13. Post comment showing "Quack://h12od1j29DAk29Fd84jfDf39fhaG91..."
```

### **Flow 3: Auto-Decrypt (Receiver)**
```
1. Visit same YouTube video
2. Page loads with encrypted comment
3. Extension detects "Quack://h12od1j29DAk29Fd84jfDf39fhaG91..."
4. Auto-attempts decryption with all keys
5. Finds matching key "Personal"
6. Decrypts message
7. Comment updates to show: "Hey, check out this link privately! 🔓"
8. Hover over 🔓 shows: "Decrypted with key: Personal"
```

### **Flow 4: Manual Decrypt**
```
1. Page has 15+ encrypted messages
2. First 10 auto-decrypt
3. Warning banner appears: "⚠️ Excessive encrypted messages..."
4. Remaining messages show "🔒 Decrypt" button
5. Click button
6. Message decrypts
7. Or: Select encrypted text
8. Context menu appears
9. Click "Try All Keys"
10. Message decrypts
```

### **Flow 5: Key Sharing**
```
1. Open extension popup
2. Click key "Personal"
3. Click "Copy Key"
4. Key copied to clipboard (base64 encoded)
5. Send via Signal/WhatsApp to friend
6. Friend opens Quack extension
7. Clicks "+ Add Key"
8. Pastes key
9. Enters name: "Shared with Alice"
10. Now can decrypt each other's messages
```

---

## 🚨 Security Considerations

### **Threat Model**

| Threat | Mitigation | Status |
|--------|------------|--------|
| **Page Analytics/Keyloggers** | Secure compose mode (isolated input) | ✅ Implemented |
| **XSS Attacks** | Content script isolation, CSP | ✅ Planned |
| **Master Password Guessing** | PBKDF2 with 100k+ iterations, rate limiting | ✅ Planned |
| **Key Storage Compromise** | AES-256 encryption at rest | ✅ Planned |
| **Memory Dumps** | Clear keys after use, no plaintext logging | ✅ Planned |
| **DOS via Fake Quacks** | Viewport limit, manual mode trigger | ✅ Planned |
| **Phishing Extensions** | Unique extension ID verification | ⚠️ User education needed |
| **Forward Secrecy** | ❌ Not in MVP (static keys) | ⏭️ Future consideration |
| **Metadata Leakage** | ⚠️ Message length/timing visible | ⏭️ Future: padding/delays |

### **Known Limitations**

1. **No Forward Secrecy**: If a key is compromised, all past messages encrypted with it are readable. Future: Implement ratcheting.

2. **Metadata Not Hidden**: Platforms can still see message length, timing, sender/receiver. This is acceptable for MVP.

3. **Client-Side Storage Risk**: Keys stored in browser are vulnerable to malware with full system access. Acceptable tradeoff for convenience.

4. **No Authentication**: No way to verify message sender. Future: Add digital signatures with Dilithium.

5. **Key Distribution**: Manual key sharing is cumbersome. Future: Implement key exchange protocol.

### **User Warnings**

Display in extension:
```
⚠️ SECURITY NOTICE

- Your keys are only as secure as your master password
- If you lose your master password, your keys are GONE forever
- Share keys ONLY via secure channels (Signal, in person, etc.)
- Do NOT share your private keys on platforms you're trying to secure
- This is experimental software - use at your own risk
- Quack protects message content, not metadata (timing, length, etc.)
```

---


## 📚 Technical Reference

### **Encryption Format Specification**

```
Format: Quack://[ciphertext]

Example:
  Quack://h12od1j29DAk29Fd84jfDf39fhaG91

Structure (internal, not exposed):
  - ciphertext = base64([IV (12 bytes)] + [encrypted_data] + [auth_tag (16 bytes)])
  - IV embedded as first 12 bytes of the decoded blob
  - Authentication tag appended by AES-GCM (last 16 bytes)

AES-GCM Parameters:
  - Key Size: 256 bits
  - IV Size: 96 bits (12 bytes)
  - Tag Size: 128 bits (16 bytes)
  - Mode: GCM (Galois/Counter Mode)

Security Notes:
  - No version number exposed (prevents protocol fingerprinting)
  - No key hints (prevents key enumeration attacks)
  - No separate IV field (minimizes metadata leakage)
  - Decryption attempts all keys sequentially until success
```

### **Key Format**

```json
{
  "id": "a3f8b2c1-5e7f-4d9a-b2c3-1a2b3c4d5e6f",
  "name": "Personal",
  "createdAt": 1704067200000,
  "kyberPublicKey": "base64_encoded_public_key",
  "kyberPrivateKey": "base64_encoded_private_key",
  "aesKeyMaterial": "base64_encoded_aes_key"
}
```

### **Storage Schema**

```typescript
// chrome.storage.local structure
interface StorageSchema {
  // Encrypted vault (encrypted with master password-derived key)
  vault: {
    version: number;
    salt: string;        // PBKDF2 salt (base64)
    iv: string;          // AES-GCM IV (base64)
    data: string;        // Encrypted JSON containing keys (base64)
  };
  
  // Settings (not encrypted)
  settings: {
    autoLockTimeout: number;    // Minutes
    darkMode: boolean;
    showNotifications: boolean;
    maxAutoDecrypts: number;    // Default: 10
  };
  
  // Session (cleared on browser close)
  session: {
    unlocked: boolean;
    unlockedAt: number;
    lastActivity: number;
  };
}
```

---

## 📖 Development Standards

### **Code Style**
- TypeScript strict mode
- ESLint + Prettier
- Functional programming preferred
- Descriptive variable names
- Comments for complex logic

### **Git Workflow**
- Feature branches: `feature/secure-compose`
- Commit format: `feat: add secure compose mode`
- PR reviews required
- Semantic versioning

### **Testing Requirements**
- Unit tests for crypto functions (100% coverage)
- Integration tests for key flows
- Manual testing on target platforms
- Security audit before v1.0

---

## 📞 Support & Documentation

### **User Documentation**
- [ ] Installation guide
- [ ] Quick start tutorial
- [ ] Security best practices
- [ ] FAQ
- [ ] Troubleshooting guide

### **Developer Documentation**
- [ ] Architecture overview
- [ ] API reference
- [ ] Build instructions
- [ ] Contributing guidelines
- [ ] Security audit report

---

## ✅ MVP Definition of Done

The MVP is complete when:

- ✅ User can install extension
- ✅ User can create master password
- ✅ User can generate named keys
- ✅ User can encrypt messages via secure compose mode
- ✅ User can decrypt messages automatically (up to 10/viewport)
- ✅ User can decrypt messages manually
- ✅ User can export/import keys
- ✅ Extension works on 5+ major platforms
- ✅ No critical security vulnerabilities
- ✅ Performance is acceptable (<200ms operations)
- ✅ User documentation exists

---

**Version**: 1.0.0  
**Last Updated**: December 10, 2025  
**Project Status**: Planning Complete → Ready for Development

---

*"Make the web quack-tastic! 🦆"*

