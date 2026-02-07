# Privacy Policy

**Quack - Universal Web Encryption**

*Last updated: February 7, 2026*

## Summary

**Quack does not collect, transmit, or share any user data.** Everything stays on your device.

## Data Storage

Quack stores the following data **locally on your device** using Chrome's storage API:

- **Cryptographic keys** — Your personal keys, contact public keys, and group keys
- **Vault data** — Encrypted with your master password using AES-256-GCM
- **Settings** — Your preferences (auto-lock timer, stealth mode toggle, etc.)

This data is:
- ✅ Encrypted at rest with your master password
- ✅ Stored only in your browser's local storage
- ✅ Never transmitted to any server
- ✅ Never accessible to us or any third party

## Data Collection

**We collect nothing.** Specifically:

- ❌ No personal information
- ❌ No usage analytics
- ❌ No browsing history
- ❌ No message content (encrypted or decrypted)
- ❌ No IP addresses
- ❌ No cookies or tracking
- ❌ No telemetry

## Network Activity

Quack makes **zero network requests**. All cryptographic operations happen entirely on your device. Your encrypted messages travel only through whatever platform you paste them into (YouTube, Twitter, etc.) — we never see them.

## Permissions Explained

| Permission | Why We Need It |
|------------|----------------|
| `storage` | Store your encrypted vault locally |
| `clipboardWrite` | Copy encrypted messages for you to paste |
| `activeTab` | Detect trigger phrase and scan for encrypted messages |
| `sidePanel` | Provide Side Panel UI option |
| `<all_urls>` | Enable encryption on any website you visit |

## Third-Party Services

Quack uses **no third-party services**. No analytics, no crash reporting, no external APIs.

## Data Sharing

We do not share any data because we do not have any data. Your keys and messages exist only on your device.

## Data Retention

All data remains on your device until you:
- Uninstall the extension
- Clear browser data
- Manually delete your vault

## Security

- **Encryption:** AES-256-GCM for vault and messages
- **Key Exchange:** ML-KEM-768 (post-quantum, NIST FIPS 203)
- **Key Derivation:** PBKDF2 with 100,000 iterations
- **Session Security:** Keys held in memory only while unlocked

## Children's Privacy

Quack does not knowingly collect any information from anyone, including children under 13.

## Changes to This Policy

If we ever change this policy, we will update the "Last updated" date above. Any changes will be reflected in the extension's GitHub repository.

## Open Source

Quack is open source. You can verify our privacy practices by reviewing the code:
https://github.com/0xneves/quack

## Contact

For privacy concerns or questions:
- GitHub Issues: https://github.com/0xneves/quack/issues
- Author: [@0xneves](https://github.com/0xneves)

---

**The short version:** We built Quack for privacy. We don't want your data. We can't see your data. Your secrets are yours.
