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

## 1. Storage Security Audit ✅

**Goal:** Ensure key storage is wallet-grade secure.

**Current State:**
- Vault encrypted with PBKDF2 (100k iterations) + AES-256-GCM
- Stored in `chrome.storage.local`
- Password never stored

**COMPLETED (2026-02-04):**
- [x] Session state moved to `chrome.storage.session` (memory only, never disk)
- [x] Auto-lock after inactivity timeout (existed, verified working)
- [x] Decrypted keys cleared on lock/browser close (service worker restart clears memory)
- [x] Matches MetaMask/Phantom wallet-grade patterns

**Changes:**
- `src/storage/settings.ts` — `getSession()`/`saveSession()` now use `chrome.storage.session`
- Added `migrateSessionToMemoryOnly()` to clean old local storage data
- `src/background/service-worker.ts` — calls migration on startup

**Commit:** `4942cfd`

---

## 2. Content Script Refactor ✅

**Goal:** Break monolithic `content-script.ts` (1558 lines) into maintainable modules.

**COMPLETED (2026-02-04):**

Split into 7 focused modules:
```
src/content/
├── content-script.ts      # 58 lines - Entry point, orchestration
├── dom-scanner.ts         # 348 lines - MutationObserver, IntersectionObserver, element processing
├── inline-highlight.ts    # 344 lines - Underlines, hover cards, cipher highlights
├── input-detector.ts      # 222 lines - Editable tracking, encrypt triggers
├── notifications.ts       # 265 lines - Toasts, warnings, prompts
├── overlay-manager.ts     # 405 lines - Encrypt/decrypt overlay iframes
└── utils.ts               # 137 lines - Shared helpers
```

**Approach:**
- Split source files for maintainability
- Vite bundles into single `content-script.js` output (23KB)
- Clean module boundaries with explicit exports

**Commit:** `c6d9c04`

---

## 3. Key Export/Import ✅

**Goal:** Allow full vault backup and restore.

**COMPLETED (2026-02-04):**

### Export Feature
- [x] Settings screen with Export button
- [x] Password validation (alphanumeric, 20+ chars)
- [x] AES-256-GCM encryption via PBKDF2
- [x] JSON file download with timestamp filename

**Format:**
```json
{
  "quackVersion": "0.1.0",
  "exportedAt": 1707123456789,
  "encrypted": true,
  "salt": "<base64>",
  "iv": "<base64>",
  "data": "<AES-encrypted-vault-json>"
}
```

### Import Feature
- [x] Two scenarios implemented:
  - **Fresh install:** Option on onboarding welcome screen → goes to dashboard after restore
  - **Merge:** Settings → Import → adds to existing vault
- [x] Password entry with backup metadata display
- [x] Checklist with "Select All" toggle
- [x] Conflict detection (same fingerprint shows warning)
- [x] Selected items replace, unselected skip

### New Files
- `src/storage/export.ts` — Export/import logic
- `src/popup/screens/SettingsScreen.tsx` — Settings with Export/Import
- `src/popup/screens/ImportScreen.tsx` — Import checklist UI

### Modified Files
- `App.tsx` — Routes for settings/import screens
- `DashboardScreen.tsx` — Settings button (⚙️) in header
- `OnboardingScreen.tsx` — "Restore from Backup" option
- `types/index.ts` — `ExportedVault` and `ImportItem` types

**Commits:** 
- `512631c` — Feature implementation
- `df48023` — Tests (27 new tests, 54 total)

---

## 4. Documentation ✅

**Goal:** Professional, up-to-date documentation.

**COMPLETED (2026-02-04):**

### README.md Overhaul
- [x] Update project status (most phases DONE, not Pending)
- [x] Add installation instructions
- [x] Add usage guide with screenshots
- [x] Add GitHub Actions badge for tests
- [x] Clean up outdated roadmap
- [x] Add Authors section at bottom (Neves + Jarvis)

### Code Documentation
- [x] Add JSDoc comments to all public functions
- [x] Document crypto module thoroughly
- [x] Document message format specification

### GitHub Actions
- [x] Create `.github/workflows/test.yml`
- [x] Run tests on push/PR
- [x] Add badge to README

### Added Files
- `.github/workflows/test.yml` — CI workflow for Node 20.x/22.x
- `LICENSE` — MIT license file

**Commit:** `1256f83`

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
