# Linux 服务器部署指南（Node.js + SQLite）

[中文](server-deployment.zh-CN.md) · [English](server-deployment.en.md) · [返回首页](../README.md)

本指南仅适用于 Linux VPS/独立服务器。请先把 `<...>` 替换成实际值；不要把域名、数据库、备份或秘密提交到仓库。

> **与 Cloudflare 版不同：** Linux 版不使用 R2，不应用 Cloudflare 版的 8 GiB / 800,000 Class A / 8,000,000 Class B 月度防扣费配额，也不会返回 R2 `quota_exceeded`。总容量由服务器磁盘、反向代理和管理员运维策略决定。两种部署目标可以采用不同的资源策略，数据也不会自动同步。

## 1. 要求与架构

- Ubuntu 22.04+/Debian 12+（其他 systemd 发行版可自行适配）、root/sudo 权限。
- Node.js **22+**、npm、`sqlite3`、`curl`、`tar`；源码安装另需 Git。
- 指向服务器的域名、开放的 80/443、Caddy 或 Nginx、异地备份位置。
- 建议最低 1 vCPU、512 MiB RAM、充足且受监控的持久磁盘。

```text
浏览器 ──HTTPS──> Caddy/Nginx :443 ──HTTP──> 127.0.0.1:3000
                                                   │
                                      Node.js + 静态 dist/
                                                   │
                         SQLite + attachments/（均为持久密文）
```

Node 只监听回环地址；systemd 以专用用户运行。SQLite 及 WAL/SHM 位于持久数据目录，代码位于只读的版本目录。

## 2. 专用用户与目录

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl sqlite3 tar
node --version   # 必须 >= 22
npm --version

sudo useradd --system --home /var/lib/pass-vault-v2 --shell /usr/sbin/nologin pass-vault 2>/dev/null || true
sudo install -d -o root -g pass-vault -m 0750 /opt/pass-vault-v2/releases
sudo install -d -o pass-vault -g pass-vault -m 0750 /var/lib/pass-vault-v2
sudo install -d -o pass-vault -g pass-vault -m 0700 /var/lib/pass-vault-v2/attachments
sudo install -d -o root -g pass-vault -m 0750 /etc/pass-vault-v2
sudo install -d -o root -g root -m 0700 /var/backups/pass-vault-v2
```

以下用 `/opt/pass-vault-v2/current` 指向当前版本。不要把数据库放进代码目录。

## 3. 安装（任选一种）

### 3.1 下载 GitHub Release（推荐）

在 Release 页面选择 `pass-vault-v2-linux-<VERSION>.tar.gz`，同时下载 `SHA256SUMS`：

```bash
cd /tmp
curl -fLO https://github.com/17sho/pass-vault-v2/releases/download/v<VERSION>/pass-vault-v2-linux-<VERSION>.tar.gz
curl -fLO https://github.com/17sho/pass-vault-v2/releases/download/v<VERSION>/SHA256SUMS
grep 'pass-vault-v2-linux-<VERSION>.tar.gz' SHA256SUMS | sha256sum -c -
sudo tar -xzf pass-vault-v2-linux-<VERSION>.tar.gz -C /opt/pass-vault-v2/releases
```

### 3.2 从源码安装

```bash
sudo apt-get install -y git
cd /tmp
git clone --depth 1 --branch v<VERSION> https://github.com/17sho/pass-vault-v2.git pass-vault-src
cd pass-vault-src
git rev-parse HEAD
sudo install -d -o root -g pass-vault -m 0750 /opt/pass-vault-v2/releases/pass-vault-v2-linux-<VERSION>
sudo cp -a package.json package-lock.json LICENSE README.md README.en.md SECURITY.md public shared scripts apps/server deploy docs /opt/pass-vault-v2/releases/pass-vault-v2-linux-<VERSION>/
```

两种方式都继续：

```bash
cd /opt/pass-vault-v2/releases/pass-vault-v2-linux-<VERSION>
sudo npm ci
sudo npm test
sudo npm run lint && sudo npm run typecheck && sudo npm run build
sudo chown -R root:pass-vault .
sudo chmod -R go-w .
sudo ln -sfn /opt/pass-vault-v2/releases/pass-vault-v2-linux-<VERSION> /opt/pass-vault-v2/current
```

## 4. 配置变量

服务器读取以下环境变量：

| 变量 | 生产值 | 说明 |
|---|---|---|
| `NODE_ENV` | `production` | 运行环境标识 |
| `HOST` | `127.0.0.1` | 禁止直接监听公网 |
| `PORT` | `3000` | 本机反代端口，可修改 |
| `DB_PATH` | `/var/lib/pass-vault-v2/pass-vault.sqlite` | 持久 SQLite 绝对路径 |
| `ATTACHMENTS_DIR` | `/var/lib/pass-vault-v2/attachments` | 附件密文对象目录；必须是持久本地磁盘 |
| `COOKIE_SECURE` | 不设置 | 默认启用 Secure Cookie；生产绝不能设为 `false` |
| `INVITE_CODE` | 必填 | 共享注册邀请码（16–256 字符）；保存在 root:`pass-vault`、`0600` 的环境文件中，绝不记录日志 |

创建 `/etc/pass-vault-v2/pass-vault-v2.env`。为避免邀请码出现在 shell 历史或进程参数中，使用 root-only 临时文件接收 `openssl` 标准输出并原子安装：

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

预期只显示 `root:pass-vault 600` 和变量名确认，**不要**运行 `cat`、非静默 `grep INVITE_CODE` 或把值发到日志。systemd `EnvironmentFile` 不是 shell：推荐使用生成器得到的十六进制值。若必须使用人工值，请限制为不含空白、引号、反斜杠、`#`、`$`、`%`、控制字符或换行的可打印 ASCII；长度 16–256。不要依赖 shell 引号/展开来“转义”复杂值。

