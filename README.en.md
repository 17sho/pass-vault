# Pass Vault V2

[中文](README.md) · [English](README.en.md)

A mobile-first, self-hosted password vault with a zero-knowledge boundary by default. The shared frontend runs with either a **Cloudflare Workers + Static Assets + D1** backend or a **Linux Node.js + SQLite** backend; optional server-assisted Passkey unlock explicitly changes that boundary.

> If this project helps you, a Star would mean a lot ❤️. Issues and improvements are welcome too.

## Features

- Account, website, secure-note, and TOTP records; TOTP secrets stay in the client-encrypted payload and the browser locally generates default six-digit codes that refresh every 30 seconds
- An implicit “All” view plus independent encrypted custom groups for accounts, websites, notes, TOTP, and attachments, including empty-group persistence and combined group/fuzzy filtering
- Tags, category and global fuzzy search, editing, pinning, recents, and an encrypted trash; Chinese fragments and Latin typos are matched entirely in the browser
- Note images and a standalone attachment library with category/group filtering, preview/playback, download, rename, group moves, and deletion
- Responsive desktop/mobile UI with no native client required
- Encrypted backup import/export and master-password changes
- Optional device quick unlock after an automatic lock using platform WebAuthn user verification (such as Face ID, Touch ID, or Windows Hello); enabled only when the browser supports the PRF extension, with the local ciphertext bound to the current account and session and the master password always retained as fallback
- Optional server-assisted Passkey unlock: registration starts from an authenticated session; later, even with no existing session, an anonymous challenge plus platform user verification can recover a server-wrapped vault key and create a new session, changing the default zero-knowledge boundary described below
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

In the default mode, the server stores authentication material, a vault key protected by a master-password-derived key, encrypted item/attachment metadata envelopes, and encrypted attachment objects. It does not receive the master password or hold a server key that can independently recover the vault key. Enabling **server-assisted Passkey unlock** adds a copy of the vault key wrapped by a server KEK. After an anonymous Passkey challenge passes WebAuthn user verification, exact RP ID/Origin, credential ownership, and counter checks, the server can recover that vault key and create a new session. Server-assisted Passkey therefore changes the default zero-knowledge boundary, and a compromised server or frontend may be able to decrypt stored ciphertext. The master password is still never uploaded, and changing the master password or username revokes assisted credentials. No mode replaces a trusted endpoint, HTTPS, prompt updates, and tested backups.

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

These screenshots were generated in an isolated local environment with fictional `example.com` / `example.org` test data. They contain no production accounts, passwords, cookies, or real domains.

### Desktop vault

![Desktop vault interface](https://raw.githubusercontent.com/17sho/pass-vault-v2/main/docs/images/vault-desktop.png)

### Mobile vault

<img src="https://raw.githubusercontent.com/17sho/pass-vault-v2/main/docs/images/vault-mobile.png" alt="Mobile vault interface" width="390">

### Security Center and Passkey

![Security Center and Passkey settings](https://raw.githubusercontent.com/17sho/pass-vault-v2/main/docs/images/security-center.png)

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

### Obtain the current deployable version

The latest stable release is [v1.1.69](https://github.com/17sho/pass-vault-v2/releases/tag/v1.1.69), adding bulk pin, unpin, and move-to-Trash actions within the current filtered result scope. It includes separate `pass-vault-v2-cloudflare-1.1.69.tar.gz` / `.zip` and `pass-vault-v2-linux-1.1.69.tar.gz` / `.zip` assets plus `SHA256SUMS`. Each archive contains only its selected runtime and placeholder configuration; run `sha256sum -c SHA256SUMS` after download.

> **Required before deployment:** securely configure `INVITE_CODE` for both production targets. Before an upgrade, record the pre-task version and a complete names-only configuration inventory, preserving plain vars, Secrets, resource bindings, routes, and triggers. Cloudflare must back up D1/R2 at one point, apply the complete pending chain (currently through `0013`), and retain Cron. Linux must back up SQLite plus attachments and retain the complete environment. Never clear/recreate the database or expose real invitation codes, resource IDs, or credentials in Git, arguments, screenshots, or logs.

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

**Can the server read item plaintext?**  In the default mode, the server has no independent material for recovering the vault key and encryption occurs in the browser, although a compromised frontend or endpoint can still read unlocked data. With server-assisted Passkey enabled, the server holds a KEK and an additional wrapped key and can recover the vault key and create a new session after anonymous Passkey authentication succeeds; this expands the impact of a server compromise.

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
