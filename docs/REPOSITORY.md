# Repository map

This repository keeps runtime code, current specifications, durable documentation, and historical evidence separate so humans and coding agents can find the authoritative source quickly.

## Where to start

1. Read [`AGENTS.md`](../AGENTS.md).
2. Read the core behavioral and security contract in [`specs/core.md`](../specs/core.md).
3. Read the relevant domain specification under [`specs/`](../specs/).
4. Use the architecture and platform deployment guides under `docs/`.
5. Treat `docs/history/` as historical context only, not current requirements.

## Directory ownership

| Path | Purpose |
|---|---|
| `apps/worker/` | Cloudflare Worker, D1 migrations, and public Wrangler template |
| `apps/admin-worker/` | Optional Cloudflare Access-protected admin Worker |
| `apps/server/` | Independent Linux/SQLite backend |
| `public/` | Shared browser frontend source |
| `shared/` | Runtime-independent encrypted contract helpers |
| `specs/` | Current authoritative product/domain specifications |
| `tests/` | Full repository test suite |
| `scripts/` | Build, validation, packaging, and deployment utilities |
| `deploy/` | Linux deployment templates |
| `docs/releases/` | Historical and current release notes |
| `docs/history/` | Superseded plans, TODOs, and old test evidence |
| `design/archive/` | Non-runtime design explorations |

## Release boundary

The Git repository and immutable tag contain the full source and full test suite. Platform release archives are deliberately narrower and contain only the selected runtime plus a dependency-closed test subset. Wrangler deploys the Worker bundle and `dist/` assets only; documentation, specifications, history, design explorations, and tests are not deployed to Cloudflare production.
