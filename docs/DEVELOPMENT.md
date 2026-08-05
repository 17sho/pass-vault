# Development guide / 开发指南

## Stack

- Node.js `>=22`, npm 11
- Browser frontend: `public/` → `dist/`
- Cloudflare: Worker + D1 + R2 in `apps/worker/`
- Linux: Node.js + SQLite in `apps/server/`
- Shared encrypted envelope and validation: `shared/`
- Tests: Node test runner, Playwright Chromium/WebKit, Miniflare

## Local development

```bash
npm ci
npm run build
npm start
```

The Linux server serves `dist/` and listens according to its environment configuration. Never use production credentials or production databases for local development.

## Required checks

```bash
npm run lint
npm run lint:docs
npm run typecheck
npm run build
npm test
npm audit
npm run package:release -- --tag v1.1.71
```

`npm test` is intentionally serial because many browser and integration tests start local services and temporary databases.

## Boundaries

- The browser may hold plaintext records and the vault key only while unlocked.
- Server code handles encrypted envelopes and encrypted attachment objects; it must not receive plaintext entries or the vault key.
- Cloudflare and Linux share frontend source and ciphertext contract, not live runtime instances or production data.
- Any lock, logout, password change, username change, or account switch must invalidate delayed operations from the previous session.

## Adding a feature

1. Read `AGENTS.md`, `tasks/spec.md`, and the architecture docs.
2. Identify whether the change belongs in `public/`, `shared/`, one backend, or both.
3. Define/extend the encrypted contract before wiring UI behavior.
4. Add regression tests for success, failure, lock, account switch, mobile width, and both runtimes where applicable.
5. Update bilingual docs and release notes.
6. Run the full required checks before committing.

## Security-sensitive changes

Do not place real domains, account IDs, binding names, invitation codes, tokens, cookies, database exports, screenshots containing vault data, or credentials in the repository. Use placeholders such as `https://vault.example.com`, `[REDACTED]`, and `PROD_SITES`.

Report vulnerabilities privately through GitHub Security. Do not open a public issue for an exploitable vulnerability.
