# Complete Cloudflare Deployment Guide (Workers + Static Assets + D1 + R2)

[中文](cloudflare-deployment.zh-CN.md) · [English](cloudflare-deployment.en.md) · [Back to home](../README.en.md)

This guide covers first deployment, production upgrades, backup, restore, rollback, and acceptance checks for current `main`. Replace every `<...>` placeholder. Never commit real domains, account/database IDs, bucket names, tokens, invitation codes, KEKs, production backups, or private deployment configuration to the public repository.

> **Version note:** the Cloudflare archives attached to GitHub Release `v2.2.3` contain the complete code through that tag, including R2 lifecycle migrations `0011`–`0013` and revision CAS/tombstone migrations `0014`–`0016`.

## 1. Architecture, requirements, and trust boundary

```text
Browser ──HTTPS──> Cloudflare Worker
                       ├─ /api/* → Worker → D1 binding: DB (auth material and encrypted metadata)
                       │                  └→ R2 binding: ATTACHMENTS (encrypted attachment objects)
                       └─ other  → Workers Static Assets binding: ASSETS (dist/)
                                      ↑
                         Cron 17 * * * *: bounded reconciliation/cleanup
```

Requirements:

- Node.js 22+, npm, Git, and a Cloudflare account with Workers, D1, and R2 enabled;
- Wrangler 4.x, installed at the repository-pinned version by `npm ci`;
- a strong random 16–256-character `INVITE_CODE`;
- a private R2 bucket for attachments; public access, an R2 custom domain, and bucket CORS are unnecessary;
- HTTPS only in production.

By default, the Worker has no server key that can independently recover the vault key. Optional server-assisted Passkey unlock stores a vault-key copy wrapped under an independent KEK in D1. After WebAuthn user verification, the Worker can recover the vault key and create a session, so this **changes the default zero-knowledge boundary**. The Worker still receives neither the master password nor a plaintext vault key. Understand this trade-off before enabling it.

## 2. Obtain the code and run local gates

### 2.1 Recommended: deploy current `main`

```bash
git clone https://github.com/17sho/pass-vault-v2.git
cd pass-vault-v2
git checkout main
git pull --ff-only
# Record and review the exact commit; evidence must contain no secrets
git rev-parse HEAD
npm ci
npm test
npm run lint
npm run lint:docs
npm run typecheck
npm run build
```

Every command must naturally exit 0. Do not substitute interrupted, timed-out, or older-commit results.

### 2.2 v2.2.3 Cloudflare artifacts

The Cloudflare assets in this Release are:

- `pass-vault-v2-cloudflare-2.2.3.tar.gz`
- `pass-vault-v2-cloudflare-2.2.3.zip`
- `SHA256SUMS`

```bash
VERSION=2.2.3
curl -fLO "https://github.com/17sho/pass-vault-v2/releases/download/v$VERSION/pass-vault-v2-cloudflare-$VERSION.tar.gz"
curl -fLO "https://github.com/17sho/pass-vault-v2/releases/download/v$VERSION/SHA256SUMS"
grep "pass-vault-v2-cloudflare-$VERSION.tar.gz" SHA256SUMS | sha256sum -c -
```

The check must report `OK`. The package contains the complete Cloudflare code through tag `v2.2.3`; still inspect and apply every pending migration during upgrades.

## 3. Configuration model: public template vs. private production config

`apps/worker/wrangler.jsonc` is a public template. It intentionally contains placeholder D1/R2 resources and `workers_dev:true` so a new deployment without a custom domain still has a target. **Never write production IDs, bucket names, domains, or variables back into the public template.**

Copy it outside the repository or to a gitignored path for production, for example:

```bash
umask 077
install -m 0600 apps/worker/wrangler.jsonc <SAFE_CONFIG_DIR>/wrangler.production.jsonc
```

A private production config should contain at least:

