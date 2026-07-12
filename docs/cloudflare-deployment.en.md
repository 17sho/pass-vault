# Cloudflare Deployment Guide (Workers + Static Assets + D1 + R2)

[中文](cloudflare-deployment.zh-CN.md) · [English](cloudflare-deployment.en.md) · [Back to home](../README.en.md)

This guide is exclusively for Cloudflare deployment. Replace every `<...>` placeholder. Never commit real account IDs, D1 IDs, tokens, or domains.

## Requirements and architecture

- Node.js 22+, npm, Git, and a Cloudflare account with Workers, D1, and R2.
- Wrangler authentication for CLI deployment; a connected GitHub repository or equivalent build/upload path for Dashboard deployment.
- **v1.1.13 prerequisite:** prepare a strong random 16–256-character `INVITE_CODE`, and apply `apps/worker/migrations/0005_invite_attempts.sql` before deploying the new code. Missing/invalid configuration returns HTTP 503 `registration_unavailable`; a wrong value returns HTTP 403 `invalid_invite` and counts toward durable rate limiting. Existing sign-in remains available.

```text
Browser ──HTTPS──> Cloudflare Worker
                       ├─ /api/* → Worker → D1: DB (encrypted metadata)
                       │                  └→ R2: ATTACHMENTS (encrypted objects)
                       └─ other  → Workers Static Assets (dist/)
```

Before the first operation, run at repository root:

```bash
npm ci
npm test && npm run lint && npm run typecheck && npm run build
```

## 1. Wrangler CLI deployment

### 1.1 Authenticate, create D1, and configure

```bash
npx wrangler login
npx wrangler whoami
cd apps/worker
npx wrangler d1 create <D1_DATABASE_NAME>
npx wrangler r2 bucket create <R2_BUCKET_NAME>
```

Copy the returned `database_id`. Edit `apps/worker/wrangler.jsonc`:

- set `name` to `<WORKER_NAME>`;
- keep binding `DB` and set the real `database_name`/`database_id`;
- keep `migrations_dir` as `migrations`;
- keep the R2 binding exactly `ATTACHMENTS` and set its `bucket_name`;
- keep Assets at `../../dist` with `run_worker_first: true`;
- remove sample routes or replace them with your domain. Keep placeholders on a public branch and inject real values through an uncommitted config or CI secrets.

### 1.2 Migrate, build, and deploy

Generate a strong value on a controlled terminal and stream it directly to Wrangler. This avoids command arguments, environment variables, and shell history. Do not enable `set -x`, record the terminal, or paste output into a ticket:

```bash
# Repository root; 32 random bytes represented by 64 hexadecimal characters
openssl rand -hex 32 | npx wrangler secret put INVITE_CODE --config apps/worker/wrangler.jsonc
```

Wrangler should confirm only the secret name/success, never its value. If people must retain the same value, generate it in a password manager (at least 128 bits of randomness, 16–256 characters), run `npx wrangler secret put INVITE_CODE --config apps/worker/wrangler.jsonc`, and paste it at the hidden prompt. Never use `echo 'real-value' | ...`, a command argument, or a committed `.dev.vars` file.

```bash
# apps/worker/
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote
# Confirm 0005_invite_attempts.sql is applied; stop before deploy if it is not
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
cd ../..
npm run build
npx wrangler deploy --config apps/worker/wrangler.jsonc
npx wrangler versions list --config apps/worker/wrangler.jsonc
curl -fsS https://<WORKER_SUBDOMAIN>/api/health
```

Add a new migration for every schema change. Never rewrite a migration already applied remotely.

### 1.3 Custom domain

Add this to the config (confirm fields against the current Wrangler schema):

```json
"routes": [{ "pattern": "<APP_DOMAIN>", "custom_domain": true }]
```

Deploy again, or use Worker **Settings → Domains & Routes → Add → Custom Domain** in Dashboard. After DNS and certificate issuance, verify the homepage and `/api/health`.

## 2. Cloudflare Dashboard deployment

Dashboard labels may change; follow the current UI.