## 5. systemd

创建 `/etc/systemd/system/pass-vault-v2.service`：

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

确认 `command -v node`；若不是 `/usr/bin/node`，把 `ExecStart` 改成真实绝对路径。

```bash
sudo systemd-analyze verify /etc/systemd/system/pass-vault-v2.service
sudo systemctl daemon-reload
sudo systemctl enable --now pass-vault-v2
sudo systemctl status pass-vault-v2 --no-pager
curl -fsS http://127.0.0.1:3000/api/health
```

预期健康响应含 `{"ok":true,"backend":"sqlite"}`。

## 6. 反向代理与 HTTPS

DNS 的 A/AAAA 记录须先指向服务器。二选一，不要同时占用 80/443。

### 6.1 Caddy

按官方仓库安装 Caddy，然后写入 `/etc/caddy/Caddyfile`：

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

轮换仅影响**之后的新注册**，不会注销既有用户、修改主密码或重新加密已有库。先用密码管理器保存当前值（用于有审批的紧急回退），再按第 4 节在 root-only 临时文件中生成新值、原子替换 env 文件，然后执行 `sudo systemctl restart pass-vault-v2`，检查服务状态和 HTTPS health。仅核对文件 owner/mode 和 `INVITE_CODE` 名称，再用可清理账户完成注册/登录。

若异常，检查值长度、文件路径和 systemd 单元实际加载的 `EnvironmentFile`；需要回退时通过同样的 mode `0600` 原子安装流程恢复密码管理器中的前值并重启。疑似泄露的旧值不得回退，应生成另一个强随机值。

## 9. 升级与回滚

1. 记录当前目标：`readlink -f /opt/pass-vault-v2/current`。
2. 按第 10 节做 SQLite + 附件一致性备份并通过完整性检查；确认新版本磁盘空间足够。
3. 按第 3 节把新版本安装到新的版本目录，先完成测试/build。
4. 原子切换软链接并重启：

```bash
sudo ln -sfn /opt/pass-vault-v2/releases/pass-vault-v2-linux-<NEW_VERSION> /opt/pass-vault-v2/current
sudo systemctl restart pass-vault-v2
sudo journalctl -u pass-vault-v2 -n 100 --no-pager
curl -fsS https://<APP_DOMAIN>/api/health
```

代码回滚：

```bash
sudo ln -sfn /opt/pass-vault-v2/releases/pass-vault-v2-linux-<KNOWN_GOOD_VERSION> /opt/pass-vault-v2/current
sudo systemctl restart pass-vault-v2
```

代码回滚不会回滚数据库。仅在 schema/data 不兼容且确认需要时，按恢复流程停机恢复升级前备份。

## 10. SQLite 与附件一致性备份

附件行与磁盘对象必须来自同一时间点。最简单可靠的方法是短暂停写（停止服务），再复制附件目录并用 SQLite `.backup`；不要在线 `cp` WAL 数据库，也不要只备份其中一项。

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

结果必须为 `ok`。将备份加密后复制到独立/异地存储，设置保留策略并定期演练恢复。备份包含认证材料和密文，仍是敏感资产。

## 11. 恢复

先验证备份完整性，再进入维护窗口：

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

随后执行 HTTPS、登录及抽样条目验证；验证成功前保留故障现场副本。

## 12. 安全加固

- 自动安装安全更新；订阅项目 Release/安全公告，及时升级 Node、代理与系统。
- SSH 禁用密码/root 登录，使用密钥和最小 sudo；限制管理端来源。
- 代码 root 所有且服务不可写；数据目录仅服务用户可读写；`/etc/pass-vault-v2/pass-vault-v2.env` 为 root:`pass-vault` 且 0600，数据库/备份 0600。
- 只开放 80/443 与受限 SSH；启用 HTTPS/HSTS，监控证书续期、磁盘空间、服务和备份。
- 容量规划至少覆盖 SQLite、附件密文、临时上传、一次本机备份和升级余量；监控容量与 inode，建议在 70%/85% 告警。
- 不把 Node 暴露公网，不以 root 运行，不关闭 Secure Cookie，不记录/发送密码、vault key、条目明文、完整密文、Cookie。
- 定期查看 `systemd-analyze security pass-vault-v2`，按发行版兼容性继续收紧沙箱。

## 13. 故障排查

| 症状 | 检查 |
|---|---|
| 服务启动失败 | `journalctl -u pass-vault-v2 -n 200`；Node 版本/路径、WorkingDirectory、`/etc/pass-vault-v2/pass-vault-v2.env` |
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
sudo systemctl status pass-vault-v2 --no-pager
sudo journalctl -u pass-vault-v2 --since '30 minutes ago' --no-pager
sudo ss -ltnp
sudo -u pass-vault test -w /var/lib/pass-vault-v2 && echo writable
sudo sqlite3 /var/lib/pass-vault-v2/pass-vault.sqlite 'PRAGMA quick_check;'
```

分享日志前先脱敏。绝不操作其他生产服务或数据库。
