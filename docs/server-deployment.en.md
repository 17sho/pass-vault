# Linux Server Deployment Guide (Node.js + SQLite)

[中文](server-deployment.zh-CN.md) · [English](server-deployment.en.md) · [Back to home](../README.en.md)

This guide is exclusively for a Linux VPS or dedicated server. Replace every `<...>` placeholder. Never commit domains, databases, backups, or secrets.

> **Unlike the Cloudflare edition:** the Linux edition does not use R2 and does not apply the Cloudflare edition's 8 GiB / 800,000 Class A / 8,000,000 Class B monthly billing-protection quotas. It does not return the R2 `quota_exceeded` error. Total capacity is governed by server disk space, reverse-proxy settings, and administrator policy. The deployment targets may intentionally use different resource policies and do not synchronize automatically.

## 1. Requirements and architecture

- Ubuntu 22.04+/Debian 12+ (adapt as needed for another systemd distribution) and root/sudo.
- Node.js **22+**, npm, `sqlite3`, `curl`, and `tar`; Git is also needed for a source install.
- A domain pointed at the host, ports 80/443, Caddy or Nginx, and independent off-site backup storage.
- Recommended minimum: 1 vCPU, 512 MiB RAM, and monitored persistent disk capacity.

```text
Browser ──HTTPS──> Caddy/Nginx :443 ──HTTP──> 127.0.0.1:3000
                                                   │
                                      Node.js + static dist/
                                                   │
                         SQLite + attachments/ (persistent ciphertext)
```

Node binds only to loopback and systemd runs it as a dedicated user. SQLite plus its WAL/SHM files live in a persistent data directory; application releases are read-only.

## 2. Dedicated user and directories

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl sqlite3 tar
node --version   # must be >= 22
npm --version
sudo useradd --system --home /var/lib/pass-vault-v2 --shell /usr/sbin/nologin pass-vault 2>/dev/null || true
sudo install -d -o root -g pass-vault -m 0750 /opt/pass-vault-v2/releases
sudo install -d -o pass-vault -g pass-vault -m 0750 /var/lib/pass-vault-v2
sudo install -d -o pass-vault -g pass-vault -m 0700 /var/lib/pass-vault-v2/attachments
sudo install -d -o root -g pass-vault -m 0750 /etc/pass-vault-v2
sudo install -d -o root -g root -m 0700 /var/backups/pass-vault-v2
```

`/opt/pass-vault-v2/current` will point to the active release. Never store the database in the application directory.

## 3. Install (choose one method)

### 3.1 Download a GitHub Release (recommended)

Download `pass-vault-v2-linux-<VERSION>.tar.gz` and `SHA256SUMS` from Releases:

```bash
cd /tmp
curl -fLO https://github.com/17sho/pass-vault-v2/releases/download/v<VERSION>/pass-vault-v2-linux-<VERSION>.tar.gz
curl -fLO https://github.com/17sho/pass-vault-v2/releases/download/v<VERSION>/SHA256SUMS
grep 'pass-vault-v2-linux-<VERSION>.tar.gz' SHA256SUMS | sha256sum -c -
sudo tar -xzf pass-vault-v2-linux-<VERSION>.tar.gz -C /opt/pass-vault-v2/releases
```

### 3.2 Install from source

```bash
sudo apt-get install -y git
cd /tmp
git clone --depth 1 --branch v<VERSION> https://github.com/17sho/pass-vault-v2.git pass-vault-src
cd pass-vault-src
git rev-parse HEAD
sudo install -d -o root -g pass-vault -m 0750 /opt/pass-vault-v2/releases/pass-vault-v2-linux-<VERSION>
sudo cp -a package.json package-lock.json LICENSE README.md README.en.md SECURITY.md public shared scripts apps/server deploy docs /opt/pass-vault-v2/releases/pass-vault-v2-linux-<VERSION>/
```

Continue after either method:

```bash
cd /opt/pass-vault-v2/releases/pass-vault-v2-linux-<VERSION>
sudo npm ci
sudo npm test
sudo npm run lint && sudo npm run typecheck && sudo npm run build
sudo chown -R root:pass-vault .
sudo chmod -R go-w .
sudo ln -sfn /opt/pass-vault-v2/releases/pass-vault-v2-linux-<VERSION> /opt/pass-vault-v2/current
```

## 4. Configuration variables

| Variable | Production value | Purpose |
|---|---|---|
| `NODE_ENV` | `production` | Runtime marker |
| `HOST` | `127.0.0.1` | Never bind the app directly to the public interface |
| `PORT` | `3000` | Local reverse-proxy port |
| `DB_PATH` | `/var/lib/pass-vault-v2/pass-vault.sqlite` | Absolute persistent SQLite path |
| `ATTACHMENTS_DIR` | `/var/lib/pass-vault-v2/attachments` | Persistent local directory for encrypted attachment objects |
| `COOKIE_SECURE` | unset | Secure cookies are on by default; never set `false` in production |
| `INVITE_CODE` | required | Shared registration invitation (16–256 characters); keep it in the root:`pass-vault`, `0600` environment file and never log it |

Create `/etc/pass-vault-v2/pass-vault-v2.env`. To keep the invitation out of shell history and process arguments, assemble a root-only temporary file, stream randomness from `openssl`, and install it atomically:

```bash
umask 077
tmp=$(mktemp)
printf '%s\n' 'NODE_ENV=production' 'HOST=127.0.0.1' 'PORT=3000' \
  'DB_PATH=/var/lib/pass-vault-v2/pass-vault.sqlite' \
  'ATTACHMENTS_DIR=/var/lib/pass-vault-v2/attachments' >"$tmp"
