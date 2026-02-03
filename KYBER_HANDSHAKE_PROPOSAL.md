# Kyber Key Exchange Proposal for Quack 🦆

*Research & Design by Jarvis — 2026-02-02*

---

## The Core Problem

Quack encrypts messages with AES-256. But AES is **symmetric** — both parties need the same key. How do Alice and Bob establish that shared key without an eavesdropper (Eve) capturing it?

This is the **key exchange problem**, and it's been the hardest problem in cryptography since the 1970s.

---

## How CRYSTALS-Kyber Works

Kyber is a **Key Encapsulation Mechanism (KEM)**, not a traditional key exchange. Here's the flow:

```
┌─────────────────────────────────────────────────────────────┐
│                    KYBER KEM FLOW                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ALICE (receiver)                    BOB (sender)           │
│  ───────────────                     ──────────────         │
│                                                             │
│  1. Generate keypair:                                       │
│     (publicKey, secretKey)                                  │
│                                                             │
│  2. Share publicKey ─────────────────►                      │
│                                                             │
│                                      3. Encapsulate:        │
│                                         (sharedSecret,      │
│                                          ciphertext)        │
│                                         = Encaps(publicKey) │
│                                                             │
│                         ◄───────────── 4. Send ciphertext   │
│                                                             │
│  5. Decapsulate:                                            │
│     sharedSecret =                                          │
│     Decaps(secretKey, ciphertext)                           │
│                                                             │
│  ═══════════════════════════════════════════════════════    │
│  NOW BOTH HAVE THE SAME sharedSecret (256-bit AES key)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key insight:** The public key CAN be public. Even if Eve has it, she can't derive the shared secret from the ciphertext. That's the whole point of asymmetric crypto.

---

## The REAL Problem: Man-in-the-Middle (MITM)

The math is secure. The *protocol* is where things break.

```
┌─────────────────────────────────────────────────────────────┐
│                    MITM ATTACK                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ALICE              MALLORY (attacker)           BOB        │
│  ─────              ──────────────────           ───        │
│                                                             │
│  Send pk_alice ────► Intercept!                             │
│                      Send pk_mallory ──────────► Receives   │
│                                                  "Alice's"  │
│                                                  key (fake) │
│                                                             │
│                      ◄────────────────────────── Encaps     │
│                      Decrypts with sk_mallory              │
│                      Re-encrypts with pk_alice              │
│  Receives ◄─────────                                        │
│                                                             │
│  Alice and Bob think they're talking securely.              │
│  Mallory reads everything.                                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**The problem isn't the encryption. It's trust.**

How does Bob know that the public key he received actually belongs to Alice?

---

## Solutions Analysis

### Option 1: Trust-On-First-Use (TOFU) + Fingerprint Verification

**How it works:**
- Alice generates her Kyber keypair
- Alice shares her public key via any channel (Twitter DM, email, Quack post)
- Bob saves this key and associates it with "Alice"
- Both can verify a short fingerprint out-of-band (phone call, in person)
- All future messages use this established key

**Pros:**
- Simple to implement
- Works with Quack's decentralized philosophy
- Same model as Signal, SSH, PGP

