# Quack - Installation & Testing Guide

## 🚀 Installation

### Prerequisites
- Node.js 18+ installed
- Chrome, Edge, or Brave browser

### Steps

1. **Clone/Navigate to the project**
   ```bash
   cd /path/to/quack
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```
   
   This creates a `dist/` folder with the compiled extension.

4. **Load in Chrome/Edge/Brave**
   1. Open your browser
   2. Navigate to `chrome://extensions` (or `edge://extensions`)
   3. Enable "Developer mode" (toggle in top-right)
   4. Click "Load unpacked"
   5. Select the `dist/` folder from this project
   6. The Quack extension should now appear in your extensions list!

## 🦆 First-Time Setup

1. **Click the Quack extension icon** in your browser toolbar
2. You'll see the **Setup Screen**
3. Create a **master password** (minimum 8 characters)
4. ⚠️ **Important:** This password cannot be recovered if lost!
5. Click "Create Vault"
6. You'll be taken to the **Dashboard**

## 🔑 Generate Your First Encryption Key

1. From the Dashboard, click **"+ New Key"**
2. Enter a name (e.g., "Personal", "Work", "Friends")
3. Click **"Generate"**
4. Your post-quantum encryption key is now created!

## ✍️ Encrypt a Message (Secure Compose)

### Method 1: Via Dashboard
1. Click the **"✍️ Compose"** button on the Dashboard
2. Type your secret message
3. Select an encryption key
4. Click **"🦆 Encrypt & Copy"**
5. The encrypted message is copied to your clipboard!

### Method 2: Via Trigger (Recommended)
1. Go to any website (e.g., YouTube, Twitter, Reddit)
2. Click on any input field (comment box, post textarea, etc.)
3. Type: `Quack://`
4. A prompt will appear: **"🦆 Start a secure message?"**
5. Click **"Yes"** (this will tell you to use the extension icon)
6. Click the extension icon to open the compose screen
7. Type your message, encrypt, and paste back!

## 🔓 Decrypt a Message

### Auto-Decryption
- When you visit a page with encrypted messages (e.g., `Quack://h12od1j29DAk29Fd84...`)
- The extension **automatically detects and decrypts** them if you have the right key
- Decrypted messages show a **🔓 icon**

### Manual Decryption
1. **Select** an encrypted message with your mouse
2. A menu appears: **"🔓 Decrypt with Quack"**
3. Click it to decrypt

### Spam Protection
- If a page has >10 encrypted messages, auto-decryption stops
- You'll see manual **"🔒 Decrypt"** buttons instead

## 🔒 Lock/Unlock Vault

- **Lock:** Click the 🔒 icon in the Dashboard
- **Unlock:** Enter your master password when prompted
- **Auto-Lock:** Vault automatically locks after 15 minutes of inactivity (configurable)

## 🔄 Share Keys with Friends

To communicate privately with someone:

1. **Generate a key** (e.g., named "Alice & Bob")
2. Click the key in your Dashboard
3. Click **"📋 Copy Key to Share"**
4. ⚠️ **Send this key ONLY via secure channels** (Signal, in-person, etc.)
5. Your friend should:
   - Open their Quack extension
   - Click "+ New Key"
   - **Manually paste and save the key** (Note: import feature pending)

## 🧪 Testing Checklist

### Basic Functionality
- [ ] Install extension without errors
- [ ] Create vault with master password
- [ ] Generate encryption key
- [ ] Encrypt message via secure compose
- [ ] Copy encrypted message to clipboard
- [ ] Paste encrypted message somewhere
- [ ] Auto-decrypt the message on page load
- [ ] Lock and unlock vault

### Cross-Platform Testing
Test encryption/decryption on:
- [ ] YouTube (comments)
- [ ] Twitter/X (posts, replies)
- [ ] Reddit (comments, posts)
- [ ] Discord Web (messages)
- [ ] Generic text input fields
- [ ] Contenteditable divs

### Edge Cases
- [ ] Encrypt very short message (5 chars)
- [ ] Encrypt very long message (1000+ chars)
- [ ] Page with 15+ encrypted messages (spam protection)
- [ ] Decrypt with wrong key (should fail gracefully)
- [ ] Decrypt on page after encrypting (should be blacklisted)
- [ ] Multiple keys, correct key auto-selected

### Security Testing
- [ ] Master password with weak password (should warn)
- [ ] Lock vault, verify content scripts stop working
- [ ] Delete key, verify messages can't be decrypted
- [ ] Export key, import on different browser profile

## 🐛 Troubleshooting

### Extension not loading
- Ensure you selected the `dist/` folder, not the root folder
- Check browser console for errors (F12 → Console)
- Try rebuilding: `npm run build`

### Encryption fails
- Verify vault is unlocked (check extension icon)
- Ensure you have at least one encryption key
- Check browser console for crypto errors

### Auto-decryption not working
- Refresh the page after installing extension
- Check that vault is unlocked
- Verify encrypted message format: `Quack://[base64]`
- Check browser console for errors

### Build errors
- Ensure Node.js 18+ is installed
- Delete `node_modules/` and `dist/`, then:
  ```bash
  npm install
  npm run build
  ```

## 📝 Development Mode

For active development with hot reload:

```bash
npm run dev
```

This watches for file changes and rebuilds automatically.

## 🔧 Known Limitations (MVP)

1. **No key import UI yet** - Keys must be manually added to vault
2. **No mobile support** - Browser extensions only
3. **Placeholder Kyber implementation** - Uses random bytes, not actual CRYSTALS-Kyber
4. **No forward secrecy** - Static keys, no ratcheting
5. **No sender authentication** - No digital signatures
6. **Icons missing** - Extension uses default icons

## 🚀 Next Steps

After successful MVP testing, consider:
- Integrate real CRYSTALS-Kyber library
- Add key import/export UI
- Implement QR code key sharing
- Add settings panel
- Create proper icons
- Security audit
- Performance optimization

---

**Questions? Issues?** Check the browser console (F12) for detailed logs.

**Security Note:** Quack is experimental software. Use at your own risk. Always share keys via secure channels only.

