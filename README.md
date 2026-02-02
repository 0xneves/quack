# 🦆 Quack - Universal Web Encryption Extension

> Make the web private without changing platforms.

**Quack** is a browser extension that enables end-to-end encrypted messaging on any website. Communicate privately on YouTube, Twitter, Reddit, or anywhere on the web—without requiring anyone to switch platforms.

---

## 🎯 Vision

People want secure communications, but moving friends to new platforms is nearly impossible. Signal is secure, but requires everyone to leave their existing apps. Quack solves this by **encrypting the web itself**.

### The Problem
- Secure chat apps require everyone to switch platforms
- Private conversations on Twitter/Instagram aren't quantum-resistant
- No universal solution for web privacy

### The Solution
- **Encrypt anywhere**: YouTube comments, Twitter DMs, Reddit posts, anywhere
- **No platform switching**: Use existing websites with end-to-end encryption
- **Quantum-resistant**: Post-quantum cryptography (CRYSTALS-Kyber) + AES-256
- **User-friendly**: Works like Grammarly—automatic and seamless

---

## ✨ Key Features

### 🔐 **Secure Compose Mode**
Type `Quack://` in any input field to open an isolated composer—protected from page analytics, keyloggers, and tracking scripts.

### 🤖 **Auto-Decryption**
Extension automatically detects and decrypts `Quack://` messages on pages using your saved keys.

### 🔑 **Key Management**
Metamask-style key vault with master password protection. Generate, name, and manage multiple encryption keys.

### 🛡️ **Post-Quantum Cryptography**
Future-proof encryption using NIST-standard CRYSTALS-Kyber for key generation + AES-256-GCM for messages.

### ⚡ **Performance Optimized**
Smart viewport scanning—only processes visible content. Limits auto-decryption to prevent spam attacks.

### 🎨 **Beautiful UI**
Grammarly-inspired overlays and modern popup interface with dark mode support.

---

## 🏗️ Technology Stack

### **Browser Extension**
- **Manifest V3**: Modern Chrome extension standard
- **TypeScript**: Type-safe development
- **Webpack/Vite**: Module bundling and build optimization

### **Frontend (Popup Interface)**
- **React/Preact**: Component-based UI architecture
- **TailwindCSS**: Utility-first styling framework
- **shadcn/ui**: Modern, accessible component library

### **Cryptography**
- **CRYSTALS-Kyber**: Post-quantum key encapsulation (NIST standard)
- **Web Crypto API (SubtleCrypto)**: AES-256-GCM encryption
- **PBKDF2**: Password-based key derivation (100,000+ iterations)

### **Storage & Security**
- **chrome.storage.local**: Encrypted key vault storage
- **IndexedDB**: (Optional) for larger data structures
- **Content Security Policy**: XSS protection
- **Isolated Contexts**: Content script isolation from page scripts

### **Content Integration**
- **MutationObserver**: Real-time DOM change detection
- **IntersectionObserver**: Viewport visibility tracking
- **Shadow DOM**: UI component isolation
- **Selection API**: Text selection handling

---

## 🚀 How It Works

### **Encryption Flow**

```
1. User types in any input field: "Quack://"
2. Extension detects trigger and shows prompt
3. User opens secure composer (isolated from page)
4. User types message: "Hello World"
5. User selects encryption key: "Personal"
6. Extension encrypts with AES-256-GCM
7. Result copied to clipboard: "Quack://h12od1j29DAk29Fd84jfDf39fhaG91..."
8. User pastes into original field
9. Message posted publicly (but encrypted)
```

### **Decryption Flow**

```
1. Page loads with encrypted message: "Quack://h12od1j29DAk29Fd84jfDf39fhaG91..."
2. Extension detects "Quack://" prefix
3. Extension tries all saved keys sequentially
4. Finds matching key "Personal"
5. Decrypts message to "Hello World"
6. Updates DOM to show decrypted text with 🔓 icon
7. Only users with the key see the plaintext
```

### **Security Architecture**

```
Master Password (user input)
    ↓
PBKDF2 (100k+ iterations)
    ↓
Derived Encryption Key (DEK)
    ↓
Encrypts Key Vault
    ↓
Stored in chrome.storage.local
    
At Runtime:
    ↓
User unlocks vault with password
    ↓
Keys loaded into memory
    ↓
Used for message encryption/decryption
    ↓
Cleared from memory after use
```