printf 'INVITE_CODE=' >>"$tmp"
openssl rand -hex 32 >>"$tmp"
sudo install -o root -g pass-vault -m 0600 "$tmp" /etc/pass-vault-v2/pass-vault-v2.env
rm -f "$tmp"
sudo stat -c '%U:%G %a %n' /etc/pass-vault-v2/pass-vault-v2.env
sudo grep -q '^INVITE_CODE=' /etc/pass-vault-v2/pass-vault-v2.env && echo 'INVITE_CODE name present'
```

Expected output contains only `root:pass-vault 600` and the name-presence confirmation. Do **not** use `cat`, non-quiet `grep INVITE_CODE`, or log the value. A systemd `EnvironmentFile` is not a shell; the generated hexadecimal value is safest. If an operator-supplied value is required, restrict it to printable ASCII without whitespace, quotes, backslashes, `#`, `$`, `%`, control characters, or newlines, and keep it 16–256 characters. Do not rely on shell quoting/expansion to encode a complex value.

## 5. systemd

Create `/etc/systemd/system/pass-vault-v2.service`:

```ini
[Unit]
Description=Pass Vault V2
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=pass-vault
Group=pass-vault
WorkingDirectory=/opt/pass-vault-v2/current
EnvironmentFile=/etc/pass-vault-v2/pass-vault-v2.env
ExecStart=/usr/bin/node apps/server/server.mjs
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectHome=true
ProtectSystem=strict
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
ReadWritePaths=/var/lib/pass-vault-v2
[Install]
WantedBy=multi-user.target
```

Check `command -v node`; change `ExecStart` to its real absolute path if needed.

```bash
sudo systemd-analyze verify /etc/systemd/system/pass-vault-v2.service
sudo systemctl daemon-reload
sudo systemctl enable --now pass-vault-v2
sudo systemctl status pass-vault-v2 --no-pager
curl -fsS http://127.0.0.1:3000/api/health
```

The health response should contain `{"ok":true,"backend":"sqlite"}`.

## 6. Reverse proxy and HTTPS

Point DNS A/AAAA records at the server first. Choose Caddy or Nginx; do not run both on 80/443.

### 6.1 Caddy

Install Caddy from its official repository and set `/etc/caddy/Caddyfile`:

