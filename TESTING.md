# Quack - Comprehensive Testing Guide

## 🎯 Testing Objectives

1. Verify core encryption/decryption functionality
2. Test cross-platform compatibility
3. Validate security features
4. Check performance and UX
5. Identify bugs and edge cases

---

## 📋 Test Plan

### Phase 1: Installation & Setup

**Test 1.1: Extension Installation**
- [ ] Build completes without errors
- [ ] Extension loads in Chrome
- [ ] Extension icon appears in toolbar
- [ ] No console errors on load

**Test 1.2: First-Time Setup**
- [ ] Setup screen appears on first launch
- [ ] Can create master password (8+ chars)
- [ ] Password mismatch is detected
- [ ] Weak password warning shown (< 8 chars)
- [ ] Vault created successfully
- [ ] Redirected to Dashboard

**Test 1.3: Login Flow**
- [ ] After vault creation, can lock vault
- [ ] Login screen appears
- [ ] Correct password unlocks vault
- [ ] Incorrect password shows error
- [ ] Session persists across popup close/open

---

### Phase 2: Key Management

**Test 2.1: Key Generation**
- [ ] "+ New Key" button works
- [ ] Can enter key name
- [ ] Key generates successfully (< 2 seconds)
- [ ] Key appears in dashboard list
- [ ] Key ID is unique UUID
- [ ] CreatedAt timestamp is correct

**Test 2.2: Key Details**
- [ ] Can click key to view details
- [ ] Key ID displayed correctly
- [ ] Created date formatted properly
- [ ] "Copy Key" button works
- [ ] Key copied to clipboard
- [ ] "Delete Key" shows confirmation
- [ ] Key deletion works

**Test 2.3: Multiple Keys**
- [ ] Can create multiple keys (test 5+)
- [ ] Each key has unique ID
- [ ] All keys listed in dashboard
- [ ] Can delete keys individually
- [ ] Dashboard updates after deletion

---

### Phase 3: Encryption

**Test 3.1: Secure Compose (Via Dashboard)**
- [ ] "Compose" button opens compose screen
- [ ] Can type message in textarea
- [ ] Can select encryption key from dropdown
- [ ] "Encrypt & Copy" button works
- [ ] Encrypted message starts with "Quack://"
- [ ] Encrypted output is base64 (no special chars except +/=)
- [ ] Message copied to clipboard automatically
- [ ] Success screen shows encrypted result

**Test 3.2: Secure Compose (Via Trigger)**
- [ ] Type "Quack://" in any input field
- [ ] Prompt appears: "Start a secure message?"
- [ ] Clicking "Yes" provides instructions
- [ ] Can open extension to compose
- [ ] Same encryption flow as Test 3.1

**Test 3.3: Encryption Variants**
- [ ] Encrypt 5-character message
- [ ] Encrypt 100-character message
- [ ] Encrypt 1000-character message
- [ ] Encrypt message with special chars: `!@#$%^&*()`
- [ ] Encrypt message with emojis: `🦆🔒💬`
- [ ] Encrypt message with newlines
- [ ] Each encryption produces unique output

---

### Phase 4: Decryption

**Test 4.1: Auto-Decryption (Same Key)**
- [ ] Paste encrypted message on a webpage
- [ ] Reload page with Quack enabled
- [ ] Message auto-decrypts within 2 seconds
- [ ] Decrypted text replaces encrypted text
- [ ] 🔓 icon appears next to decrypted text
- [ ] Hovering 🔓 shows key name used

**Test 4.2: Auto-Decryption (Wrong Key)**
- [ ] Encrypt with Key A
- [ ] Delete Key A from vault
- [ ] Add different Key B
- [ ] Paste encrypted message
- [ ] Message does NOT decrypt
- [ ] 🔒 icon appears
- [ ] Clicking 🔒 offers manual decrypt (fails)

**Test 4.3: Auto-Decryption (Multiple Keys)**
- [ ] Create 3 keys: A, B, C
- [ ] Encrypt 3 messages with each key
- [ ] Paste all 3 messages on page
- [ ] All 3 messages auto-decrypt
- [ ] Each shows correct key name in tooltip

**Test 4.4: Encryption Blacklist**
- [ ] Encrypt a message via compose
- [ ] Immediately paste on same page
- [ ] Message should NOT auto-decrypt (blacklisted)
- [ ] Reload page
- [ ] Message should NOT decrypt (still blacklisted)
- [ ] Wait 1 minute or restart extension
- [ ] Message should now decrypt (blacklist cleared)

**Test 4.5: Manual Decryption (Selection)**
- [ ] Disable auto-decrypt (lock vault, unlock again)
- [ ] Select encrypted text with mouse
- [ ] Menu appears: "Decrypt with Quack"
- [ ] Click to decrypt
- [ ] Notification shows plaintext preview

**Test 4.6: Manual Decryption (Button)**
- [ ] Paste 15 encrypted messages on page
- [ ] First 10 auto-decrypt
- [ ] Messages 11-15 show "🔒 Decrypt" button
- [ ] Warning banner appears
- [ ] Click "Decrypt" button
- [ ] Message decrypts inline

---

### Phase 5: Cross-Platform Compatibility

Test encryption → paste → decrypt flow on each platform:

**Test 5.1: YouTube**
- [ ] Encrypt message in Quack
- [ ] Paste in YouTube comment
- [ ] Post comment
- [ ] Reload page
- [ ] Comment auto-decrypts

**Test 5.2: Twitter/X**
- [ ] Encrypt message
- [ ] Paste in tweet compose
- [ ] Post tweet
- [ ] View tweet
- [ ] Tweet auto-decrypts