```jsonc
{
  "$schema": "<ABSOLUTE_REPOSITORY_PATH>/node_modules/wrangler/config-schema.json",
  "name": "<WORKER_NAME>",
  "workers_dev": false,
  "main": "<ABSOLUTE_REPOSITORY_PATH>/apps/worker/src/index.ts",
  "compatibility_date": "2026-07-11",
  "compatibility_flags": ["nodejs_compat"],
  "vars": {
    "PASSKEY_RP_ID": "<APP_DOMAIN>",
    "PASSKEY_ORIGIN": "https://<APP_DOMAIN>"
  },
  "d1_databases": [{
    "binding": "DB",
    "database_name": "<D1_DATABASE_NAME>",
    "database_id": "<D1_DATABASE_ID>",
    "migrations_dir": "<ABSOLUTE_REPOSITORY_PATH>/apps/worker/migrations"
  }],
  "r2_buckets": [{
    "binding": "ATTACHMENTS",
    "bucket_name": "<R2_BUCKET_NAME>"
  }],
  "assets": {
    "directory": "<ABSOLUTE_REPOSITORY_PATH>/dist",
    "binding": "ASSETS",
    "run_worker_first": true
  },
  "routes": [{ "pattern": "<APP_DOMAIN>", "custom_domain": true }],
  "triggers": { "crons": ["17 * * * *"] },
  "observability": { "enabled": true, "head_sampling_rate": 1 }
}
```

If the private config is outside the repository, use absolute paths for `main`, `assets.directory`, and `migrations_dir`. Relative paths resolve from the **config file's directory** and can accidentally point to locations such as `/tmp/migrations`.

### 3.1 Required bindings and settings

| Type | Name | Requirement |
|---|---|---|
| Secret | `INVITE_CODE` | Required, 16–256 characters; invalid/missing config returns 503 for new registration while existing sign-in remains available |
| Secret | `PASSKEY_UNLOCK_KEK` | Required for assisted Passkey unlock; Base64URL of 32 random bytes; never rotate blindly |
| Plain var | `PASSKEY_RP_ID` | Exact HTTPS hostname such as `<APP_DOMAIN>` when Passkey is enabled |
| Plain var | `PASSKEY_ORIGIN` | `https://<APP_DOMAIN>` with no path or trailing slash |
| D1 | `DB` | Must target the intended database |
| R2 | `ATTACHMENTS` | Must target the private attachment bucket |
| Assets | `ASSETS` | Built `dist/` with `run_worker_first:true` |
| Cron | `17 * * * *` | Maintains R2 inventory/pending work, crash-stale in-flight/locks, and expired sessions |

All three Passkey settings must be valid together. Otherwise only assisted Passkey unlock fails closed; master-password sign-in still works. **Never replace an existing `PASSKEY_UNLOCK_KEK`**: losing or changing it breaks already enrolled assisted wrapping material.

## 4. First CLI deployment

### 4.1 Authenticate and create resources

```bash
npx wrangler login
npx wrangler whoami
npx wrangler d1 create <D1_DATABASE_NAME>
npx wrangler r2 bucket create <R2_BUCKET_NAME>
```

Write returned resource details only to the private production config. Binding names must remain `DB`, `ATTACHMENTS`, and `ASSETS`.

### 4.2 Store secrets safely

```bash
openssl rand -hex 32 | npx wrangler secret put INVITE_CODE --config <PRODUCTION_CONFIG>
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n' | \
  npx wrangler secret put PASSKEY_UNLOCK_KEK --config <PRODUCTION_CONFIG>
```

Do not enable `set -x`, use `echo 'real-value'`, or expose values in arguments, the repository, tickets, screenshots, or logs. If a stable recoverable value is required, generate/store it in a password manager and paste it into Wrangler's hidden prompt.

`INVITE_CODE_PEPPER` is a required shared secret whenever Admin-created invitation codes are enabled. Configure the **same value** on both the main Worker and Admin Worker, verify only that the secret name exists in each Worker, and never print the value. A mismatch makes newly created invitations unverifiable.

### 4.3 Apply the complete migration chain

The migration ledger lives in `apps/worker/migrations/`. A fresh deployment of current `main` must apply `0001` through `0034` (including `0034_admin_control_center.sql`); upgrades apply only pending migrations:

```bash
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote --config <PRODUCTION_CONFIG>
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote --config <PRODUCTION_CONFIG>
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote --config <PRODUCTION_CONFIG>
```

The final command must show no pending migration. Add a new migration for each schema change; never rewrite an already-applied file. Important current migrations include:

