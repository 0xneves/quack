# 🦆 Quack - Universal Web Encryption Extension

[![Tests](https://github.com/0xneves/quack/actions/workflows/test.yml/badge.svg)](https://github.com/0xneves/quack/actions/workflows/test.yml)

> Make the web private without changing platforms.

**Quack** is a browser extension that enables end-to-end encrypted messaging on any website. Communicate privately on YouTube, Twitter, Reddit, or anywhere on the web—without requiring anyone to switch platforms.

## 🎯 Why Quack?

People want secure communications, but moving friends to new platforms is nearly impossible. Signal is secure, but requires everyone to leave their existing apps.

**Quack solves this by encrypting the web itself.**

- **Encrypt anywhere** — YouTube comments, Twitter DMs, Reddit posts, anywhere
- **No platform switching** — Use existing websites with end-to-end encryption
- **Quantum-resistant** — Post-quantum cryptography (ML-KEM-768) + AES-256-GCM
- **Wallet-grade security** — MetaMask-style vault with master password protection

---

## 📦 Installation

### From Source (Development)

1. **Clone the repository**
   ```bash
   git clone https://github.com/0xneves/quack.git
   cd quack
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist/` folder

### Browser Support

- ✅ Chrome
- ✅ Edge
- ✅ Brave
- ✅ Any Chromium-based browser

---

## 🚀 Quick Start

### First Time Setup

1. Click the Quack extension icon
2. Create a master password (this protects your keys)
3. Generate your first encryption key
4. Share the key with trusted contacts (via Signal, in-person, etc.)

### Encrypting Messages

1. Type `Quack://` in any text field on any website
2. A secure compose window opens (isolated from page scripts)
3. Write your message and select which key to encrypt with
4. Click "Encrypt & Copy" — the ciphertext is copied to clipboard
5. Paste into the original field and send

### Decrypting Messages

Messages are **automatically decrypted** when you visit a page:
- The extension scans for `Quack://...` patterns
- If you have the matching key, plaintext appears with a 🔓 indicator
- Only you (and others with the key) can read the message

### Groups

Create groups to share keys with multiple people:
1. Go to Dashboard → Groups → Create Group
2. Generate a group encryption key
3. Share the invite link with trusted members
4. All members can encrypt/decrypt group messages

### Backup & Restore

**Export your vault** (Settings → Export):
- Creates an encrypted backup file
- Protected with a separate export password (20+ characters)
- Safe to store in cloud storage

**Import a backup**:
- Fresh install: "Restore from Backup" on first launch
- Existing vault: Settings → Import to merge keys

---

## ✨ Features

### 🔐 Secure Compose Mode
Type `Quack://` to open an isolated composer — protected from page analytics, keyloggers, and tracking scripts.

### 🤖 Auto-Decryption
Extension automatically detects and decrypts `Quack://` messages using your saved keys.

### 👥 Groups
Create shared encryption groups. Invite members via fingerprint verification.

### 💾 Vault Backup
Export/import your entire vault with AES-256 encryption.

### 🛡️ Wallet-Grade Security
- Session storage (keys never touch disk while unlocked)
- Auto-lock after inactivity
- PBKDF2 key derivation (100k iterations)
- Memory cleared on lock/browser close

### ⚡ Performance Optimized
Smart viewport scanning — only processes visible content. Limits auto-decryption to prevent spam attacks.

---

## 🔒 Security

### Cryptography

| Component | Algorithm | Standard |
|-----------|-----------|----------|
| Key Encapsulation | ML-KEM-768 | NIST FIPS 203 |
| Message Encryption | AES-256-GCM | NIST |
| Key Derivation | PBKDF2-SHA256 | 100k iterations |
| Group Keys | AES-256-GCM | Wrapped with member keys |

### Protections

- ✅ Post-quantum resistant (ML-KEM-768)
- ✅ Keys encrypted at rest
- ✅ Session-only storage (wallet-grade)
- ✅ Isolated compose window (no page script access)
- ✅ Spam protection (10 auto-decrypts per viewport)

### Limitations

- ❌ No forward secrecy (static keys)
- ❌ No sender authentication (no signatures yet)
- ⚠️ Metadata visible to platforms (message length, timing)

---

## 🧪 Development

### Scripts

```bash
npm run build       # Production build
npm run dev         # Development mode with watch
npm run test        # Run test suite
npm run test:watch  # Run tests in watch mode
npm run type-check  # TypeScript type checking
npm run lint        # ESLint
```

### Project Structure

```
src/
├── background/     # Service worker
├── content/        # Content script modules
│   ├── content-script.ts    # Entry point
│   ├── dom-scanner.ts       # MutationObserver, scanning
│   ├── inline-highlight.ts  # Decrypted message display
│   ├── input-detector.ts    # Quack:// trigger detection
│   ├── notifications.ts     # Toast messages
│   ├── overlay-manager.ts   # Secure compose overlay
│   └── utils.ts
├── crypto/         # Cryptographic operations
│   ├── aes.ts      # AES-256-GCM
│   ├── kyber.ts    # ML-KEM-768 (post-quantum)
│   ├── pbkdf2.ts   # Key derivation
│   ├── message.ts  # Message format
│   └── group.ts    # Group key management
├── popup/          # React popup UI
│   ├── screens/    # Dashboard, Settings, Import, etc.
│   └── App.tsx
├── storage/        # Vault and settings
│   ├── vault.ts    # Encrypted key storage
│   ├── settings.ts # Session management
│   └── export.ts   # Backup/restore
└── types/          # TypeScript definitions
```

### Testing

54 tests covering:
- Cryptographic operations (AES, ML-KEM, PBKDF2)
- Message encoding/decoding
- Vault operations
- Export/import flows
- Group key management

```bash
npm test
```

---

## 📄 License

MIT — see [LICENSE](./LICENSE)

---

## 👥 Authors

- **Guilherme Neves** ([@0xneves](https://github.com/0xneves)) — Creator
- **Jarvis** — AI Development Partner

---

**Built with 🦆 for a more private web**

*This is experimental software. Use at your own risk. Always share keys via secure channels.*
