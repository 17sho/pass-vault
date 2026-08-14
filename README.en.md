# Pass Vault V2

[![Latest release](https://img.shields.io/github/v/release/17sho/pass-vault-v2?sort=semver)](https://github.com/17sho/pass-vault-v2/releases/latest) [![License](https://img.shields.io/github/license/17sho/pass-vault-v2)](LICENSE)

[中文](README.md) · [English](README.en.md)

A mobile-first, browser-encrypted, self-hosted open-source password vault.

- Accounts, websites, secure notes, TOTP, attachments, and encrypted backups
- Client-side WebCrypto encryption; master passwords and record plaintext are not uploaded in the default mode
- Device quick unlock and optional server-assisted Passkey unlock
- Cloudflare Workers + D1 + R2, or Linux + SQLite
- Independent deployments with no shared accounts, sessions, or production data

> Server-assisted Passkey changes the default zero-knowledge boundary. Read the [architecture and security boundaries](docs/ARCHITECTURE.en.md) before deployment.

## Quick links

| Topic | English | 中文 |
|---|---|---|
| Architecture, encryption, and Passkey boundaries | [Architecture](docs/ARCHITECTURE.en.md) | [架构说明](docs/ARCHITECTURE.zh-CN.md) |
| Cloudflare deployment | [Deployment guide](docs/cloudflare-deployment.en.md) | [部署指南](docs/cloudflare-deployment.zh-CN.md) |
| Linux deployment | [Deployment guide](docs/server-deployment.en.md) | [部署指南](docs/server-deployment.zh-CN.md) |
| API contract | [API](docs/API.md) | [API](docs/API.md) |
| Local development and testing | [Development](docs/DEVELOPMENT.md) | [开发指南](docs/DEVELOPMENT.md) |
| Security | [Security](SECURITY.md) | [安全设计](docs/SECURITY.md) |
| Contributing | [Contributing](CONTRIBUTING.md) | [贡献指南](CONTRIBUTING.md) |

## Get a release

Latest stable release: [**v2.2.0**](https://github.com/17sho/pass-vault-v2/releases/tag/v2.2.0)

Current public assets:

- `pass-vault-v2-cloudflare-2.2.0.tar.gz`
- `pass-vault-v2-cloudflare-2.2.0.zip`
- `SHA256SUMS`

Verify downloads with `SHA256SUMS`. For Linux, install from source using the matching deployment guide.

## Security note

This is security-sensitive software. Review the source and threat model before deployment, use HTTPS, and keep tested encrypted backups. The project has not undergone an independent third-party security audit.

Report vulnerabilities privately through [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault-v2/security/advisories/new).

If the project helps you, a Star is appreciated ⭐️.

[MIT License](LICENSE)
