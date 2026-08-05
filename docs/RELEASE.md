# Release packages and publication

[中文说明](#中文) · [English](#english)

## 中文

### 发布物

`npm run package:release -- --tag v<VERSION>` 生成两个相互隔离的源码制品：

- `pass-vault-v2-cloudflare-<VERSION>`：共享浏览器前端、Worker 后端和 D1 migrations；
- `pass-vault-v2-linux-<VERSION>`：共享浏览器前端、Node 后端和由运维者配置的 SQLite/附件持久路径。

每个版本提供 `.tar.gz`、`.zip` 和统一 `SHA256SUMS`。压缩包不包含依赖、运行数据、部署证据、秘密、生产路由或真实资源配置。

### 文档边界

- Cloudflare 制品只包含 Cloudflare 中英文部署指南；
- Linux 制品只包含 Linux 中英文部署指南；
- README、License、Security、API、Architecture 与 Release 文档可进入两种制品；
- 旧综合部署导航页只留在仓库，不进入制品。

### 正式发布流程

1. 在干净工作树完成：
   ```bash
   npm ci
   npm test
   npm run lint
   npm run lint:docs
   npm run typecheck
   npm run build
   git diff --check
   ```
2. 独立审查最终 diff，处理所有 blocker；审查后改动必须重跑受影响门禁。
3. 提交并推送默认分支，创建**新的 annotated tag**；不移动公开 tag。
4. 从该 tag 构建两个运行时的四个 archive 和 `SHA256SUMS`。
5. 解包检查 variant 必需/禁止文件，并扫描真实域名、资源 ID、邀请码、KEK、token、数据库和生产数据。
6. 发布中英文等价 Release notes：功能、架构、边界变化、升级步骤、测试证据、制品和校验方式。
7. 上传后通过无认证公开 URL 重新下载全部制品和 checksum，执行 `sha256sum -c SHA256SUMS`。
8. 生产发布另需备份、双端部署、浏览器烟测和临时数据清理；“GitHub 已发布”与“生产已验证”必须分开陈述。

### 生产闭环

- Cloudflare：同点备份 D1/R2，应用完整待处理 migration，保留 vars/secrets/bindings/routes/Cron，部署后验证固定 URL 缓存已更新；
- Linux：一致性备份 SQLite 和附件，使用独立版本目录与原子 `current` 软链，健康失败自动回滚；
- 两端：Chromium + WebKit、桌面 + 320px、认证/锁库/会话边界、核心增删改查和附件生命周期；
- 清理随机测试账户、记录和对象，确认数据库完整性及零残留。

## English

### Artifacts

`npm run package:release -- --tag v<VERSION>` produces two isolated source distributions:

- `pass-vault-v2-cloudflare-<VERSION>`: shared browser frontend, Worker backend, and D1 migrations;
- `pass-vault-v2-linux-<VERSION>`: shared browser frontend, Node backend, and operator-configured persistent SQLite/attachment paths.

Each release provides `.tar.gz`, `.zip`, and a common `SHA256SUMS`. Archives exclude dependencies, runtime data, deployment evidence, secrets, production routes, and real resource configuration.

### Documentation boundary

- Cloudflare archives contain only the Cloudflare deployment guides in both languages;
- Linux archives contain only the Linux deployment guides in both languages;
- shared README, License, Security, API, Architecture, and Release documents may appear in both;
- legacy combined deployment navigation pages remain repository-only.

### Publication flow

1. Run the complete gate on a clean tree:
   ```bash
   npm ci
   npm test
   npm run lint
   npm run lint:docs
   npm run typecheck
   npm run build
   git diff --check
   ```
2. Independently review the final diff and resolve every blocker; rerun affected gates after review changes.
3. Commit and push the default branch, then create a **new annotated tag**. Never move a public tag.
4. Build four archives and `SHA256SUMS` from that tag.
5. Extract and inspect required/forbidden variant files, and scan for real domains, resource IDs, invitation codes, KEKs, tokens, databases, and production data.
6. Publish equivalent bilingual Release notes covering features, architecture, boundary changes, upgrades, test evidence, artifacts, and checksum verification.
7. Download every artifact and checksum again from unauthenticated public URLs, then run `sha256sum -c SHA256SUMS`.
8. Production publication separately requires backups, dual-target deployment, browser smoke tests, and test-data cleanup. Distinguish “published on GitHub” from “verified in production.”

### Production closure

- Cloudflare: point-in-time D1/R2 backup, full pending migration chain, preservation of vars/secrets/bindings/routes/Cron, and fixed-URL cache verification;
- Linux: consistent SQLite/attachment backup, immutable version directory, atomic `current` symlink, and automatic rollback on failed health checks;
- both targets: Chromium + WebKit, desktop + 320px, authentication/lock/session boundaries, core CRUD, and attachment lifecycle;
- remove random smoke accounts, records, and objects; confirm database integrity and no residue.