**Cons:**
- First contact is vulnerable to MITM
- Users must manually verify (most won't)
- Key management UX is tricky

**Implementation:**
```typescript
// Alice's public key post
Quack://KEY:alice@twitter:MIIBIjANBgkqhkiG9w0BAQEFAAOC...

// Fingerprint (short hash for verification)
"4F:A2:B9:C1:8E:3D" // Alice reads this to Bob over phone
```

---

### Option 2: Multi-Step In-Band Handshake

**How it works:**
```
Alice posts:  Quack://HELLO:@bob:[alice_pubkey]
Bob posts:    Quack://SHAKE:@alice:[ciphertext]
Alice decaps: Both now have shared secret
Bob posts:    Quack://[encrypted_message]
```

**Pros:**
- All happens on-platform
- More seamless UX
- Visible handshake (users see the protocol happening)

**Cons:**
- Still vulnerable to MITM on first message
- Requires multiple messages before secure communication
- Platform might flag/block the handshake messages

**Implementation:**
```typescript
interface HandshakeHello {
  type: 'HELLO';
  from: string;      // @alice
  to: string;        // @bob
  publicKey: string; // Kyber public key
  timestamp: number;
}

interface HandshakeShake {
  type: 'SHAKE';
  from: string;      // @bob
  to: string;        // @alice
  ciphertext: string; // Kyber encapsulation
  timestamp: number;
}
```

---

### Option 3: Password-Authenticated Key Exchange (PAKE)

**How it works:**
- Alice and Bob agree on a password out-of-band ("our password is BlueElephant42")
- They use OPAQUE or SRP protocol to derive shared key from password
- Even if Eve sees all traffic, she can't derive the key without the password

**Pros:**
- Humans are good at sharing secrets verbally
- No public key infrastructure needed
- Resistant to MITM (password acts as authentication)

**Cons:**
- Requires out-of-band password sharing
- Password must be strong
- More complex to implement
- Not as "post-quantum" (PAKE protocols need adaptation)

---

### Option 4: Leverage Existing Identity (Platform Trust)

**How it works:**
- Alice puts her Quack public key in her Twitter bio / profile
- Bob sees Alice's verified Twitter account, trusts the key
- Platform identity = key authentication

**Pros:**
- Leverages existing trust (verified accounts, known handles)
- No extra verification step
- Natural UX ("add their key from their profile")

**Cons:**
- Centralized trust (what if Twitter is compromised?)
- Not all platforms have profiles
- Account takeover = key compromise

---

## My Recommendation: Phased Approach

### Phase 1: MVP (Ship Fast)

**TOFU + Simple Fingerprints**

```
┌─────────────────────────────────────────────────────────────┐
│                    MVP KEY SHARING                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Alice generates key in Quack extension                  │
│                                                             │
│  2. Alice clicks "Share Key" → copies to clipboard:         │
│     Quack://KEY:MIIBIjANBgkqhkiG9w0BAQEFAAOC...            │
│                                                             │
│  3. Alice sends this via Signal/WhatsApp/email/DM to Bob    │
│                                                             │
│  4. Bob receives, clicks "Add Key" in Quack                 │
│     → Pastes the Quack://KEY:... string                     │
│     → Names it "Alice"                                      │
│                                                             │
│  5. OPTIONAL: Both verify fingerprint                       │
│     Alice's Quack shows: "4F:A2:B9:C1"                      │
│     Bob's Quack shows:   "4F:A2:B9:C1" (for Alice's key)    │
│     They compare over phone/video                           │
│                                                             │
│  6. Now Bob can encrypt to Alice on any platform            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why this for MVP:**
- Simple to build (key export/import already partially exists)
- Familiar model (SSH, PGP, Signal)
- Users who care about security will verify
- Users who don't still get "good enough" protection

**UI additions needed:**
- "Share Key" button with copy-friendly format
- "Add Key" / "Import Key" flow
- Fingerprint display (short hash of public key)
- Contact list showing which keys you have

---

### Phase 2: Better UX (Post-MVP)

**In-Band Handshake + QR Codes**

- Add `Quack://HELLO` and `Quack://SHAKE` message types
- Enable key exchange directly on Twitter/YouTube/etc
- Add QR code generation for in-person key sharing
- Add "Verify" button that shows both fingerprints side-by-side

---

### Phase 3: Advanced (Future)

**Ratcheting + Forward Secrecy**

- Implement Double Ratchet (like Signal)
- Each message uses a new key derived from previous
- Compromise of one key doesn't reveal past messages
- This is complex but the gold standard

---

## Immediate Technical Tasks

For MVP, here's what needs to happen:

### 1. Real Kyber Implementation

Replace placeholder with actual CRYSTALS-Kyber:
```bash
npm install crystals-kyber
# or
npm install @aspect-security/kyber
```

```typescript
// New kyber.ts
import kyber from 'crystals-kyber';

export async function generateKyberKeyPair() {
  const keypair = await kyber.KeyGen768();
  return {
    publicKey: base64Encode(keypair.publicKey),
    secretKey: base64Encode(keypair.secretKey),
  };
}

export async function encapsulate(publicKey: Uint8Array) {
  const { ciphertext, sharedSecret } = await kyber.Encaps768(publicKey);
  return { ciphertext, sharedSecret };
}

export async function decapsulate(secretKey: Uint8Array, ciphertext: Uint8Array) {
  const sharedSecret = await kyber.Decaps768(ciphertext, secretKey);
  return sharedSecret;
}
```

### 2. Key Format Update

Current keys store `aesKey` directly. New format should store Kyber keypair:

```typescript
interface QuackKey {
  id: string;
  name: string;
  type: 'personal' | 'contact';
  
  // For personal keys (you own the secret key)
  kyberPublicKey?: string;
  kyberSecretKey?: string;  // encrypted with master password
  
  // For contact keys (you only have their public key)
  contactPublicKey?: string;
  
  // Derived AES key (from encapsulation)
  sharedSecret?: string;  // only after handshake complete
  
  fingerprint: string;  // short hash for verification
  createdAt: number;
}
```

### 3. Key Sharing Protocol

New message types:
```
Quack://KEY:[base64_public_key]           # Share your public key
Quack://MSG:[base64_encrypted_message]    # Regular encrypted message (current)
```

### 4. Fingerprint Generation

```typescript
function generateFingerprint(publicKey: Uint8Array): string {
  const hash = await crypto.subtle.digest('SHA-256', publicKey);
  const bytes = new Uint8Array(hash).slice(0, 4);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
}
// Output: "4F:A2:B9:C1"
```

---

## Security Considerations

### What MVP Protects Against:
- ✅ Mass surveillance (encrypted in transit and at rest)
- ✅ Platform data mining (they can't read content)
- ✅ Future quantum attacks (Kyber is post-quantum)
- ✅ Passive eavesdroppers

### What MVP Does NOT Protect Against:
- ❌ Active MITM during key exchange (if users don't verify fingerprints)
- ❌ Endpoint compromise (malware on your device)
- ❌ Metadata analysis (who talks to whom, message timing/size)
- ❌ Compromised master password

### User Warnings (Must Display):
```
⚠️ SECURITY NOTICE

• Verify fingerprints with your contact via a separate channel
• If fingerprints don't match, DO NOT trust the key
• Your security is only as good as your master password
• This is experimental software — use at your own risk
```

---

## Summary

| Phase | Feature | Effort | Security |
|-------|---------|--------|----------|
| MVP | TOFU + Fingerprints | 1-2 weeks | Good (with verification) |
| Post-MVP | In-Band Handshake | 2-3 weeks | Same |
| Future | Double Ratchet | 4-6 weeks | Excellent |

**My recommendation:** Build MVP with TOFU + fingerprints. It's the fastest path to "actually secure" while we figure out the better UX for Phase 2.

---

## Questions for Neves

1. **Key naming:** Should contacts be named manually, or try to auto-detect (e.g., "Alice @alice_twitter")?

2. **Fingerprint UX:** Full fingerprint (32 chars) or short (8 chars)? Short is easier to verify but less secure.

3. **Key backup:** Should we add encrypted key backup/export for recovery? (Dangerous but users will want it)

4. **Group chats:** Future consideration — one key per group, or pairwise keys?

---

*"Make the web quack-tastic! 🦆"*

— Jarvis
