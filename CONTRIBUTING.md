# Contributing to Quack 🦆

First off, thanks for considering contributing! Quack aims to make the web more private, and we welcome all help.

## Development Setup

1. **Fork and clone the repo**
   ```bash
   git clone https://github.com/YOUR_USERNAME/quack.git
   cd quack
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run tests**
   ```bash
   npm test
   ```

4. **Build the extension**
   ```bash
   npm run build
   ```

5. **Load in Chrome**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

## Branching Strategy

- `main` — Stable releases only (protected)
- `develop` — Active development
- Feature branches — Create from `develop`

### Workflow

1. Create a feature branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit with clear messages

3. Push and open a PR to `develop`:
   ```bash
   git push origin feature/your-feature-name
   ```

4. After review and merge to `develop`, changes will be batched into releases on `main`

## Code Style

- **TypeScript**: Strict mode, no `any` unless absolutely necessary
- **React**: Functional components with hooks
- **Formatting**: Use consistent indentation (2 spaces)
- **Naming**: camelCase for variables/functions, PascalCase for components/types

## Testing

All crypto-related changes **must** include tests. Run the test suite before submitting:

```bash
npm test
```

Current coverage:
- Cryptographic operations (AES, ML-KEM, PBKDF2)
- Message encoding/decoding
- Vault operations
- Export/import flows
- Group key management

## Security

If you discover a security vulnerability, **do not** open a public issue. Instead, email the maintainer directly or use GitHub's private vulnerability reporting.

Crypto changes require extra scrutiny:
- Explain the cryptographic reasoning
- Reference relevant standards (NIST, etc.)
- Include test vectors when possible

## Pull Request Guidelines

- Keep PRs focused (one feature/fix per PR)
- Update documentation if needed
- Ensure all tests pass
- Add tests for new functionality
- Write clear commit messages

## Questions?

Open an issue for questions or discussion. We're friendly. 🦆

---

**Thank you for helping make the web more private!**
