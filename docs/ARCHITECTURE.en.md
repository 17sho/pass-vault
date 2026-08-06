# Architecture and deployment boundaries

[中文](ARCHITECTURE.zh-CN.md) · [English](ARCHITECTURE.en.md) · [Back to README](../README.en.md)

## In one sentence

Pass Vault V2 is **one repository, one browser frontend, and two independent backend adapters**:

```text
One public/ + shared/ source tree
              │ npm run build
              ▼
            dist/
              ├─ Cloudflare Worker + D1 + R2
              └─ Linux Node.js + SQLite + local attachment directory
```

“Shared frontend” does not mean that two sites depend on one hosted frontend instance, nor that their accounts or data are shared. Each release archive contains and serves its own copy of the frontend assets.

## Source-sharing boundary

| Layer | Cloudflare | Linux | Shared source? |
|---|---|---|---|
| Browser UI and WebCrypto | `dist/` in Static Assets | `dist/` served by Node | Yes, from `public/` |
| Ciphertext contract and validation | Worker imports `shared/` | Node imports `shared/` | Yes |
| API backend | `apps/worker/` | `apps/server/` | No; separate implementations of the same contract |
| Database | D1 | SQLite | No |
| Attachment objects | Private R2 | Persistent local directory | No |
| Accounts, sessions, ciphertext | Stored by the Cloudflare deployment | Stored by the Linux deployment | No |

## Data path

```text
Plaintext in the browser
  ├─ master password → PBKDF2-SHA-256 (310,000 iterations) → KEK
  ├─ KEK unwraps a random AES-256-GCM vault key
  ├─ vault key encrypts each record and attachment metadata envelope
  └─ attachment content uses a unique IV and authenticated AAD
                            │
                            ▼
                  backend receives ciphertext only
```

In the default mode, master passwords, vault keys, record plaintext, search queries, and decrypted group names are not sent to the backend. The backend still observes metadata required to operate the service, such as account identifiers, sessions, request timing, ciphertext sizes, and object IDs.

## Do not confuse the two Passkey features

| Feature | Wrapping material | Existing server session required? | Boundary |
|---|---|---|---|
| Device quick unlock | Current browser IndexedDB, bound to account and session | Yes | Preserves the default server boundary; browser or whole-device migration may carry local material |
| Server-assisted Passkey | Backend stores a vault key wrapped by a separate KEK | No; it can create a new session | **Changes the default zero-knowledge boundary**; the server can recover the vault key after successful Passkey verification |

Server-assisted Passkey is optional. Invalid or incomplete configuration must disable it safely without affecting master-password login.

## The deployments do not synchronize automatically

Cloudflare and Linux users, sessions, records, attachments, and quotas are independent. To migrate:

1. export an encrypted backup from the source;
2. create and unlock an account at the destination;
3. import and verify records and attachments;
4. retain the source data and backup until verification succeeds.

## Bulk-write consistency and session boundary

The backends do not provide a transaction spanning multiple records. The browser uses compensating writes for bulk grouping, pinning, unpinning, and move-to-Trash operations:

1. capture the vault key and session generation at operation start;
2. precompute target ciphertext and write sequentially;
3. compensate successful writes in reverse order after a failure;
4. reload authoritative ciphertext if compensation fails;
5. require lock and reauthentication if reload also fails.

Forward and compensation writes remain bound to the originating session. A stale operation cannot continue through a newly signed-in account after the vault is locked or switched.

## Per-resource concurrency consistency

The backend maintains a monotonically increasing `revision` for every record and attachment. Updates must submit the current revision, and permanent deletion must carry it in `If-Match`; a mismatch returns `409 conflict` with `currentRevision`. Deletion, backup replacement, and recreation under the same ID continue the revision through a tombstone, preventing stale pages from exploiting an ABA change to overwrite or resurrect an object. A revision describes server write order only and contains no plaintext business fields.

## Release artifacts

Each stable version publishes:

- `pass-vault-v2-cloudflare-<VERSION>.tar.gz` / `.zip`
- `pass-vault-v2-linux-<VERSION>.tar.gz` / `.zip`
- `SHA256SUMS`

Both archives contain the shared frontend, but only their respective backend and deployment guide. Production configuration, databases, attachments, routes, resource IDs, and secrets are excluded.
