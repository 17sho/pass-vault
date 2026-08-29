# Linux 服务器部署指南（Node.js + SQLite）

[中文](server-deployment.zh-CN.md) · [English](server-deployment.en.md) · [返回首页](../README.md)

本指南仅适用于 Linux VPS/独立服务器。请先把 `<...>` 替换成实际值；不要把域名、数据库、备份或秘密提交到仓库。

> **与 Cloudflare 版不同：** Linux 版不使用 R2，不应用 Cloudflare 版的 8 GiB / 800,000 Class A / 8,000,000 Class B 月度防扣费配额，也不会返回 R2 `quota_exceeded`。总容量由服务器磁盘、反向代理和管理员运维策略决定。两种部署目标可以采用不同的资源策略，数据也不会自动同步。

## 1. 要求与架构

- Ubuntu 22.04+/Debian 12+（其他 systemd 发行版可自行适配）、root/sudo 权限。
- Node.js **22+**、npm、`sqlite3`、`curl`、`git`、`jq`、`openssl`、`tar`和`ufw`。
- 指向服务器的域名、开放的 80/443、Caddy 或 Nginx、异地备份位置。
- 建议最低 1 vCPU、512 MiB RAM、充足且受监控的持久磁盘。

```text
浏览器 ──HTTPS──> Caddy/Nginx :443 ──HTTP──> 127.0.0.1:3000
                                                   │
                                      Node.js + 静态 dist/
                                                   │
                         SQLite + attachments/（均为持久密文）
```

Node 只监听回环地址；systemd 以专用用户运行。SQLite 及 WAL/SHM 位于持久数据目录，代码位于只读的版本目录。仓库内`deploy/pass-vault.service`是带占位符的模板；安装时必须替换`@APP_USER@`、`@APP_DIR@`和`@DATA_DIR@`，并按实际代理设置`CLIENT_IP_HEADER`，不能原样复制启动。

## 2. 专用用户与目录

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git jq openssl sqlite3 tar ufw
node --version   # 必须 >= 22
npm --version

sudo useradd --system --home /var/lib/pass-vault --shell /usr/sbin/nologin pass-vault 2>/dev/null || true
sudo install -d -o root -g pass-vault -m 0750 /opt/pass-vault/releases
sudo install -d -o pass-vault -g pass-vault -m 0750 /var/lib/pass-vault
sudo install -d -o pass-vault -g pass-vault -m 0700 /var/lib/pass-vault/attachments
sudo install -d -o root -g pass-vault -m 0750 /etc/pass-vault
sudo install -d -o root -g root -m 0700 /var/backups/pass-vault
```

以下用 `/opt/pass-vault/current` 指向当前版本。不要把数据库放进代码目录。

## 3. 获取代码与安装

### 3.1 当前发布状态

Linux 当前正式版为独立的 [GitHub `v2.2.3-server` Release](https://github.com/17sho/pass-vault/releases/tag/v2.2.3-server)，提供 Linux tar.gz、zip 和 `SHA256SUMS`。请勿使用 Cloudflare 归档部署 Linux。

Linux 新部署或升级优先下载并校验 `v2.2.3-server` 中的 Linux 制品；如需从源码构建，请检出服务器 tag 并记录准确 commit SHA：

```bash
cd /tmp
git clone https://github.com/17sho/pass-vault.git pass-vault-src
cd pass-vault-src
git checkout v2.2.3-server
git rev-parse HEAD
```

当前已发布资产仍使用品牌改名前的历史名称 `pass-vault-v2-linux-2.2.3.tar.gz`、`pass-vault-v2-linux-2.2.3.zip` 和 `SHA256SUMS`。从 Release 页面下载所需归档与校验文件，在同一目录执行 `sha256sum -c SHA256SUMS`，结果必须为 `OK`；后续发行使用 `pass-vault-linux-*`。

### 3.2 从源码构建并原子安装

不要提前创建`/opt/pass-vault/releases/pass-vault-linux-<VERSION>`或向其中复制文件；原子脚本会安全拒绝覆盖同版本目录。先在源码目录完成门禁，再由脚本唯一负责创建只读版本目录、安装锁定的生产依赖、统一目录`0755`/文件`0644`，并用临时软链接加`mv -T`原子切换。服务命令失败，或健康检查默认每秒一次、连续30次仍未通过时，脚本自动恢复旧`current`，并只写时间、版本、布尔结果和回滚状态到root-only JSON证据：

> **首次安装顺序：** 先运行下方`npm`门禁，但在执行`sudo env ... deploy-linux-atomic.sh`前，先完成第4节环境文件，并按第5节写入unit、执行`systemd-analyze verify`和`systemctl daemon-reload`，此时不要`enable --now`。然后回到这里运行原子脚本；脚本切换`current`后会启动服务并做健康检查。成功后执行`sudo systemctl enable pass-vault`。已有服务的升级可直接执行完整代码块。

```bash
npm ci
npm run build
npm test
npm run lint
npm run lint:docs
npm run typecheck
sudo env \
  PV_SOURCE="$PWD" \
  PV_APP_ROOT=/opt/pass-vault \
  PV_VERSION=<VERSION> \
  PV_SERVICE_COMMAND='systemctl restart pass-vault' \
  PV_HEALTH_COMMAND='curl -fsS http://127.0.0.1:3000/api/health | grep -q '"'"'"backend":"sqlite"'"'"'' \
  PV_EVIDENCE=/var/log/pass-vault/deploy-<VERSION>.json \
  bash scripts/deploy-linux-atomic.sh
