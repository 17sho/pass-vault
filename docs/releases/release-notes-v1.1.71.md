# v1.1.71 — 批量操作与会话边界热修 / Bulk actions and session-boundary hardening

[中文](#中文) · [English](#english)

## 中文

本 Release 说明对应仓库 tag `v1.1.71` 的稳定代码与双端制品。文档、依赖安全修复和仓库元数据的后续更新位于 `main`；不要把未打 tag 的 `main` 当作 `v1.1.71` 制品来源。

### 新功能

- 账号、网站、笔记、TOTP 与附件均支持在当前类型、分组、搜索结果和附件分类范围内批量设置分组。
- 同一选择范围内支持批量置顶、取消置顶和移入回收站；删除是加密软删除，不提前物理删除记录或附件对象。
- 同批删除使用统一 `deletedAt`。批量删除笔记时，仅联动软删除未被其他存活笔记共享的附件。

### 一致性与安全修复

- 后端没有跨记录事务，客户端采用顺序写入、逆序补偿；补偿失败后重新加载权威密文，重载也失败时明确要求锁定并重新登录。
- 批量设置分组、置顶、取消置顶、删除及其补偿，全部显式绑定操作开始时捕获的 vault key 与会话代际。
- 加密前和真正发送请求前都会重新验证原会话；等待期间锁库并登录另一个账户时，旧密码库密文不会借用新会话继续写入。
- 置顶、分组和回收站状态继续保存在客户端加密 payload/附件 metadata 中，不增加服务端明文字段。

### 架构说明

- Cloudflare 与 Linux 使用同一套 `public/` 前端源码和 `shared/` 密文契约，但分别打包、分别部署。
- Cloudflare 使用 Worker + D1 + R2；Linux 使用 Node.js + SQLite + 本地附件目录。
- 两端不共用在线前端实例、账户、会话、数据库或附件，也不会自动同步数据。

### 验证

- 完整项目测试：`331/331` 通过（文档与制品更新后的最终全量门禁）。
- 当前安全热修专项：批量分组与批量置顶/删除 `13/13` 通过，覆盖 Chromium、WebKit、320px、失败补偿，以及锁库后登录第二账户再释放旧写入。
- Lint、文档检查、TypeScript、Build、制品边界测试和 `git diff --check` 通过。
- Cloudflare/Linux 两个制品均提供 tar.gz、zip 与统一 `SHA256SUMS`；发布后无认证重新下载校验 `4/4 OK`。
- 发布时 Linux/Cloudflare 双端已部署并核对会话边界热修代码；生产测试数据已清理。

### 升级建议

- `v1.1.69` 和 `v1.1.70` 缺少完整的批量操作会话边界修复，建议直接升级到 `v1.1.71`。
- Cloudflare 升级前备份 D1/R2、保留完整 bindings/routes/vars/secrets/Cron，并确认 migration 链到 `0013`。
- Linux 升级前一致性备份 SQLite 与附件目录，使用原子版本目录发布。
- 不移动旧 tag，不用新制品覆盖旧版本；生产配置和秘密不进入仓库或压缩包。

### 下载与校验

```bash
VERSION=1.1.71
curl -fLO "https://github.com/17sho/pass-vault-v2/releases/download/v$VERSION/SHA256SUMS"
# 下载与部署目标匹配的 tar.gz 或 zip 后：
sha256sum -c SHA256SUMS
```

如果这个项目对你有帮助，欢迎点一个 Star ⭐️；问题和改进建议也欢迎通过 Issues 提交。安全漏洞请通过 [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault-v2/security/advisories/new) 私下报告，不要公开披露。

## English

This release note describes the stable code and dual-runtime artifacts for tag `v1.1.71`. Later documentation, dependency-security, and repository-metadata updates are on `main`; do not treat an untagged `main` commit as the `v1.1.71` artifact source.

### Features

- Accounts, websites, notes, TOTP, and attachments support bulk grouping within the current type, group, search-result, and attachment-category scope.
- The same selection scope supports bulk pin, unpin, and move-to-Trash. Deletion is encrypted soft deletion and does not prematurely remove records or attachment objects.
- One deletion batch uses one `deletedAt`. Deleting notes in bulk only soft-deletes attachments that are not shared by another live note.

### Consistency and security fixes

- Because the backends do not provide a transaction spanning records, the client writes sequentially and compensates in reverse order. If compensation fails, it reloads authoritative ciphertext; if reload also fails, it explicitly requires lock and reauthentication.
- Bulk grouping, pinning, unpinning, deletion, and all compensation writes are explicitly bound to the vault key and session generation captured when the operation starts.
- The originating session is checked before encryption and immediately before the request. If the vault is locked and another account signs in while an operation is waiting, old-vault ciphertext cannot continue through the new session.
- Pin, group, and Trash state remain inside client-encrypted record payloads or attachment metadata; no new server-visible business fields are added.

### Architecture clarification

- Cloudflare and Linux use the same `public/` frontend source and `shared/` ciphertext contract, but they are packaged and deployed separately.
- Cloudflare uses Worker + D1 + R2; Linux uses Node.js + SQLite + a local attachment directory.
- They do not share a hosted frontend instance, accounts, sessions, databases, or attachments, and production data does not synchronize automatically.

### Verification

- Full project gate: `331/331` tests passed after the documentation and artifact update.
- Current security-hotfix suites: `13/13` bulk-group and bulk pin/delete tests passed, covering Chromium, WebKit, 320px, failed-write compensation, and lock → second-account sign-in → stale-write release races.
- Lint, documentation checks, TypeScript, build, artifact-boundary tests, and `git diff --check` passed.
- Separate Cloudflare/Linux tar.gz and zip artifacts are published with one `SHA256SUMS`; unauthenticated post-publication downloads verified `4/4 OK`.
- At publication time, both production targets were deployed and checked for the session-boundary fix, and production smoke data was removed.

### Upgrade guidance

- `v1.1.69` and `v1.1.70` do not contain the complete bulk-operation session-boundary fix. Upgrade directly to `v1.1.71`.
- Before Cloudflare upgrades, back up D1/R2, preserve all bindings/routes/vars/secrets/Cron, and confirm migrations through `0013`.
- Before Linux upgrades, take a consistent SQLite and attachment backup and use an atomic version-directory deployment.
- Never move old tags or overwrite old-version artifacts; production configuration and secrets must remain outside the repository and archives.

### Download and verify

```bash
VERSION=1.1.71
curl -fLO "https://github.com/17sho/pass-vault-v2/releases/download/v$VERSION/SHA256SUMS"
# After downloading the tar.gz or zip for your target:
sha256sum -c SHA256SUMS
```

If this project is useful, a Star ⭐️ is appreciated. Issues and improvements are welcome; report vulnerabilities through [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault-v2/security/advisories/new), not public disclosure.
