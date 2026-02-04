# Quack MVP Backlog

*Created: 2026-02-04*
*Starting Version: v0.1.0*

---

## Priority Order

1. ✅ Storage Security Audit
2. ✅ Content Script Refactor
3. ✅ Key Export/Import
4. ✅ Documentation
5. ✅ Versioning + Branching
6. ✅ Repo Public Preparation

---

## 1. Storage Security Audit

**Goal:** Ensure key storage is wallet-grade secure.

**Current State:**
- Vault encrypted with PBKDF2 (100k iterations) + AES-256-GCM
- Stored in `chrome.storage.local`
- Password never stored

**TODO:**
- [ ] Verify unlocked vault state uses `chrome.storage.session` (memory only, not disk)
- [ ] Implement auto-lock after inactivity timeout
- [ ] Ensure decrypted keys cleared from memory after operations
- [ ] Review against MetaMask/Phantom storage patterns

**Files to check:**
- `src/storage/vault.ts`
- `src/background/service-worker.ts`

---

## 2. Content Script Refactor

**Goal:** Break monolithic `content-script.ts` (1558 lines) into maintainable modules.

**Current State:**
- Single file handles: DOM scanning, input detection, overlays, inline highlights, encryption triggers, decryption

**Proposed Structure:**
```
src/content/
├── content-script.ts      # Entry point, orchestration
├── dom-scanner.ts         # MutationObserver, IntersectionObserver, scanElement
├── input-detector.ts      # Quack:// trigger detection, editable tracking
├── overlay-manager.ts     # Encrypt/decrypt overlay iframes, positioning
├── inline-highlight.ts    # Underlines, hover cards, cipher highlights
├── notifications.ts       # Toast notifications, warnings
└── utils.ts               # Content-script specific helpers
```

**Approach:**
- Split source files for maintainability
- Bundle into single output with Vite (simpler runtime)

**Estimate:** 2-3 hours

---

## 3. Key Export/Import

**Goal:** Allow full vault backup and restore.

### Export Feature

**Scope:** Full vault (personal keys + contacts + groups)

**Format:**
```json
{
  "quackVersion": "0.1.0",
  "exportedAt": 1707123456789,
  "encrypted": true,
  "data": "<AES-encrypted-vault-json>"
}
```

**Password Requirements:**
- Alphanumeric characters only
- Minimum 20 characters
- No mix requirement (all letters or all numbers OK)
- Separate from vault password

**UI Flow:**
1. User clicks "Export Vault" in settings
2. Prompt for export password (20 char min, alphanumeric)
3. Confirm password
4. Generate encrypted JSON file
5. Browser download dialog

### Import Feature

**Two scenarios:**

**A) First Install (during onboarding wizard):**
- Option to import existing backup
- User provides export file + export password
- Decrypts and shows checklist of items
- User selects what to import (default: all)
- User sets new vault password
- Selected items become the new vault

**B) Merge (existing vault):**
- Settings → Import
- User provides export file + export password
- Decrypts and shows checklist of items
- **Conflict handling:** If fingerprint matches existing key:
  - Show orange/red warning under the key name
  - User can still select it
  - Selected = replace existing
  - Not selected = skip (keep existing)
- Uses current vault password
- Selected items added to vault

**UI Components:**
- Checklist with "Select All" toggle at top
- Each item shows: name, type (personal/contact/group), fingerprint preview
- Conflict items show warning badge
- Import button at bottom

### Technical Notes

**Key sizes (ML-KEM-768):**
- Public key: 1,184 bytes (~1.6KB base64)
- Secret key: 2,400 bytes (~3.2KB base64)
- Full keypair: ~4.8KB

QR codes won't work (max ~3KB). File-based export is the way.

---

## 4. Documentation

**Goal:** Professional, up-to-date documentation.

### README.md Overhaul
- [ ] Update project status (most phases DONE, not Pending)
- [ ] Add installation instructions
- [ ] Add usage guide with screenshots
- [ ] Add GitHub Actions badge for tests
- [ ] Clean up outdated roadmap
- [ ] Add Authors section at bottom (Neves + Jarvis)

### Code Documentation
- [ ] Add JSDoc comments to all public functions
- [ ] Document crypto module thoroughly
- [ ] Document message format specification

### GitHub Actions
- [ ] Create `.github/workflows/test.yml`
- [ ] Run tests on push/PR
- [ ] Add badge to README

---

## 5. Versioning + Branching

**Goal:** Professional release workflow.

### Branching Strategy
- `main` = stable releases only
- `develop` = active development
- Feature branches off `develop`
- Merge to `main` only via PR with version bump

### Version Strategy
- Semantic versioning: `vMAJOR.MINOR.PATCH`
- Starting at `v0.1.0`
- Tag every release
- Update `package.json` version
- Update `manifest.json` version

### Setup Tasks
- [ ] Create `develop` branch from current `main`
- [ ] Set `develop` as default branch
- [ ] Protect `main` (require PR)
- [ ] Add version bump script or use `npm version`

---

## 6. Repo Public Preparation

**Goal:** Ready for open source collaboration.

### Tasks
- [ ] Review code for any secrets/sensitive data
- [ ] Add LICENSE file (MIT per package.json)
- [ ] Add CONTRIBUTING.md
- [ ] Add CODE_OF_CONDUCT.md (optional)
- [ ] Update README Authors section
- [ ] Add collaborators section to README
- [ ] Change repo visibility to public

### Authors Section (for README)
```markdown
## Authors

- **Guilherme Neves** ([@0xneves](https://github.com/0xneves)) — Creator
- **Jarvis** — AI Development Partner

Built with 🦆 for a more private web.
```

---

## Decisions Log

| Date | Topic | Decision |
|------|-------|----------|
| 2026-02-04 | Export scope | Full vault (keys + contacts + groups) |
| 2026-02-04 | Export password | Alphanumeric, 20 char min, no mix required |
| 2026-02-04 | Export encryption | AES with separate export password |
| 2026-02-04 | Import UI | Checklist with "All" toggle, checkboxes per item |
| 2026-02-04 | Conflict handling | Orange/red warning, select=replace, unselect=skip |
| 2026-02-04 | First install import | Use new vault password being created |
| 2026-02-04 | Merge import | Use current vault password, add selected keys |
| 2026-02-04 | Export metadata | Include `quackVersion` from app |
| 2026-02-04 | Starting version | v0.1.0 |
| 2026-02-04 | Priority order | Security → Refactor → Export → Docs → Version → Public |

---

## Notes

- Content script is 1558 lines — refactor will improve velocity
- Kyber keys are 75x larger than EVM keys — no QR codes
- `chrome.storage.session` is key for wallet-grade security
- All 27 crypto tests passing as of 2026-02-04