sudo jq '{at,version,status,health,rolledBack}' /var/log/pass-vault/deploy-<VERSION>.json
```

不要把环境文件、Cookie、邀请码、用户资料、密文或完整响应正文写进部署证据。

## 4. 配置变量

服务器读取以下环境变量：

| 变量 | 生产值 | 说明 |
|---|---|---|
| `NODE_ENV` | `production` | 运行环境标识 |
| `HOST` | `127.0.0.1` | 禁止直接监听公网 |
| `PORT` | `3000` | 本机反代端口，可修改 |
| `DB_PATH` | `/var/lib/pass-vault/pass-vault.sqlite` | 持久 SQLite 绝对路径 |
| `ATTACHMENTS_DIR` | `/var/lib/pass-vault/attachments` | 附件密文对象目录；必须是持久本地磁盘 |
| `COOKIE_SECURE` | 不设置 | 默认启用 Secure Cookie；生产绝不能设为 `false` |
| `CLIENT_IP_HEADER` | 由代理拓扑决定 | Caddy/Nginx直连源站且代理强制覆盖时用`x-forwarded-for`；Cloudflare橙云直达源站并保留其可信头时用`cf-connecting-ip`；错误配置会让限流退化 |
| `INVITE_CODE` | 必填 | 共享注册邀请码（16–256 字符）；保存在 root:`pass-vault`、`0600` 的环境文件中，绝不记录日志 |
| `PASSKEY_UNLOCK_KEK` | 启用辅助解锁时必填 | 32 个随机字节的 Base64URL；仅用于 AES-256-GCM 包装 vault key，绝不提交仓库或记录日志 |
| `PASSKEY_RP_ID` | 启用辅助解锁时必填 | 应用的精确 HTTPS 主机名，例如 `<APP_DOMAIN>` |
| `PASSKEY_ORIGIN` | 启用辅助解锁时必填 | canonical HTTPS Origin，例如 `https://<APP_DOMAIN>`，不得有路径或尾部斜杠 |

创建 `/etc/pass-vault/pass-vault.env`。为避免邀请码出现在 shell 历史或进程参数中，使用 root-only 临时文件接收 `openssl` 标准输出并原子安装：

```bash
umask 077
tmp=$(mktemp)
printf '%s\n' 'NODE_ENV=production' 'HOST=127.0.0.1' 'PORT=3000' \
  'CLIENT_IP_HEADER=x-forwarded-for' \
  'DB_PATH=/var/lib/pass-vault/pass-vault.sqlite' \
  'ATTACHMENTS_DIR=/var/lib/pass-vault/attachments' >"$tmp"
printf 'INVITE_CODE=' >>"$tmp"
openssl rand -hex 32 >>"$tmp"
printf 'PASSKEY_UNLOCK_KEK=' >>"$tmp"
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n' >>"$tmp"
printf '\nPASSKEY_RP_ID=<APP_DOMAIN>\nPASSKEY_ORIGIN=https://<APP_DOMAIN>\n' >>"$tmp"
sudo install -o root -g pass-vault -m 0600 "$tmp" /etc/pass-vault/pass-vault.env
rm -f "$tmp"
sudo stat -c '%U:%G %a %n' /etc/pass-vault/pass-vault.env
sudo grep -q '^INVITE_CODE=' /etc/pass-vault/pass-vault.env && echo 'INVITE_CODE name present'
```

预期只显示 `root:pass-vault 600` 和变量名确认，**不要**运行 `cat`、非静默 `grep INVITE_CODE` 或把值发到日志。systemd `EnvironmentFile` 不是 shell：推荐使用生成器得到的十六进制值。若必须使用人工值，请限制为不含空白、引号、反斜杠、`#`、`$`、`%`、控制字符或换行的可打印 ASCII；长度 16–256。不要依赖 shell 引号/展开来“转义”复杂值。