- `0008_session_metadata.sql`: session device/activity metadata;
- `0009_passkey_assisted_unlock.sql`: assisted credentials, challenges, and failure-rate slots;
- `0010_session_auth_method.sql`: session authentication method;
- `0011_r2_cleanup_queue.sql`: durable R2 deletion queue and physical quota;
- `0012_backup_import_locks.sql`: per-user backup import lock;
- `0013_r2_inflight_uploads.sql`: durable pre-R2-write in-flight fencing.
- `0014_entries_revision.sql`: optimistic-concurrency revision for entries;
- `0015_attachments_revision.sql`: optimistic-concurrency revision for attachments;
- `0016_revision_tombstones.sql`: monotonic revisions across delete/restore cycles to prevent ABA;
- `0027_reset_user_quota_audit.sql`: resets stale quota audit state after quota-schema upgrades;
- `0028_admin_quota_history_index.sql`: adds the Admin quota-history lookup index;
- `0029_f3_r2_consistency.sql`: backfills R2 lifecycle ownership, recreates attribution-aware pruning, and adds maintenance/backup leases;
- `0034_admin_control_center.sql`: extends Admin audit and security-event constraints and adds user suspension, notification, maintenance-report, and candidate tables. Apply it before deploying the new main Worker and Admin Worker code.

### 4.4 Dry-run and deploy

```bash
npm run build
npx wrangler deploy --dry-run --config <PRODUCTION_CONFIG>
npx wrangler deploy --config <PRODUCTION_CONFIG>
npx wrangler deployments status --config <PRODUCTION_CONFIG>
npx wrangler versions list --config <PRODUCTION_CONFIG>
```

Completion requires the intended new version to serve 100% of traffic. Uploading a version alone is not a successful traffic cutover.

## 5. Production upgrades: preserve the complete live configuration

> **Critical Wrangler behavior:** deploying code does not automatically preserve ordinary `vars`. By default Wrangler deletes old plain vars and then sets only the vars in the config. Secrets are not deleted by ordinary deploy. Cloudflare's `--keep-vars` preserves Dashboard-managed plain vars, but it does not replace a full audit of bindings, routes, triggers, compatibility, and `workers_dev`.

### 5.1 Freeze the pre-upgrade baseline

Before any deployment, record the **version active before the task began** and store a name/type-only inventory with no secret values:

```bash
npx wrangler deployments status --config <PRODUCTION_CONFIG>
npx wrangler versions view <PRE_TASK_VERSION_ID> --json --config <PRODUCTION_CONFIG> > <SAFE_EVIDENCE>/before-version.json
npx wrangler secret list --config <PRODUCTION_CONFIG> > <SAFE_EVIDENCE>/before-secret-names.json
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote --config <PRODUCTION_CONFIG>
```

Compare and preserve:

- every plain variable and its managed source;
- every Secret name (never retrieve its value);
- `DB`, `ATTACHMENTS`, and `ASSETS` bindings and targets;
- compatibility date and flags;
- custom-domain routes;
- Cron triggers;
- intended `workers_dev` state;
- observability settings.

**Never use an intermediate version deployed during the same task as the old baseline.** If live values cannot be established, stop and reconstruct the inventory from Dashboard or restricted configuration before deploying.

If plain vars are intentionally Dashboard-managed rather than declared in private config, use explicitly:

```bash
npx wrangler deploy --keep-vars --config <PRODUCTION_CONFIG>
```

This project recommends declaring non-secret `PASSKEY_RP_ID` and `PASSKEY_ORIGIN` in the restricted production config for reproducibility. With or without `--keep-vars`, audit every other binding and route.

### 5.2 Consistent backup

Before upgrading, pause or isolate writes and back up D1 and R2 at the same logical point:

```bash
npx wrangler d1 export <D1_DATABASE_NAME> --remote \
  --output=<SAFE_BACKUP_DIR>/d1-<TIMESTAMP>.sql \
  --config <PRODUCTION_CONFIG>
sha256sum <SAFE_BACKUP_DIR>/d1-<TIMESTAMP>.sql > <SAFE_BACKUP_DIR>/d1-<TIMESTAMP>.sql.sha256
chmod 0600 <SAFE_BACKUP_DIR>/d1-<TIMESTAMP>.sql*
```

Also use a controlled tool/API to copy every R2 object to an independent versioned backup bucket, retaining keys, sizes, and checksums. **Never back up D1 or R2 alone.** Keep backups outside the repository, access-restricted, and off-site.

### 5.3 Upgrade order