```caddyfile
<APP_DOMAIN> {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
  header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains and renews the certificate automatically. Confirm issuance in `journalctl -u caddy`.

### 6.2 Nginx

Install `nginx`, Certbot, and its Nginx plugin. Use an initial HTTP site to issue the certificate, then configure:

```nginx
server { listen 80; server_name <APP_DOMAIN>; return 301 https://$host$request_uri; }
server {
  listen 443 ssl http2;
  server_name <APP_DOMAIN>;
  ssl_certificate /etc/letsencrypt/live/<APP_DOMAIN>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/<APP_DOMAIN>/privkey.pem;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  client_max_body_size 110m;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP $remote_addr;
  }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
```

## 7. Firewall

Allow SSH first to avoid locking yourself out; adjust for your actual SSH port:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Do not allow 3000. Restrict the provider security group to SSH (preferably trusted sources), 80, and 443.

## 8. First sign-in and acceptance checks

```bash
curl -fsS https://<APP_DOMAIN>/api/health
curl -fsSI https://<APP_DOMAIN>/
sudo ss -ltnp | grep -E ':(80|443|3000)\b'
```

With a new disposable account: register using the correct invitation (12+ character password), sign in/unlock, create a nonsensitive test item, refresh/read it, edit/delete it, export an encrypted backup, log out, and confirm the session is invalid. Then verify an obviously wrong placeholder is rejected without creating an account. Missing/invalid configuration should return 503 `registration_unavailable`; a wrong value returns 403 `invalid_invite` (or 429 after repeated failures), while existing users can still sign in. Verify the cookie is `Secure`, `HttpOnly`, and `SameSite=Strict`; HTTP redirects to HTTPS; port 3000 is unreachable publicly. Never print the real invitation or test with real vault secrets.

### 8.1 Rotation and rollback

Rotation affects only **new registrations after rotation**. It does not invalidate existing users, change master passwords, or re-encrypt existing vaults. Retain the current value in a password manager for approved emergency rollback, then use the root-only temporary-file procedure in section 4 to generate and atomically install a replacement. Run `sudo systemctl restart pass-vault-v2`, check service status and HTTPS health, verify only file ownership/mode and the `INVITE_CODE` name, then test registration and sign-in with a disposable account.

If it fails, check value length, file path, and the unit's actual `EnvironmentFile`. For rollback, atomically reinstall the previous password-manager value with mode `0600` and restart. Never restore a value suspected of disclosure; generate another strong random value.

## 9. Upgrade and rollback

1. Record `readlink -f /opt/pass-vault-v2/current`.
2. Make and validate a consistent SQLite + attachments backup as below; confirm adequate free disk.
3. Install the new version into a new release directory and run all tests/build before activation.
4. Switch atomically and restart:

```bash
sudo ln -sfn /opt/pass-vault-v2/releases/pass-vault-v2-linux-<NEW_VERSION> /opt/pass-vault-v2/current
sudo systemctl restart pass-vault-v2
sudo journalctl -u pass-vault-v2 -n 100 --no-pager
curl -fsS https://<APP_DOMAIN>/api/health
```

Code rollback:

```bash
sudo ln -sfn /opt/pass-vault-v2/releases/pass-vault-v2-linux-<KNOWN_GOOD_VERSION> /opt/pass-vault-v2/current
sudo systemctl restart pass-vault-v2
```

A code rollback does not roll back SQLite. Restore the pre-upgrade database only when schema/data compatibility requires it and only with the stopped-service restore procedure.

## 10. Consistent SQLite and attachment backup

Database rows and attachment objects must represent the same point in time. The simplest safe procedure pauses writes, backs up SQLite, and archives the attachment directory. Never copy a live WAL database or back up only one side.

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
sudo systemctl stop pass-vault-v2
sudo -u pass-vault sqlite3 /var/lib/pass-vault-v2/pass-vault.sqlite \
  ".backup '/var/lib/pass-vault-v2/backup-$STAMP.sqlite'"
sudo tar -C /var/lib/pass-vault-v2 -czf /var/backups/pass-vault-v2/attachments-$STAMP.tar.gz attachments
sudo mv /var/lib/pass-vault-v2/backup-$STAMP.sqlite /var/backups/pass-vault-v2/
sudo chmod 0600 /var/backups/pass-vault-v2/{backup-$STAMP.sqlite,attachments-$STAMP.tar.gz}
sudo systemctl start pass-vault-v2
sudo sqlite3 /var/backups/pass-vault-v2/backup-$STAMP.sqlite 'PRAGMA integrity_check;'
sudo tar -tzf /var/backups/pass-vault-v2/attachments-$STAMP.tar.gz >/dev/null
```

The result must be `ok`. Encrypt and copy backups to independent off-site storage, apply retention, and rehearse restores. Backups contain authentication material and ciphertext and remain sensitive.

## 11. Restore

Validate the backup before a maintenance window:

```bash
BACKUP=/var/backups/pass-vault-v2/<BACKUP_FILE>.sqlite
ATTACHMENTS_BACKUP=/var/backups/pass-vault-v2/<ATTACHMENTS_BACKUP>.tar.gz
sudo sqlite3 "$BACKUP" 'PRAGMA integrity_check;'
sudo tar -tzf "$ATTACHMENTS_BACKUP" >/dev/null
sudo systemctl stop pass-vault-v2
sudo cp -a /var/lib/pass-vault-v2/pass-vault.sqlite /var/backups/pass-vault-v2/failed-$(date -u +%Y%m%dT%H%M%SZ).sqlite
sudo rm -f /var/lib/pass-vault-v2/pass-vault.sqlite-wal /var/lib/pass-vault-v2/pass-vault.sqlite-shm
sudo install -o pass-vault -g pass-vault -m 0600 "$BACKUP" /var/lib/pass-vault-v2/pass-vault.sqlite
sudo mv /var/lib/pass-vault-v2/attachments /var/backups/pass-vault-v2/failed-attachments-$(date -u +%Y%m%dT%H%M%SZ)
sudo tar -C /var/lib/pass-vault-v2 -xzf "$ATTACHMENTS_BACKUP"
sudo chown -R pass-vault:pass-vault /var/lib/pass-vault-v2/attachments
sudo chmod 0700 /var/lib/pass-vault-v2/attachments
sudo systemctl start pass-vault-v2
curl -fsS http://127.0.0.1:3000/api/health
```

Then verify HTTPS, sign-in, and sample items. Retain the failed-state copy until validation succeeds.

## 12. Security hardening

- Apply automatic security updates and promptly upgrade Node, the proxy, the OS, and project releases.
- Disable SSH password/root login, use keys and least-privilege sudo, and restrict management sources.
- Keep code root-owned and service-read-only; data writable only by the service; `/etc/pass-vault-v2/pass-vault-v2.env` root:`pass-vault` mode 0600, and database/backups 0600.
- Expose only 80/443 and restricted SSH; enforce HTTPS/HSTS and monitor certificates, disk, service health, and backups.
- Size disk for SQLite, encrypted attachments, temporary uploads, one local backup, and upgrade headroom; monitor bytes and inodes, with suggested alerts at 70%/85%.
- Never expose Node publicly, run it as root, disable Secure cookies, or log/share passwords, vault keys, plaintext, full ciphertext, or cookies.
- Review `systemd-analyze security pass-vault-v2` and tighten the sandbox where compatible.

## 13. Troubleshooting

| Symptom | Check |
|---|---|
| Service fails to start | `journalctl -u pass-vault-v2 -n 200`; Node path/version, WorkingDirectory, `/etc/pass-vault-v2/pass-vault-v2.env` |
| Registration returns 503 | Missing/invalid `INVITE_CODE`, wrong env path, or restart not applied; inspect only name and permissions, never the value |
| Correct value returns 403/429 | Check hidden whitespace/newline and length; wait for the rate-limit window and retry with a disposable account |
| `SQLITE_CANTOPEN`/readonly | `DB_PATH`, parent ownership, service user, `ReadWritePaths`, disk space |
| 502 | local health endpoint, service state, proxy upstream, port conflict |
| Session disappears | HTTPS, system clock, forwarded `Host`/`X-Forwarded-Proto`, Secure cookie |
| 403/CSRF | same-origin URL, forwarded host/protocol, cookie; do not mix IP and domain |
| 404/stale UI | active symlink, built `dist/`, proxy cache, WorkingDirectory |
| HTTPS failure | A/AAAA, firewall/security group, proxy logs, certificate renewal |
| Locks/disk errors | disk/inodes, permissions, duplicate processes; do not place SQLite on a network filesystem |
| Backup check is not `ok` | Do not overwrite production; use another verified backup and retain the damaged copy |

```bash
sudo systemctl status pass-vault-v2 --no-pager
sudo journalctl -u pass-vault-v2 --since '30 minutes ago' --no-pager
sudo ss -ltnp
sudo -u pass-vault test -w /var/lib/pass-vault-v2 && echo writable
sudo sqlite3 /var/lib/pass-vault-v2/pass-vault.sqlite 'PRAGMA quick_check;'
```

Redact logs before sharing them. Never operate on unrelated production services or databases.