三项 Passkey 配置必须同时有效，否则服务器辅助解锁安全关闭，主密码和本机 PRF 解锁不受影响。该功能会把 32 字节 vault key 以独立 KEK 的 AES-256-GCM 密文存入服务器，**改变原纯客户端零知识边界**：服务器配合一次通过用户验证的 Passkey 会话可以恢复 vault key。服务器不保存主密码或明文 vault key。修改主密码/用户名会撤销全部服务器辅助 Passkey。直接轮换或丢失 KEK 会使既有辅助凭据不可用；应先由用户撤销并重新注册，而不是盲目替换。

**升级时不得重建整个环境文件而漏掉旧变量。** 在切换代码前，先生成只含变量名称（不含值）的清单，核对`NODE_ENV`、`HOST`、`PORT`、`CLIENT_IP_HEADER`、`DB_PATH`、`ATTACHMENTS_DIR`、`INVITE_CODE`及三项Passkey配置。保留现有`INVITE_CODE`和`PASSKEY_UNLOCK_KEK`原值；除非执行明确的轮换/重新注册流程，不得重新生成。使用临时文件原子替换环境文件前，逐项迁移全部现网变量。

## 5. systemd

创建 `/etc/systemd/system/pass-vault.service`：

```ini
[Unit]
Description=Pass Vault
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pass-vault
Group=pass-vault
WorkingDirectory=/opt/pass-vault/current
EnvironmentFile=/etc/pass-vault/pass-vault.env
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
ReadWritePaths=/var/lib/pass-vault

[Install]
WantedBy=multi-user.target
```

确认 `command -v node`；若不是 `/usr/bin/node`，把 `ExecStart` 改成真实绝对路径。

```bash
sudo systemd-analyze verify /etc/systemd/system/pass-vault.service
sudo systemctl daemon-reload
# 首次安装：回到第3.2节运行原子部署，成功后再启用开机自启
sudo systemctl enable pass-vault
sudo systemctl status pass-vault --no-pager
curl -fsS http://127.0.0.1:3000/api/health
```

`status`和`curl`只应在第3.2节原子部署成功后执行。升级已有安装时，unit已启用，不需要重复本段初始化。

预期健康响应含 `{"ok":true,"backend":"sqlite"}`。

## 6. 反向代理与 HTTPS

DNS 的 A/AAAA 记录须先指向服务器。二选一，不要同时占用 80/443。

### 6.1 Caddy

按官方仓库安装 Caddy，然后写入 `/etc/caddy/Caddyfile`：