1. Record the pre-task version and complete configuration inventory.
2. Create and validate a same-point D1 + R2 backup.
3. Run `npm ci` and all current gates.
4. Run deploy dry-run against the private production config.
5. Apply every pending migration and confirm none remain.
6. Deploy the Worker and Assets.
7. Confirm 100% traffic on the new version.
8. Compare old/new configuration; any unintended deletion blocks the release.
9. Complete section 7 before closing the maintenance window.

## 6. Dashboard / CI deployment

Dashboard labels change, but the final state must equal the CLI path:

1. Create/select D1 and a private R2 bucket.
2. Bind `DB`, `ATTACHMENTS`, and `ASSETS`.
3. Use repository root and build command `npm ci && npm run build`.
4. Deploy Worker API + Workers Static Assets, never static-only Pages.
5. Store `INVITE_CODE` and `PASSKEY_UNLOCK_KEK` as Secrets.
6. Store `PASSKEY_RP_ID` and `PASSKEY_ORIGIN` as plain variables.
7. Add Cron Trigger `17 * * * *`.
8. Add the exact custom domain; disable `workers.dev` where production should not expose it.
9. Apply every D1 migration from a controlled terminal before code deployment.
10. Keep least-privilege API token/account ID in encrypted CI secrets only.
11. Before each upgrade, export/compare all variables, Secret names, bindings, routes, and triggers. A code diff alone is insufficient.

## 7. Complete post-deployment acceptance

### 7.1 Anonymous and configuration checks

```bash
curl -fsS https://<APP_DOMAIN>/api/health
curl -fsSI https://<APP_DOMAIN>/
curl -fsS -o /dev/null -w '%{http_code}\n' https://<WORKER_SUBDOMAIN>.workers.dev/api/health
```

Expected: custom-domain health is 200; if production uses `workers_dev:false`, the real workers.dev endpoint is 404. Also verify:

- only the target version serves 100% traffic;
- Secret names `INVITE_CODE` and `PASSKEY_UNLOCK_KEK` remain;
- plain vars `PASSKEY_RP_ID` and `PASSKEY_ORIGIN` remain;
- D1/R2/Assets bindings, custom domain, Cron, and compatibility remain;
- homepage, `app.mjs`, `style.css`, and other fixed assets match local `dist/` hashes;
- security headers remain and Web Analytics did not inject script into the DOM.

An anonymous Passkey authentication-options request can verify server configuration: correct configuration returns a WebAuthn challenge rather than 503 `passkey_unlock_unavailable`. The probe creates short-lived challenge/rate-limit rows; use a recognizable test source and clean only its exact scope. Never delete production rows broadly.

### 7.2 Real browser and disposable account

Only run these checks with a legitimate invitation and a disposable account:

1. register with the correct invitation; an obviously wrong value returns 403 `invalid_invite` without creating a user, while missing/invalid server configuration returns 503 `registration_unavailable`;
2. master-password sign-in/unlock and item CRUD;
3. attachment upload, download, replacement, and deletion;
4. metadata-only and complete backup export/import;
5. Security Center authentication-method/session display;
6. enroll assisted Passkey, lock, complete real-device Passkey unlock, then revoke and verify rejection;
7. logout and confirm session invalidation;
8. delete test items, attachments, sessions, Passkeys, and account; verify no residue.

Never fabricate success without a legitimate invitation or real device. A returned challenge proves server configuration only; it **does not prove an existing Passkey completed real-device unlock**.

### 7.3 D1/R2 reconciliation

At minimum compare:

- `attachments` references, object keys, and `ciphertext_size`;
- R2 object keys and sizes;
- D1 missing objects = 0, R2 orphans = 0, size mismatches = 0;
- `pending_r2_deletions = 0`;
- `r2_inflight_uploads = 0`;
- `backup_import_locks = 0`;
- `r2_storage_usage.reserved_bytes` is not below Worker-managed physical object bytes.

A small conservative counter margin is not an R2 orphan. Report physical object differences separately from quota counters. Cron performs bounded inventory, but does not replace post-release human read-only reconciliation.

## 8. R2 lifecycle, Cron, and limits

