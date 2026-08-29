# Features

[中文](FEATURES.zh-CN.md) · [English](FEATURES.en.md) · [Back to README](../README.en.md)

Pass Vault is a mobile-first, browser-encrypted, self-hosted password vault. Cloudflare and Linux share the base frontend and ciphertext contract, while accounts, sessions, databases, and attachment stores remain independent.

## Core record management

- **Five encrypted record classes**: accounts, websites, secure notes, TOTP, and attachments.
- **Custom fields**: standard records can contain editable encrypted fields.
- **Standalone custom records**: Cloudflare v2.2.0 can create `custom` records from a blank form or template; templates only prefill the field structure.
- **TOTP**: secrets remain in client-encrypted payloads and codes are generated locally in the browser.
- **Attachments and note images**: encrypted before upload, with preview, playback, download, rename, grouping, and deletion.

## Search and organization

- Separate views for accounts, websites, notes, TOTP, attachments, and custom records.
- Encrypted custom groups, tags, favorites, pins, recents, and Trash.
- Local fuzzy search for Chinese fragments and Latin typos; queries and decrypted content are not sent to the server.
- Bulk grouping, pinning, unpinning, and move-to-Trash within the current type, group, or search scope.
- Cloudflare v2.2.0 stores favorites/pins in a separate encrypted registry with field-level cross-tab merging.

## History, recovery, and sharing

The following are **Cloudflare v2.2.0-specific capabilities**:

- **Encrypted history**: bounded record and attachment revisions with local comparison and restoration.
- **Recovery Center**: preview, individual/bulk restore, permanent deletion, clear-all, and encrypted group-relation recovery.
- **Secure Share v2**: encrypted packages containing multiple records and attachments, with optional passwords, expiration, view limits, one-browser/one-time consumption, and revocation.
- Anonymous share pages use `no-store`, `noindex`, and no-referrer, and remove URL-fragment key material after reading it.

## Unlock, backup, and security controls

- **Master-password unlock**: PBKDF2-SHA-256 derives a KEK that unwraps a random AES-256-GCM vault key.
- **Device quick unlock**: when WebAuthn PRF is supported, Face ID, Touch ID, or Windows Hello can unlock the vault; the master password remains available as fallback.
- **Server-assisted Passkey**: can recover a server-wrapped vault key and create a session without an existing session. This changes the default zero-knowledge boundary; read the [architecture guide](ARCHITECTURE.en.md) before enabling it.
- **Encrypted backups**: import, export, and migration; Cloudflare and Linux do not synchronize automatically.
- **Session and write protection**: CSRF, origin checks, rate limits, lock/logout cleanup, revision CAS, and deletion tombstones reduce stale-page overwrite and resurrection risks.

## Responsive experience

- Responsive desktop, tablet, and mobile browser UI with no native client required.
- Passwords and sensitive fields are hidden by default.
- Lock, logout, and privacy shielding clear sensitive DOM, Blob URLs, and stale asynchronous references.

## Cloudflare administration

Cloudflare v2.2.0 can optionally deploy an independent Admin Worker with:

- a Cloudflare Access administrator allowlist;
- user, encrypted-record, attachment, session, D1/R2 usage, and health overviews;
- registration state, invitation digest, forced logout, user deletion, and maintenance tasks;
- four-dimensional quotas for records, attachment count, attachment ciphertext, and expiry;
- quota warnings, risk filters, aggregate security events, and non-sensitive quota audit history.

The admin surface does not display vault plaintext. Read the [architecture guide](ARCHITECTURE.en.md) and [security policy](../SECURITY.md) for the complete boundaries.

## Platform scope

| Capability | Cloudflare | Linux |
|---|---:|---:|
| Five encrypted record classes and standard-record custom fields | ✓ | ✓ |
| Attachments, search/organization, and encrypted backups | ✓ | ✓ |
| Device PRF quick unlock and server-assisted Passkey | ✓ | ✓ |
| Session controls, revision CAS, and deletion tombstones | ✓ | ✓ |
| Standalone `custom` records | v2.2.0 | — |
| Encrypted history and Recovery Center | v2.2.0 | — |
| Secure Share v2 and cross-tab favorites | v2.2.0 | — |
| Cloudflare Admin and quota controls | v2.2.0 | — |

Install the Linux edition from source using its deployment guide. The current v2.2.3 GitHub Release does not provide a Linux download archive.
