# Release packages

Two source distributions are produced by `npm run package:release`:

- `pass-vault-v2-cloudflare-<VERSION>`: shared browser frontend, Worker backend, and D1 migrations.
- `pass-vault-v2-linux-<VERSION>`: production Linux server package with the shared browser frontend, Node backend, and persistent SQLite/attachment paths configured by the operator.

Each archive is intentionally free of dependencies, runtime data, deployment records, secrets, and production routing/resource configuration. Run `npm ci`, then `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` after extraction. Cloudflare operators must replace the all-zero local D1 database ID and add their own deployment routing only when deploying. Linux operators must provide a writable `DB_PATH`; production should terminate HTTPS in front of the Node service.

Documentation is deliberately variant-specific:

- Cloudflare archives contain only `docs/cloudflare-deployment.zh-CN.md` and `docs/cloudflare-deployment.en.md` as deployment guides.
- Linux archives contain only `docs/server-deployment.zh-CN.md` and `docs/server-deployment.en.md` as deployment guides.
- Shared README, license, security, API, and release documents may appear in both. Legacy combined navigation pages are repository-only and are not packaged.

`SHA256SUMS` in the release directory authenticates all archives. Verify archive contents before upload and verify the downloaded public assets against the published checksum file after upload.