1. **Storage & Databases → D1 → Create database** and create `<D1_DATABASE_NAME>`.
2. **Workers & Pages → Create → Import a repository**; connect `<GITHUB_REPOSITORY>` and select `<PRODUCTION_BRANCH>`.
3. Set Root directory to repository root and Build command to `npm ci && npm run build`.
4. This is not static-only Pages: it needs a Worker API plus Workers Static Assets. Where supported, set deploy command to `npx wrangler deploy --config apps/worker/wrangler.jsonc`. If import cannot honor the Worker main module, Assets, and D1, invoke Wrangler from Cloudflare CI/GitHub Actions instead of publishing plain Pages.
5. Worker **Settings → Bindings → Add → D1 database**: variable name must be `DB`; select the target database.
6. Create a private bucket under **Storage & Databases → R2 → Create bucket**; add it at Worker **Settings → Bindings → Add → R2 bucket** with variable name `ATTACHMENTS`.
7. Prefer Wrangler migrations from a controlled terminal; **confirm `0005_invite_attempts.sql` is applied before deployment**. If D1 **Console** is required, execute all unapplied `apps/worker/migrations/*.sql` in filename order and inspect the `invite_attempts` table. Do not deploy only the new code.
8. In the target Worker's **Settings → Variables and Secrets** (the current UI may group this under **Bindings** or a similarly named settings page), add the exact name `INVITE_CODE`, select encrypted **Secret**, and use a password-manager-generated value with at least 128 bits of randomness and 16–256 characters. Save and deploy the resulting version if prompted. Never choose plaintext or use build variables, repository files, or screenshots.
9. Return to the variables/secrets list and verify only the name `INVITE_CODE`, Secret type, and intended environment. Cloudflare should not reveal the value. If Secret type or environment is ambiguous, stop and use `wrangler secret put`; do not downgrade to plaintext.
10. Confirm Assets use built `dist/` and API requests reach the Worker first.
11. Add `<APP_DOMAIN>` under **Settings → Domains & Routes** (or its current equivalent), then finish DNS/certificate setup.
12. Store least-privilege `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as encrypted CI secrets, never repository values or log output.

## 3. Post-deployment verification

```bash
curl -fsS https://<APP_DOMAIN>/api/health
curl -fsSI https://<APP_DOMAIN>/
```

In a browser with a disposable account, verify that the correct invitation registers, an obviously wrong placeholder is rejected without creating an account, and the new account can sign in/unlock. Never print the real invitation through an API, log, or screenshot. Missing/invalid `INVITE_CODE` should produce HTTP 503 `registration_unavailable`; a wrong value should produce HTTP 403 `invalid_invite` (or 429 after repeated failures), while existing users can still sign in. Then test CSRF rejection, encrypted item and attachment upload/download/delete, encrypted backup import/export, and logout. R2 needs neither public access nor a public domain, and bucket CORS is unnecessary.

### 3.1 Rotation and rollback

Rotation affects only **new registrations after rotation**. It does not invalidate existing sessions, change master passwords, or re-encrypt existing vaults. Notify people who still need to register, then save a new Dashboard Secret or repeat the safe `openssl rand -hex 32 | npx wrangler secret put INVITE_CODE --config ...` flow. Verify the secret name only and run the disposable-account acceptance check. Do not keep two active values.

If registration breaks after rotation, check length, target Worker/environment, and active version first. To roll back, retrieve the previous value from the password manager and write it through the Secret UI or Wrangler's hidden prompt—**do not** use a Worker code rollback as secret rollback. Never restore a value suspected of disclosure; generate another strong random value instead.

## 4. Upgrade, backup, restore, and rollback

Before upgrading, stop writes and back up D1 and R2 at one logical point. Export D1 and use a controlled tool or Cloudflare API to copy all R2 objects to an independent versioned bucket, retaining keys, sizes, and checksums under the same timestamp. Never back up D1 alone.

```bash
cd apps/worker
npx wrangler d1 export <D1_DATABASE_NAME> --remote --output=<SAFE_BACKUP_PATH>/d1-<TIMESTAMP>.sql
npx wrangler d1 migrations list <D1_DATABASE_NAME> --remote
cd ../..
npm ci && npm test && npm run lint && npm run typecheck && npm run build
npx wrangler d1 migrations apply <D1_DATABASE_NAME> --remote --config apps/worker/wrangler.jsonc
npx wrangler deploy --config apps/worker/wrangler.jsonc
```

Restrict and store backups off-site. Restore into a new D1 and a new R2 bucket; import SQL, restore every object, verify counts and sizes, then switch `DB` and `ATTACHMENTS` bindings together before re-enabling writes:

```bash
npx wrangler d1 create <RESTORE_DATABASE_NAME>
npx wrangler d1 execute <RESTORE_DATABASE_NAME> --remote --file=<SAFE_BACKUP_PATH>/<BACKUP_FILE>.sql
```

Code rollback:

```bash
npx wrangler versions list --config apps/worker/wrangler.jsonc
npx wrangler rollback <KNOWN_GOOD_VERSION_ID> --config apps/worker/wrangler.jsonc
```

**Worker rollback does not roll back D1 or R2.** For incompatible schema/object changes, switch both bindings to D1 + R2 restored from the same backup point, or use a reviewed forward fix.

## 5. Cost and limits

- **Workers, Workers Static Assets, D1, R2 Standard, Cloudflare DNS/proxy, Universal SSL, and baseline DDoS protection all have free tiers; this project does not require Zone Pro or Workers Paid.** A free tier does not guarantee that the entire account can never be billed: paid subscriptions, other account workloads, and R2 overage must still be checked under Billing/Usage.
- Workers Free request/CPU limits follow the current official documentation and requests are limited when the Free allowance is reached. D1 Free currently includes 5,000,000 rows read/day, 100,000 rows written/day, and 5 GB total account storage; Free-tier queries fail at the daily limit rather than this project automatically upgrading the account.
- Cloudflare currently includes, **account-wide**, 10 GB-month of R2 Standard storage, 1,000,000 Class A operations, and 10,000,000 Class B operations per month; these are not per-bucket allowances. The official R2 Limits page lists per-bucket storage as Unlimited and exposes no native bucket hard spend/usage cap.
- This project therefore atomically reserves quota in D1 before R2 work, using UTC calendar months: 8 GiB encrypted bytes, 800,000 Class A/month, and 8,000,000 Class B/month. It returns `quota_exceeded` at a cap and conservatively retains counts for attempted failures. Object delete is free under the official pricing classification; a successful delete releases its storage reservation.
- The 20% margin is for other account usage and metering differences, but **does not guarantee a zero bill**. Other buckets, Dashboard, S3/API, and other Workers bypass this application's counters; GB-month also differs from instantaneous bytes. Monitor account-wide usage and billing too.
- Cloudflare Budget Alerts are account-wide dollar-spend notifications only: they alert but do not stop spend. There is no product-specific API alert at 80% of the R2 free allowance, so do not treat a billing alert as a cap.
- Attachments incur R2 storage and Class A/B operations; Worker requests and D1 queries are metered separately, and backup buckets add storage cost.
- Application plaintext limits are 10 MiB per image, 100 MiB per video, and 25 MiB per other file. Video is fully downloaded and decrypted in-browser; no Range streaming or resumable upload is provided.

### Free-deployment checklist

1. **Account → Billing → Subscriptions**: verify that Workers Paid, Zone Pro, Argo, Images, Stream, or another paid subscription was not enabled for this deployment.
2. **Account → Billing → Bills and documents**: verify that no invoice is due.
3. **Storage & Databases → R2 → Overview/Usage**: inspect account-wide (not per-bucket) storage and monthly Class A/B usage.
4. **D1 → database → Metrics → Row Metrics**: inspect daily rows read/written and total storage.
5. **Workers & Pages → Worker → Metrics**: inspect request and CPU usage.

> The project's 8 GiB / 800,000 Class A / 8,000,000 Class B caps cover only operations routed through this Worker. Dashboard, S3 API, other Workers, and other buckets bypass them. Budget Alerts notify; they do not stop spend.

### Web Analytics and the vault CSP

Zone-level Cloudflare Web Analytics `auto_install` may inject `static.cloudflareinsights.com/beacon.min.js` into the vault and conflict with the strict `script-src 'self'` CSP. **Do not weaken CSP or manually install the Beacon in either vault.**

- If the Free plan does not offer hostname exclusion rules, open **Analytics & Logs → Web Analytics → site → Manage site → RUM** and choose **Enable and install JS snippet**. This stops automatic injection; manually install the snippet only on other, non-sensitive sites that need analytics.
- If the entire zone needs no analytics, choose Disable. Do not delete or disable zone-wide analytics for one hostname without checking other sites.
- Allow edge configuration to propagate, then verify in a real browser that the DOM contains no `data-cf-beacon` and the console has no CSP violation.

## 6. Security and troubleshooting

- Enable MFA on Cloudflare, use and rotate least-privilege API tokens, and secure GitHub/CI.
- Use production only over HTTPS. Encrypt, restrict, store off-site, and rehearse backups.
- Never log or share passwords, vault keys, plaintext, full ciphertext, cookies, or tokens.

| Symptom | Check |
|---|---|
| `DB` is undefined | Binding is exactly `DB`; current environment/version uses the intended D1 |
| Registration returns 503 `registration_unavailable` | `INVITE_CODE` is missing, outside 16–256 characters, or attached to the wrong Worker/environment; verify only name/type and write it again safely |
| Correct value returns 403/429 | Check accidental leading/trailing whitespace and target environment; wait for the rate-limit window and retry with a disposable account without logging the value |
| `no such table` | Migrations ran completely against the `--remote` target |
| Static 404/stale UI | `npm run build`, Assets=`dist/`, deployment version, cache |
| Dashboard creates only a static site | Use Worker + Assets through Wrangler/CI, not plain Pages as an API replacement |
| Session disappears | HTTPS, system clock, consistent cookie/domain |
| 403/CSRF | Same-origin access, cookie delivery, consistent custom domain |
| Failure after rollback | Code/D1 schema compatibility; version rollback is not database rollback |
