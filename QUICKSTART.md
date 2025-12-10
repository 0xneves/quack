# 🦆 Quack - Quick Start Guide

> **Get up and running in 5 minutes!**

---

## ⚡ Installation (2 minutes)

```bash
# 1. Navigate to project
cd /Users/axis/Documents/Solidity/Personal/quack

# 2. Install (if not done already)
npm install

# 3. Build
npm run build
```

**Result:** A `dist/` folder is created with your extension!

---

## 📥 Load in Browser (1 minute)

1. Open Chrome (or Edge/Brave)
2. Go to: `chrome://extensions`
3. Toggle **"Developer mode"** ON (top-right corner)
4. Click **"Load unpacked"**
5. Select the **`dist/`** folder
6. ✅ Quack extension is now loaded!

---

## 🔑 First Use (2 minutes)

### Step 1: Create Vault
1. Click the **Quack** extension icon (in toolbar)
2. You'll see: **"Welcome to Quack! 🦆"**
3. Enter a **master password** (min. 8 characters)
4. Confirm password
5. Click **"Create Vault"**
6. 🎉 You're in!

### Step 2: Generate Your First Key
1. From the Dashboard, click **"+ New Key"**
2. Enter a name: **"Test Key"**
3. Click **"Generate"**
4. ⏳ Wait 1-2 seconds
5. ✅ Key appears in your Dashboard!

### Step 3: Encrypt a Message
1. Click **"✍️ Compose"** button
2. Type: **"Hello, this is a secret message!"**
3. Select key: **"Test Key"**
4. Click **"🦆 Encrypt & Copy"**
5. 📋 Encrypted message is now in your clipboard!

### Step 4: Test Decryption
1. Open a new tab (any website, or just a blank tab)
2. Right-click → **"Inspect"** (F12)
3. Go to **Console** tab
4. Paste this code:
   ```javascript
   document.body.innerHTML += '<p>Paste your encrypted message here: <span id="test">[PASTE HERE]</span></p>';
   ```
5. Press **Enter**
6. **Replace `[PASTE HERE]`** with your encrypted message (Ctrl+V)
7. **Refresh the page**
8. 🎉 The message auto-decrypts to: **"Hello, this is a secret message! 🔓"**

---

## 🌐 Real-World Test

### YouTube Test (Most Fun!)

1. Open **YouTube.com**
2. Go to any video
3. Scroll to **comments section**
4. Click in the comment box
5. Type: `Quack://`
6. A prompt appears: **"🦆 Start a secure message?"**
7. Click **"Yes"** (it will tell you to use the extension)
8. Click the **Quack extension icon**
9. Compose your secret message
10. Click **"Encrypt & Copy"**
11. Go back to YouTube and **paste** (Ctrl+V)
12. **Post the comment**
13. **Refresh the page**
14. 🎉 Your comment is now decrypted (only you can see the plaintext)!

**To others without your key:** They just see gibberish like `Quack://aG5kd2poZGo...`

---

## 🎯 Key Features to Try

### ✅ Auto-Decryption
- Paste encrypted messages on **any website**
- They automatically decrypt if you have the right key
- Look for the **🔓 icon**

### ✅ Multiple Keys
- Create keys named **"Personal"**, **"Work"**, **"Friends"**
- Encrypt different messages with different keys
- Extension tries all keys to find the right one

### ✅ Manual Decrypt
- **Select** any encrypted text with your mouse
- Menu appears: **"🔓 Decrypt with Quack"**
- Click to decrypt instantly

### ✅ Spam Protection
- If a page has **>10 encrypted messages**
- Auto-decrypt stops to prevent performance issues
- Manual **"🔒 Decrypt"** buttons appear

---

## 🔒 Security Features

### Vault Lock
- Click **🔒 icon** in Dashboard to lock
- Vault auto-locks after **15 minutes** of inactivity
- Must re-enter password to unlock

### Key Management
- Click any key to view details
- **Copy** key to share with friends (via Signal, etc.)
- **Delete** keys you no longer need

---

## 🐛 Troubleshooting

### Extension not working?
1. Check that vault is **unlocked** (click extension icon)
2. Refresh the webpage you're testing on
3. Check browser console (F12) for errors

### Can't see decrypted message?
1. Make sure you have the **same key** that was used to encrypt
2. Try **selecting the text** and using manual decrypt
3. Verify the message starts with `Quack://`

### Build errors?
```bash
# Delete and reinstall
rm -rf node_modules dist
npm install
npm run build
```

---

## 📚 Next Steps

- Read **INSTALL.md** for detailed setup
- Read **TESTING.md** for comprehensive test cases
- Read **DEVELOPMENT_SUMMARY.md** for technical overview

---

## 🎉 You're Ready!

**Quack is now running and ready to encrypt the web!**

Try it on:
- YouTube comments
- Twitter posts
- Reddit comments
- Discord Web
- Any text field on the internet!

**Remember:** Only people with your encryption key can read your messages. Share keys securely via Signal, in-person, or other trusted channels.

---

*"Make the web quack-tastic! 🦆"*

