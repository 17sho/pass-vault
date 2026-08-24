# PassVault v2.2.2

## 中文

v2.2.2 汇总发布今天完成的 Cloudflare 版本代码优化与回归加固，不改变数据格式、D1/R2 schema、API 协议或加密协议。

### 主要变化

- 将核心 Worker 的运行时、HTTP 与安全请求辅助逻辑拆分为清晰模块，同时保持单一 Worker 部署目标。
- 将 Admin Worker 的 Access 认证、运行时与 UI 边界模块化。
- 从主前端提取低耦合模块：历史差异、置顶排序、Dialog 通用 UI 辅助和密码生成算法核心。
- 将大列表动画索引从重复 `indexOf` 查找优化为线性索引。
- 修复 WebKit Dialog 几何测试在动画中间帧采样导致的偶发失败，并把最终几何误差约束收紧到 1px。
- 删除零调用的旧 Eye/EyeOff SVG 工厂。
- 增强模块依赖、循环依赖、语法、静态缓存身份、构建闭包、发行包成员及死代码回归门禁。

### 安全与兼容性

- 不改变 Passkey/WebAuthn、Vault Key、KEK、主密码、附件或分享加密协议。
- 不包含生产凭据、数据库导出、备份、日志、截图、视频、Git 元数据或 `node_modules`。
- Cloudflare 制品包含完整公开源码、部署模板、文档以及该制品可独立运行的测试集合；测试仅用于本地或 CI，不会由 Wrangler 部署到生产。
- 从 v2.2.1 升级无需新增 migration；完整 Cloudflare migration 链截至 `0034_admin_control_center.sql`。仍应按部署指南检查远端 migration ledger，且不要重复运行已应用迁移。

### Release 资产

- `pass-vault-v2-cloudflare-2.2.2.tar.gz`
- `pass-vault-v2-cloudflare-2.2.2.zip`
- `SHA256SUMS`

下载后请运行：

```bash
sha256sum -c SHA256SUMS
```

---

## English

PassVault v2.2.2 publishes the Cloudflare code-structure and regression-hardening work completed today. It does not change data formats, the D1/R2 schema, API contracts, or cryptographic protocols.

### Highlights

- Split the core Worker runtime, HTTP, and safe request helpers into explicit modules while retaining one Worker deployment target.
- Modularized Cloudflare Access authentication, runtime helpers, and UI boundaries in the Admin Worker.
- Extracted low-coupling frontend domains: history diffing, pinned ordering, shared dialog helpers, and the password generator core.
- Replaced repeated list-animation `indexOf` lookups with a linear map index.
- Stabilized WebKit dialog geometry checks by waiting for animation completion and layout settlement, tightening the final error allowance to 1px.
- Removed an unreferenced legacy Eye/EyeOff SVG factory.
- Added stronger gates for module dependencies, cycles, syntax, cache identities, build closure, release membership, and dead-code regression.

### Security and compatibility

- No changes to Passkey/WebAuthn, Vault Key, KEK, master-password, attachment, or secure-share cryptographic protocols.
- Production credentials, database exports, backups, logs, screenshots, videos, Git metadata, and `node_modules` are excluded.
- The Cloudflare archives contain the complete public source, deployment templates, documentation, and the test subset runnable from that artifact. Tests are for local/CI use and are not deployed by Wrangler.
- No new migration is required from v2.2.1. Continue to inspect the remote migration ledger according to the deployment guide and never reapply migrations already recorded.

### Release assets

- `pass-vault-v2-cloudflare-2.2.2.tar.gz`
- `pass-vault-v2-cloudflare-2.2.2.zip`
- `SHA256SUMS`

Verify downloads with:

```bash
sha256sum -c SHA256SUMS
```