**Test 5.3: Reddit**
- [ ] Encrypt message
- [ ] Paste in comment
- [ ] Post comment
- [ ] Refresh
- [ ] Comment auto-decrypts

**Test 5.4: Discord Web**
- [ ] Encrypt message
- [ ] Paste in Discord chat
- [ ] Send message
- [ ] Message auto-decrypts

**Test 5.5: Generic Sites**
- [ ] Create simple HTML page with textarea
- [ ] Test encryption trigger
- [ ] Test auto-decryption
- [ ] Test on contenteditable div

---

### Phase 6: Security Testing

**Test 6.1: Vault Lock/Unlock**
- [ ] Lock vault from dashboard
- [ ] Verify no auto-decryption works
- [ ] Verify compose is inaccessible
- [ ] Unlock with correct password
- [ ] Verify functionality restored

**Test 6.2: Auto-Lock**
- [ ] Set auto-lock to 1 minute (modify settings manually)
- [ ] Unlock vault
- [ ] Wait 2 minutes
- [ ] Try to decrypt message
- [ ] Should require re-authentication

**Test 6.3: Master Password Strength**
- [ ] Try password: "12345" (should warn)
- [ ] Try password: "password" (should warn)
- [ ] Try password: "Str0ng!Pass123" (should accept)

**Test 6.4: Key Storage**
- [ ] Open DevTools → Application → Storage
- [ ] Check `chrome.storage.local`
- [ ] Verify vault is encrypted (not plaintext JSON)
- [ ] Verify keys are not readable
- [ ] Lock vault
- [ ] Check storage again (session should update)

**Test 6.5: Secure Compose Isolation**
- [ ] Open malicious page with keylogger script
- [ ] Use "Quack://" trigger
- [ ] Compose message in extension
- [ ] Verify page script cannot access message
- [ ] Verify message only appears after paste

---

### Phase 7: Performance Testing

**Test 7.1: Encryption Speed**
- [ ] Encrypt 10-char message → measure time (< 100ms)
- [ ] Encrypt 1000-char message → measure time (< 200ms)
- [ ] Encrypt 10 messages in a row → average time

**Test 7.2: Decryption Speed**
- [ ] Decrypt 1 message → measure time (< 150ms)
- [ ] Page with 10 messages → all decrypt in < 2s
- [ ] Page with 100 messages → first 10 decrypt, rest manual

**Test 7.3: Page Load Impact**
- [ ] Load page without Quack → measure load time
- [ ] Load same page with Quack → measure load time
- [ ] Difference should be < 50ms

**Test 7.4: Memory Usage**
- [ ] Open Task Manager
- [ ] Check extension memory usage
- [ ] Should be < 50MB
- [ ] Generate 20 keys → memory should not balloon

---

### Phase 8: Edge Cases & Bugs

**Test 8.1: Empty/Invalid Input**
- [ ] Try to encrypt empty message (should warn)
- [ ] Try to decrypt invalid base64 (should fail gracefully)
- [ ] Paste "Quack://12345" (invalid) → should not crash

**Test 8.2: Special Characters in Key Name**
- [ ] Create key named "🦆 My Key!"
- [ ] Should work correctly
- [ ] Display properly in dashboard

**Test 8.3: Very Long Messages**
- [ ] Encrypt 10,000-character message
- [ ] Should work (may be slow, but no crash)
- [ ] Decrypt successfully

**Test 8.4: Rapid Actions**
- [ ] Click "Generate Key" rapidly 10 times
- [ ] Should not create duplicate keys
- [ ] Should handle gracefully (loading state)

**Test 8.5: Browser Restart**
- [ ] Encrypt message, keep tab open
- [ ] Restart browser
- [ ] Reopen tab
- [ ] Unlock vault
- [ ] Message should auto-decrypt

**Test 8.6: Extension Update Simulation**
- [ ] Create keys and encrypt messages
- [ ] Rebuild extension with `npm run build`
- [ ] Reload extension in `chrome://extensions`
- [ ] Unlock vault
- [ ] Verify keys still exist
- [ ] Verify decryption still works

---

## 🐛 Bug Report Template

If you find a bug, report it with:

```
**Bug:** [Short description]

**Steps to Reproduce:**
1. Step one
2. Step two
3. ...

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Browser:** Chrome/Edge/Brave [version]

**Console Errors:**
[Paste any errors from F12 Console]

**Screenshots:**
[If applicable]
```

---

## ✅ Success Criteria

The MVP is considered successful if:

1. ✅ All Phase 1-4 tests pass
2. ✅ At least 3 platforms in Phase 5 work correctly
3. ✅ No critical security issues in Phase 6
4. ✅ Performance metrics in Phase 7 are acceptable
5. ✅ No showstopper bugs in Phase 8

---

## 📊 Testing Log Template

Create a file `TEST_RESULTS.md` with:

```markdown
# Quack - Test Results

**Date:** [Date]
**Tester:** [Name]
**Browser:** [Chrome/Edge/Brave + Version]

## Test Summary
- Phase 1: [X/Y] tests passed
- Phase 2: [X/Y] tests passed
- Phase 3: [X/Y] tests passed
- Phase 4: [X/Y] tests passed
- Phase 5: [X/Y] tests passed
- Phase 6: [X/Y] tests passed
- Phase 7: [X/Y] tests passed
- Phase 8: [X/Y] tests passed

## Bugs Found
1. [Bug description] - Severity: [High/Medium/Low]
2. ...

## Performance Metrics
- Encryption (100 chars): Xms
- Decryption: Xms
- Page load impact: Xms
- Memory usage: XMB

## Notes
[Any additional observations]
```

---

**Happy Testing! 🦆**

