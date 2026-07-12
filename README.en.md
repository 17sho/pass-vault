# Pass Vault V2

[中文](README.md) · [English](README.en.md)

A mobile-first, self-hosted, zero-knowledge password vault. The shared frontend runs with either a **Cloudflare Workers + Static Assets + D1** backend or a **Linux Node.js + SQLite** backend.

> If this project helps you, a Star would mean a lot ❤️. Issues and improvements are welcome too.

## Features

- Account, website, and secure-note records with tags, category-scoped fuzzy search, editing, and deletion; Chinese fragments and Latin typos are matched entirely in the browser
- An implicit “All” view plus independent encrypted custom groups for accounts, websites, notes, and attachments, including empty-group persistence and combined group/fuzzy filtering
- Note images and a standalone attachment library with category/group filtering, preview/playback, download, rename, group moves, and deletion
- Responsive desktop/mobile UI with no native client required
- Encrypted backup import/export and master-password changes
- Authentication, sessions, CSRF protection, origin checks, and rate limiting
- One encrypted API contract with two independent deployment options

## Zero-knowledge architecture

```text
Master password (browser only)
  └─ PBKDF2-SHA-256 (random salt, 310,000 iterations) → KEK
       └─ unwraps a random AES-256-GCM vault key
            ├─ each item/attachment metadata encrypted in browser → ciphertext envelope → backend
            └─ each attachment encrypted with a unique IV + authenticated AAD → ciphertext object → R2/server disk
```

The server stores only authentication material, the wrapped vault key, encrypted item/attachment metadata envelopes, and encrypted attachment objects. It should never receive plaintext filenames, MIME types, or file contents. It should never receive the master password, vault key, or item plaintext. Zero knowledge does not replace a trusted endpoint, HTTPS, prompt updates, and tested backups; a malicious or compromised frontend can still steal unlocked data.

## Cloudflare vs. Linux

| | Cloudflare edition | Linux edition |
|---|---|---|
| Runtime | Workers + Static Assets | Node.js 22+ |
| Database / attachment storage | D1 + R2 (R2 must be enabled and bound before using attachments) | SQLite + Linux server disk (attachments supported) |
| Operations | Wrangler / Cloudflare Dashboard | systemd + Caddy/Nginx |
| Best for | Serverless edge deployment | Full host and data-file control |
| Data sync | **No automatic sync with Linux** | **No automatic sync with Cloudflare** |

Accounts and data are independent. To migrate, export an **encrypted backup** from the source, create and unlock an account at the destination, then import it. Keep the source data until verification succeeds.

The Cloudflare edition has monthly application-level quotas to reduce R2 overage risk. The Linux edition does not use R2, so those monthly quotas do not apply; total capacity is governed by server storage and administrator configuration. The two editions do not need identical resource policies.

## Screenshots

> Screenshot placeholder: before release, sanitized desktop and mobile screenshots made with empty test data may be added under `docs/images/`. They must contain no real accounts, domains, passwords, cookies, or other sensitive information.

## Local development preview (not a production server deployment)

Prerequisites: Node.js 22+, npm, and a modern browser with WebCrypto.

```bash
git clone https://github.com/17sho/pass-vault-v2.git
cd pass-vault-v2
npm ci
npm test
npm run lint && npm run typecheck && npm run build
INVITE_CODE='<16–256-character local-only test value>' COOKIE_SECURE=false HOST=127.0.0.1 PORT=3000 DB_PATH=./data/dev.sqlite npm start
```

Open `http://127.0.0.1:3000`. In the current release, `INVITE_CODE` is **required for registration**; missing or invalid configuration fails registration closed while existing users can still sign in. This value is only for local preview—never reuse it in production. `COOKIE_SECURE=false` is **only for local HTTP development**.

## Deployment guides

The deployment methods are independent. Choose the matching guide:

- **Cloudflare deployment guide**: [中文](docs/cloudflare-deployment.zh-CN.md) · **[English](docs/cloudflare-deployment.en.md)** — Workers + Static Assets + D1 + R2, including Wrangler CLI and Dashboard. Attachments require R2 to be enabled first.
- **Linux server deployment guide**: [中文](docs/server-deployment.zh-CN.md) · **[English](docs/server-deployment.en.md)** — VPS/dedicated-server Node.js + SQLite, systemd, Caddy/Nginx, backup and restore.
- [Download the latest stable release packages (currently v1.1.20)](https://github.com/17sho/pass-vault-v2/releases/latest)

> **Required before deployment:** both production targets need a securely configured `INVITE_CODE`. When upgrading to v1.1.20, Cloudflare must apply migrations in order through `0006_entries_created_at.sql` before deploying code; Linux idempotently adds `created_at` at startup and backfills it from `updated_at`. Do not clear or recreate the database, and never expose the real invitation in the repository, arguments, screenshots, or logs.

Workers, Static Assets, D1, R2 Standard, DNS, and SSL all have free tiers. The Cloudflare guide now documents D1/R2 allowances, conservative application R2 caps, account-wide shared-usage risk, Billing/Usage checks, and how to prevent Web Analytics auto-injection from conflicting with the vault CSP.

The legacy combined deployment URL remains as a [short navigation page](docs/deployment.en.md) to avoid breaking external links.

## Repository layout

- `public/` — shared frontend and browser WebCrypto
- `shared/` — encrypted API contract shared by both backends
- `apps/worker/` — Cloudflare Worker, D1 migrations, and Wrangler config
- `apps/server/` — Linux Node.js + SQLite backend
- `scripts/` — build, validation, and migration tools
- `deploy/` — systemd example
- `tests/` — contract, backend, and UI tests
- `docs/` — API and deployment documentation

## Security warnings

- This is security-sensitive software; review it and assess your threat model before deployment.
- A forgotten master password cannot be recovered without a usable backup.
- Use production instances only over HTTPS; protect the host, Cloudflare account, and backups.
- Never commit databases, backups, `.env`, real domains, account IDs, or secrets.
- Verify backup provenance; keep multiple encrypted copies and test restoration.
- Report vulnerabilities privately as described in [`SECURITY.md`](SECURITY.md), not in public issues.

## FAQ

**Do the Cloudflare and Linux editions synchronize?**  No. They are independent backends sharing a frontend and contract.

**Can the server read item plaintext?**  Not by design; encryption occurs in the browser. A compromised frontend or endpoint can still read data while unlocked.

**Can my master password be recovered?**  No. Store it safely and maintain tested encrypted backups.

**How do I migrate between editions?**  Export an encrypted backup at the source, then register/sign in, unlock, and import at the destination. Accounts are not copied automatically.

**Should I expose `npm start` directly in production?**  No. Use a dedicated user, systemd, loopback binding, and an HTTPS Caddy/Nginx reverse proxy.

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md). Before submitting, run:

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

## License

This project is open source under the [MIT License](LICENSE). You may use, modify, and redistribute it while retaining the license and copyright notice.