---

## 🔒 Security Features

### **Secure Compose Mode**
Protects against:
- ✅ Page-level keyloggers
- ✅ Analytics tracking (Google Analytics, Hotjar)
- ✅ Malicious scripts
- ✅ Browser extensions snooping on input

### **Encryption Blacklist**
Prevents auto-decryption of recently encrypted messages (avoids showing plaintext immediately after encryption).

### **Spam Protection**
- Auto-decryption limited to 10 messages per viewport
- Warning shown for excessive encrypted content
- Manual decrypt mode for additional messages

### **Key Storage**
- Master password never stored
- Keys encrypted at rest with password-derived key
- Keys cleared from memory after operations
- No key material in logs or console

---

## ⚠️ Security Considerations

**Limitations** (MVP):
- ❌ No forward secrecy (static keys)
- ❌ No sender authentication (no digital signatures)
- ⚠️ Metadata not hidden (message length, timing visible to platforms)
- ⚠️ Client-side storage vulnerable to system-level malware

**User Responsibilities**:
- Use strong master password
- Share keys only via secure channels (Signal, in-person)
- Understand that lost passwords = lost keys forever (no recovery)
- Don't share private keys on platforms you're trying to secure

---

## 📊 Project Status

**Current Phase**: Planning Complete ✅  
**Target MVP Release**: ~4-5 weeks from development start  
**Browser Support**: Chrome, Edge, Brave (Chromium-based)

### **Development Roadmap**

| Phase | Status | Deliverables |
|-------|--------|--------------|
| Phase 1: Foundation | ⏳ Pending | Extension skeleton, build system |
| Phase 2: Cryptography | ⏳ Pending | Kyber + AES-256, key vault |
| Phase 3: Key Management | ⏳ Pending | Master password, popup UI |
| Phase 4: Secure Compose | ⏳ Pending | Trigger detection, isolated composer |
| Phase 5: Auto-Decryption | ⏳ Pending | DOM scanning, viewport tracking |
| Phase 6: Manual Decryption | ⏳ Pending | Text selection, context menu |
| Phase 7: UI Polish | ⏳ Pending | Design, animations, dark mode |
| Phase 8: Testing | ⏳ Pending | Cross-platform testing, security audit |

---

## 🎨 User Interface Preview

### **Key Management Dashboard**
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
║     [+ Generate New Key]         ║
╚══════════════════════════════════╝
```

### **Secure Compose Window**
```
╔═══════════════════════════════════════╗
║  Secure Message Compose 🔒            ║
╠═══════════════════════════════════════╣
║  Compose your message securely        ║
║  (protected from page analytics)      ║
║                                       ║
║  ┌─────────────────────────────────┐ ║
║  │ Type your message here...       │ ║
║  └─────────────────────────────────┘ ║
║                                       ║
║  Encrypt with key:                    ║
║  [▼ Personal_______________]          ║
║                                       ║
║  [Cancel]        [Encrypt & Copy] 🦆  ║
╚═══════════════════════════════════════╝
```

---

## 🔮 Future Enhancements

**Version 2.0**:
- QR code key sharing
- Digital signatures (authentication)
- Forward secrecy with ratcheting
- Group chat support
- Mobile app (React Native)

**Version 3.0**:
- Decentralized key directory
- File/image encryption
- Voice note encryption
- Cross-device sync

---

## 📚 Documentation

- [**PLAN.md**](./PLAN.md) - Comprehensive development plan and technical specification
- **User Guide** (Coming soon)
- **Security Audit** (Post-MVP)
- **API Documentation** (Coming soon)

---

## 🤝 Contributing

This is currently in active development. Contribution guidelines will be published after MVP release.

---

## 📄 License

TBD

---

## 🦆 Philosophy

**"Make the web quack-tastic!"**

Privacy shouldn't require abandoning the platforms you love. Quack brings encryption to your existing web experience—seamlessly, securely, and universally.

---

**Built with 💙 for a more private web**

*Note: This is experimental software. Use at your own risk. Always share keys securely.*