- Ordinary delete atomically removes the D1 reference and records pending work; storage quota is released only after actual R2 deletion.
- Upload records `r2_inflight_uploads` before R2 write; committing the D1 reference and removing in-flight occur in one transaction.
- Complete backup import uses per-user token fencing against old requests and v1/v2 concurrency.
- Hourly Cron reconciles `attachments + pending + inflight` with paginated R2 inventory and rechecks references before physical deletion.
- Active backup imports renew a 10-minute token-fenced lease around every R2 upload. A new import may atomically take over an expired lease; scheduled maintenance separately reclaims crash-stale in-flight uploads and lock rows after 24 hours.
- A fixed grace period alone cannot prove upload completion; do not remove `0013` or disable Cron while claiming race safety.

Cloudflare application limits are 20 MiB per image, video, or other attachment, and 20 MiB total attachment ciphertext in one complete backup. Conservative application caps are 8 GiB storage, 800,000 Class A/month, and 8,000,000 Class B/month. They cover only operations through this Worker; Dashboard, S3 API, other Workers, and other account buckets bypass them.

## 9. Cost and account-wide checks

Workers, Static Assets, D1, R2 Standard, DNS, and SSL have free tiers, but cannot guarantee a zero bill for the account:

1. Billing → Subscriptions: verify no unintended paid product.
2. Bills and documents: verify no unpaid invoice.
3. R2 Overview/Usage: inspect account-wide storage and Class A/B.
4. D1 Metrics: inspect rows read/written and storage.
5. Worker Metrics: inspect requests and CPU.

Cloudflare Budget Alerts notify only; they do not stop spend. R2 free allowance is account-wide, not per bucket.

## 10. Restore and rollback

Code rollback:

```bash
npx wrangler versions list --config <PRODUCTION_CONFIG>
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --config <PRODUCTION_CONFIG>
```

**Worker rollback does not roll back D1, R2, ordinary variables, or external resources.** After rollback, re-audit Passkey vars, Secret names, bindings, routes, Cron, and `workers_dev`.

Restore data into a new D1 and R2 from the same backup point. Import SQL and every object, compare keys/counts/sizes, then switch `DB` and `ATTACHMENTS` together. Never pair old D1 with new R2 or overwrite a production resource still receiving writes. Re-enable writes and remove failed-state copies only after full acceptance succeeds.

## 11. Web Analytics, CSP, and troubleshooting

Cloudflare Web Analytics `auto_install` may inject `static.cloudflareinsights.com/beacon.min.js` and violate this vault's strict CSP. Do not weaken `script-src 'self'`. Disable automatic injection for the sensitive hostname, or manually install the snippet only on other non-sensitive sites. Verify real-browser DOM has no `data-cf-beacon` and console has no CSP violation.

| Symptom | Check |
|---|---|
| Passkey says unavailable | All three Passkey settings; whether deployment deleted RP ID/Origin because `vars` were omitted; exact Origin |
| Registration 503 `registration_unavailable` | `INVITE_CODE` Secret name, environment, and length; never print its value |
| Correct invitation gets 403/429 | Hidden whitespace, target environment, rate-limit window |
| `no such table` or `no such column: revision` | Full `0001`–`0029` chain on the correct remote D1 |
| Attachment/backup 500 or missing table | Full `0001`–`0029` chain, R2 binding, Cron, and active version |
| Static 404/stale UI | Assets path, build, 100% traffic, cache, asset hashes |
| workers.dev unexpectedly public | Private config `workers_dev:false` was not replaced by public template |
| Cron missing | `triggers.crons` exists in private config and active version |
| Failure after rollback | Code/schema/config compatibility; code rollback is not data/variable rollback |

## 12. Final release checklist

- [ ] Record pre-task version and complete configuration inventory
- [ ] Same-point D1 + R2 backup, verified, restricted, and outside Git
- [ ] Current commit test/lint/docs/typecheck/build all naturally exit 0
- [ ] Private config contains all vars, bindings, routes, Cron, compatibility, and intended `workers_dev`
- [ ] Secret names are complete; no value enters Git or logs
- [ ] Every pending migration applied; second listing shows none
- [ ] Dry-run passes and intended version serves 100% traffic
- [ ] Custom domain is 200; workers.dev is 404 when intentionally disabled
- [ ] Passkey options works; real-device Passkey unlock checked when available
- [ ] D1/R2 object differences and transient tables are clean
- [ ] Disposable account and probe data are precisely cleaned
- [ ] Git diff and secret scan pass

Only then is the production Cloudflare deployment complete.