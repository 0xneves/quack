# Quack - Universal Web Encryption Extension

[![Tests](https://github.com/0xneves/quack/actions/workflows/test.yml/badge.svg)](https://github.com/0xneves/quack/actions/workflows/test.yml)

> Make the web private without changing platforms.

**Quack** is a browser extension that enables end-to-end encrypted messaging on any website. Communicate privately on YouTube, Twitter, Reddit, or anywhere on the web—without requiring anyone to switch platforms.

## Why Quack?

People want secure communications, but moving friends to new platforms is nearly impossible. Signal is secure, but requires everyone to leave their existing apps.

**Quack solves this by encrypting the web itself.**

- **Encrypt anywhere** — YouTube comments, Twitter DMs, Reddit posts, anywhere
- **No platform switching** — Use existing websites with end-to-end encryption
- **Quantum-resistant** — Post-quantum cryptography (ML-KEM-768) + AES-256-GCM
- **Wallet-grade security** — MetaMask-style vault with master password protection

## Installation

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

- Chrome
- Edge
- Brave
- Any Chromium-based browser

## Quick Start

### First Time Setup

1. Click the Quack extension icon
2. Create a master password (this protects your vault)
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
- If you have the matching key, plaintext appears with a lock indicator
- Only you (and others with the key) can read the message

### Groups

Create groups to share encrypted keys with multiple people:

**Creating a group:**
1. Go to Dashboard → Groups → Create Group
2. Name your group — a shared AES-256 key is generated

**Inviting members:**
1. The person must already be in your Contacts (you need their public key)
2. Select the contact → an invite is created encrypted specifically for them
3. Share the invite link — only the intended recipient can decrypt it

**Accepting an invite:**
1. Receive the invite string (`Quack://INV:...`)
2. Your extension detects it automatically (or paste into Dashboard)
3. Your private key decrypts the invite → you receive the group key
4. Now you can encrypt/decrypt group messages

### Backup & Restore

**Export your vault** (Settings → Export):
- Creates an encrypted backup file
- Protected with a separate export password (20+ characters)
- Safe to store in cloud storage

**Import a backup**:
- Fresh install: "Restore from Backup" on first launch
- Existing vault: Settings → Import to merge keys

## Features

### Secure Compose Mode
Type `Quack://` to open an isolated composer — protected from page analytics, keyloggers, and tracking scripts.

### Auto-Decryption
Extension automatically detects and decrypts `Quack://` messages using your saved keys.

### Groups
Create shared encryption groups. Invites are encrypted per-recipient using Kyber key exchange — only the intended contact can accept.

### Vault Backup
Export/import your entire vault with AES-256 encryption.

### Wallet-Grade Security
- Session storage (keys never touch disk while unlocked)
- Auto-lock after inactivity
- Memory cleared on lock/browser close

### Performance Optimized
Smart viewport scanning — only processes visible content. Limits auto-decryption to prevent spam attacks.

## Security

### Cryptography

| Purpose | Algorithm | Notes |
|---------|-----------|-------|
| Key Exchange | ML-KEM-768 | Post-quantum (NIST FIPS 203). Used for secure group invitations. |
| Message Encryption | AES-256-GCM | Symmetric encryption for all messages. |
| Vault Encryption | AES-256-GCM + PBKDF2 | Master password derives key via PBKDF2 (100k iterations). |

### Protections

- Post-quantum resistant key exchange (ML-KEM-768)
- Keys encrypted at rest with master password
- Session-only storage (keys never written to disk while unlocked)
- Isolated compose window (no page script access)
- Spam protection (10 auto-decrypts per viewport)

### Limitations

- No forward secrecy (static keys)
- No sender authentication (no signatures yet)
- Metadata visible to platforms (message length, timing)

## Development

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
│   ├── pbkdf2.ts   # Key derivation for vault
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

## Authors

- **Guilherme Neves** ([@0xneves](https://github.com/0xneves)) — Creator
- **Jarvis** — AI Development Partner

## License

MIT — see [LICENSE](./LICENSE)

---

*This is experimental software. Use at your own risk. Always share keys via secure channels.*