```caddyfile
<APP_DOMAIN> {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
  header {
    Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    Referrer-Policy "no-referrer"
    X-Content-Type-Options "nosniff"
  }
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy 自动申请和续期证书。查看 `journalctl -u caddy` 确认证书成功。

### 6.2 Nginx

安装 `nginx` 与发行版 `certbot`/Nginx 插件。先创建 HTTP 站点完成证书签发，再使用：

```nginx
server {
  listen 80;
  server_name <APP_DOMAIN>;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl http2;
  server_name <APP_DOMAIN>;
  ssl_certificate /etc/letsencrypt/live/<APP_DOMAIN>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/<APP_DOMAIN>/privkey.pem;
  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
  add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
  add_header Referrer-Policy "no-referrer" always;
  add_header X-Content-Type-Options "nosniff" always;
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

## 7. 防火墙

先放行 SSH，避免把自己锁在门外；端口按实际 SSH 配置调整：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

不要放行 3000。还应检查云厂商安全组只允许 SSH（受限来源更佳）、80、443。

## 8. 首次登录与验收

```bash
curl -fsS https://<APP_DOMAIN>/api/health
curl -fsSI https://<APP_DOMAIN>/
sudo ss -ltnp | grep -E ':(80|443|3000)\b'
```

用全新测试账户完成：使用正确邀请码注册（密码至少 12 字符）→ 登录/解锁 → 新建一条无敏感信息的测试条目 → 刷新后读取 → 编辑/删除 → 导出加密备份 → 退出并确认会话失效。再用明显错误的占位值确认注册被拒绝且未创建账户。缺失/无效配置应返回 503 `registration_unavailable`，错误值返回 403 `invalid_invite`（连续失败可能 429），但既有用户仍应能登录。确认浏览器 Cookie 为 `Secure`、`HttpOnly`、`SameSite=Strict`，HTTP 会跳转 HTTPS，3000 不可从公网访问。不要输出真实邀请码，也不要用真实密码或条目测试。

### 8.1 轮换与回退

轮换仅影响**之后的新注册**，不会注销既有用户、修改主密码或重新加密已有库。先用密码管理器保存当前值（用于有审批的紧急回退），再按第 4 节在 root-only 临时文件中生成新值、原子替换 env 文件，然后执行 `sudo systemctl restart pass-vault`，检查服务状态和 HTTPS health。仅核对文件 owner/mode 和 `INVITE_CODE` 名称，再用可清理账户完成注册/登录。

若异常，检查值长度、文件路径和 systemd 单元实际加载的 `EnvironmentFile`；需要回退时通过同样的 mode `0600` 原子安装流程恢复密码管理器中的前值并重启。疑似泄露的旧值不得回退，应生成另一个强随机值。

## 9. 升级与回滚

### 升级到当前 `v2.2.3-server`

从旧版本升级前，先做SQLite与附件目录的一致性备份，记录当前`current`目标及环境变量名称清单。首次启用辅助Passkey才生成独立`PASSKEY_UNLOCK_KEK`并配置精确`PASSKEY_RP_ID`/`PASSKEY_ORIGIN`；已经启用时必须保留原KEK和两个域变量。安装到新的不可变版本目录并原子切换。服务启动会幂等创建缺失的辅助Passkey、会话元数据和认证方式表；无需重加密现有密文或vault key。

切换版本并重启后，确认日志无迁移错误、公开资源与构建版本一致、环境变量名称无非预期减少。若辅助Passkey原本已启用，必须用已有凭据在真实设备完成一次免主密码解锁；若首次启用，则完成注册、锁定、解锁、撤销和重新注册测试。再确认安全中心显示正确认证方式且当前会话有效。

1. 记录当前目标：`readlink -f /opt/pass-vault/current`。
2. 按第 10 节做 SQLite + 附件一致性备份并通过完整性检查；确认新版本磁盘空间足够。
3. 按第 3 节把新版本安装到新的版本目录，先完成测试/build。
4. 使用 `scripts/deploy-linux-atomic.sh` 切换；该脚本会重启并检查健康，失败时自动恢复旧 `current`。成功后检查证据并验证公开缓存：

```bash
sudo jq '{at,version,status,health,rolledBack}' /var/log/pass-vault/deploy-<NEW_VERSION>.json
curl -fsS https://<APP_DOMAIN>/api/health
node scripts/verify-production-cache.mjs https://<APP_DOMAIN> <NEW_VERSION> /tmp/cache-evidence.json
jq '{at,version,backend,sourceVersion,revalidated,fixedVersion,status}' /tmp/cache-evidence.json
```

如需人工代码回滚，使用同一原子机制切回已知良好版本目录后重启；不要使用会留下短暂断链窗口的两步删除/创建链接：

```bash
sudo ln -s /opt/pass-vault/releases/pass-vault-linux-<KNOWN_GOOD_VERSION> /opt/pass-vault/current.rollback
sudo mv -Tf /opt/pass-vault/current.rollback /opt/pass-vault/current
sudo systemctl restart pass-vault
```

代码回滚不会回滚数据库。仅在 schema/data 不兼容且确认需要时，按恢复流程停机恢复升级前备份。

## 10. SQLite 与附件一致性备份

附件行与磁盘对象必须来自同一时间点。最简单可靠的方法是短暂停写（停止服务），再复制附件目录并用 SQLite `.backup`；不要在线 `cp` WAL 数据库，也不要只备份其中一项。

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
sudo systemctl stop pass-vault
sudo -u pass-vault sqlite3 /var/lib/pass-vault/pass-vault.sqlite \
  ".backup '/var/lib/pass-vault/backup-$STAMP.sqlite'"
sudo tar -C /var/lib/pass-vault -czf /var/backups/pass-vault/attachments-$STAMP.tar.gz attachments
sudo mv /var/lib/pass-vault/backup-$STAMP.sqlite /var/backups/pass-vault/
sudo chmod 0600 /var/backups/pass-vault/{backup-$STAMP.sqlite,attachments-$STAMP.tar.gz}
sudo systemctl start pass-vault
sudo sqlite3 /var/backups/pass-vault/backup-$STAMP.sqlite 'PRAGMA integrity_check;'
sudo tar -tzf /var/backups/pass-vault/attachments-$STAMP.tar.gz >/dev/null
```

结果必须为 `ok`。将备份加密后复制到独立/异地存储，设置保留策略并定期演练恢复。备份包含认证材料和密文，仍是敏感资产。

## 11. 恢复

先验证备份完整性，再进入维护窗口：

```bash
BACKUP=/var/backups/pass-vault/<BACKUP_FILE>.sqlite
ATTACHMENTS_BACKUP=/var/backups/pass-vault/<ATTACHMENTS_BACKUP>.tar.gz
sudo sqlite3 "$BACKUP" 'PRAGMA integrity_check;'
sudo tar -tzf "$ATTACHMENTS_BACKUP" >/dev/null
sudo systemctl stop pass-vault
sudo cp -a /var/lib/pass-vault/pass-vault.sqlite /var/backups/pass-vault/failed-$(date -u +%Y%m%dT%H%M%SZ).sqlite
sudo rm -f /var/lib/pass-vault/pass-vault.sqlite-wal /var/lib/pass-vault/pass-vault.sqlite-shm
sudo install -o pass-vault -g pass-vault -m 0600 "$BACKUP" /var/lib/pass-vault/pass-vault.sqlite
sudo mv /var/lib/pass-vault/attachments /var/backups/pass-vault/failed-attachments-$(date -u +%Y%m%dT%H%M%SZ)
sudo tar -C /var/lib/pass-vault -xzf "$ATTACHMENTS_BACKUP"
sudo chown -R pass-vault:pass-vault /var/lib/pass-vault/attachments
sudo chmod 0700 /var/lib/pass-vault/attachments
sudo systemctl start pass-vault
curl -fsS http://127.0.0.1:3000/api/health
```

随后执行 HTTPS、登录及抽样条目验证；验证成功前保留故障现场副本。

## 12. 安全加固

- 自动安装安全更新；订阅项目 Release/安全公告，及时升级 Node、代理与系统。
- SSH 禁用密码/root 登录，使用密钥和最小 sudo；限制管理端来源。
- 代码 root 所有且服务不可写；数据目录仅服务用户可读写；`/etc/pass-vault/pass-vault.env` 为 root:`pass-vault` 且 0600，数据库/备份 0600。
- 只开放 80/443 与受限 SSH；启用 HTTPS/HSTS，监控证书续期、磁盘空间、服务和备份。
- 容量规划至少覆盖 SQLite、附件密文、临时上传、一次本机备份和升级余量；监控容量与 inode，建议在 70%/85% 告警。
- 不把 Node 暴露公网，不以 root 运行，不关闭 Secure Cookie，不记录/发送密码、vault key、条目明文、完整密文、Cookie。
- 定期查看 `systemd-analyze security pass-vault`，按发行版兼容性继续收紧沙箱。

## 13. 故障排查

| 症状 | 检查 |
|---|---|
| 服务启动失败 | `journalctl -u pass-vault -n 200`；Node 版本/路径、WorkingDirectory、`/etc/pass-vault/pass-vault.env` |
| 注册返回 503 | env 文件缺少/无效 `INVITE_CODE`、路径错误或重启未生效；只核对名称与权限，不打印值 |
| 正确值返回 403/429 | 检查不可见空白/换行与长度，等待限速窗口后用可清理账户重试 |
| `SQLITE_CANTOPEN`/只读 | `DB_PATH`、父目录权限、服务用户、`ReadWritePaths`、磁盘空间 |
| 502 | `curl 127.0.0.1:3000/api/health`、服务状态、代理 upstream、端口占用 |
| 登录后立即退出 | 必须使用 HTTPS；系统时钟；代理保留 `Host`/`X-Forwarded-Proto`；Secure Cookie |
| 403/CSRF | 同源 URL、代理主机/协议头、浏览器 Cookie；不要混用 IP 与域名 |
| 页面 404/旧版本 | 当前软链接、`dist/` 是否 build、代理缓存、服务 WorkingDirectory |
| HTTPS 失败 | DNS A/AAAA、80/443 防火墙、安全组、代理日志、证书续期 |
| 数据库锁/磁盘错误 | 磁盘/inode、目录权限、是否有多个实例同时打开同一文件；不要放网络文件系统 |
| 备份非 `ok` | 不要覆盖现库；换已验证备份，保留损坏副本供分析 |

```bash
sudo systemctl status pass-vault --no-pager
sudo journalctl -u pass-vault --since '30 minutes ago' --no-pager
sudo ss -ltnp
sudo -u pass-vault test -w /var/lib/pass-vault && echo writable
sudo sqlite3 /var/lib/pass-vault/pass-vault.sqlite 'PRAGMA quick_check;'
```

分享日志前先脱敏。绝不操作其他生产服务或数据库。
