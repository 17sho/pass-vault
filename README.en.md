# Pass Vault

[![Cloudflare release](https://img.shields.io/badge/Cloudflare-v2.2.3-f38020)](https://github.com/17sho/pass-vault/releases/tag/v2.2.3) [![Linux release](https://img.shields.io/badge/Linux-v2.2.3--server-2f81f7)](https://github.com/17sho/pass-vault/releases/tag/v2.2.3-server) [![iOS native](https://img.shields.io/badge/iOS-ios--native-0b5d48)](https://github.com/17sho/pass-vault/tree/ios-native) [![License](https://img.shields.io/github/license/17sho/pass-vault)](LICENSE)

[中文](README.md) · [English](README.en.md)

A mobile-first, client-encrypted, self-hosted open-source password vault. The web edition can run independently on Cloudflare Workers + D1 + R2 or Linux Node.js + SQLite, while a local-first native SwiftUI iOS client is maintained in the same repository. All three product lines have independent runtimes and data boundaries; accounts, sessions, and vault data are not synchronized automatically.

> If this project helps you, a Star is appreciated ⭐️.

## Main features

- Accounts, websites, secure notes, TOTP codes, and encrypted attachments
- Custom fields for standard records, plus groups, tags, favorites, pins, recents, and Trash
- Local fuzzy search, bulk organization, and encrypted backup import/export
- Note images and a standalone attachment library with preview, playback, download, rename, grouping, and deletion
- Device quick unlock and optional server-assisted Passkey unlock
- Responsive desktop/mobile web interfaces plus an independent native SwiftUI iOS client
- Revision CAS, deletion tombstones, CSRF, origin checks, session controls, and rate limits

Cloudflare v2.2.3 provides standalone `custom` records, encrypted history and Recovery Center, Secure Share v2, cross-tab favorites, and optional Cloudflare Admin and quota controls. Linux v2.2.3-server provides secure sharing, an independent Admin console, and file-lifecycle safeguards. See **[Features](docs/FEATURES.en.md)** for the complete list and platform scope.

The native iOS edition lives on the independent **[`ios-native` branch](https://github.com/17sho/pass-vault/tree/ios-native)**. It includes the complete SwiftUI source, XCTest/XCUITest coverage, project documentation, agent guidance, and an unsigned arm64 IPA that can be re-signed for installation. It is a local-device vault and does not connect to or automatically synchronize Cloudflare/Linux web data.

## Encryption and deployment boundaries

```text
Master password (browser only)
  └─ PBKDF2-SHA-256 → KEK
       └─ unwraps a random AES-256-GCM vault key
            ├─ records and attachment metadata encrypted in browser → ciphertext backend
            └─ attachment content encrypted with unique IV + authenticated AAD → R2 / local disk
```

In the default mode, master passwords and record plaintext are not uploaded. Server-assisted Passkey adds a vault key wrapped by a server KEK, allowing the server to recover it and create a session after successful Passkey verification. Server-assisted Passkey changes the default zero-knowledge boundary. Read **[Architecture and security boundaries](docs/ARCHITECTURE.en.md)** before enabling it.

| | Cloudflare edition | Linux edition | Native iOS edition |
|---|---|---|---|
| Runtime | Workers + Static Assets | Node.js 22+ | iOS 17+ / SwiftUI |
| Database / attachments | D1 + R2 | SQLite + local disk | Encrypted on-device storage |
| Operations / installation | Wrangler / Dashboard | systemd + Caddy/Nginx | Re-sign the unsigned IPA |
| Data sync | No automatic cross-edition sync | No automatic cross-edition sync | No automatic web sync |

## Screenshots

These screenshots use isolated environments and fictional test data. They contain no production accounts, passwords, cookies, or real domains.

### Desktop vault

![Desktop vault interface](https://raw.githubusercontent.com/17sho/pass-vault/main/docs/images/vault-desktop.png)

### Mobile vault

<img src="https://raw.githubusercontent.com/17sho/pass-vault/main/docs/images/vault-mobile.png" alt="Mobile vault interface" width="390">

### Security Center and Passkey

![Security Center and Passkey settings](https://raw.githubusercontent.com/17sho/pass-vault/main/docs/images/security-center.png)

## Documentation

| Topic | English | 中文 |
|---|---|---|
| Complete features and platform scope | [Features](docs/FEATURES.en.md) | [功能介绍](docs/FEATURES.zh-CN.md) |
| Architecture, encryption, and Passkey boundaries | [Architecture](docs/ARCHITECTURE.en.md) | [架构说明](docs/ARCHITECTURE.zh-CN.md) |
| Cloudflare deployment | [Deployment guide](docs/cloudflare-deployment.en.md) | [部署指南](docs/cloudflare-deployment.zh-CN.md) |
| Linux deployment | [Deployment guide](docs/server-deployment.en.md) | [部署指南](docs/server-deployment.zh-CN.md) |
| API, development, and security | [API](docs/API.md) · [Development](docs/DEVELOPMENT.md) · [Security](SECURITY.md) | [API](docs/API.md) · [开发](docs/DEVELOPMENT.md) · [安全](SECURITY.md) |

## Get a release

The runtimes use separate tags, archives, and data stores. Never deploy an artifact across platforms:

| Platform | Stable release | Download and deployment |
|---|---|---|
| Cloudflare Workers + D1 + R2 | [**v2.2.3**](https://github.com/17sho/pass-vault/releases/tag/v2.2.3) | Historical asset `pass-vault-v2-cloudflare-2.2.3.tar.gz` / `.zip` · [Deployment guide](docs/cloudflare-deployment.en.md) |
| Linux Node.js + SQLite | [**v2.2.3-server**](https://github.com/17sho/pass-vault/releases/tag/v2.2.3-server) | Historical asset `pass-vault-v2-linux-2.2.3.tar.gz` / `.zip` · [Deployment guide](docs/server-deployment.en.md) |
| Native iOS 17+ | [`ios-native`](https://github.com/17sho/pass-vault/tree/ios-native) | [Unsigned arm64 IPA](https://raw.githubusercontent.com/17sho/pass-vault/ios-native/PassVault-unsigned-arm64.ipa) · [SHA-256](https://github.com/17sho/pass-vault/blob/ios-native/SHA256SUMS) · complete source and tests on the branch |

Cloudflare and Linux Releases include `SHA256SUMS`; the iOS branch has its own checksum file. Download the IPA and checksum file into the same directory, then run `sha256sum -c SHA256SUMS`. The unsigned IPA must be re-signed with your own certificate and provisioning profile before installation.

## Security note

This is security-sensitive software. Review the source and threat model before deployment, use HTTPS, and keep tested encrypted backups. The project has not undergone an independent third-party security audit.

Report vulnerabilities privately through [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault/security/advisories/new).

[Contributing](CONTRIBUTING.md) · [MIT License](LICENSE)
