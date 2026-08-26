# PassVault v2.2.3

## 中文

v2.2.3 汇总发布 v2.2.2 之后完成的 Cloudflare 移动端体验与敏感状态生命周期修复。它不改变数据格式、D1/R2 schema、API 协议或加密协议。

### 修复与改进

- 手机端文本输入、文本区域和下拉控件统一使用至少 16px 字号，降低 iOS Safari 聚焦输入时自动放大页面的概率。
- 首页与安全分享页采用固定缩放 viewport；这会禁用页面双指缩放，是本版本明确的移动端体验取舍。
- 手机长列表的条目操作菜单限制在列表真实可见区域内，避免顶部菜单项被搜索/筛选工具栏遮挡。
- 手机详情返回列表时，退场层在清理详情 DOM 前完全透明，避免 WebKit 尾帧出现可见跳变。
- 编辑器关闭、后台隐私遮挡和锁库时清理敏感编辑基线；锁库同时重置恢复中心与收藏/置顶客户端注册表，避免旧会话状态残留。

### 安全与兼容性

- 不改变 Passkey/WebAuthn、Vault Key、KEK、主密码、附件或安全分享加密协议。
- 不需要新增 migration；完整 Cloudflare migration 链仍截至 `0034_admin_control_center.sql`。
- 不包含生产凭据、数据库导出、备份、日志、截图、视频、Git 元数据或 `node_modules`。
- Cloudflare 制品包含完整公开源码、测试、文档和 Agent 指引；依赖 Linux 后端或完整仓库布局的测试保留在 GitHub 源码分支，不进入 Cloudflare 归档。
- 本版本只发布并验证 Cloudflare 归档；Linux 运行时未在本次版本中部署或生产验证。

### 验证

- 最终全仓候选在创建 tag 前必须通过完整测试；准确数量将在门禁完成后记录到 GitHub Release。
- Lint、文档检查、TypeScript、构建和 diff 检查通过。
- 移动端专项覆盖 Chromium 与 WebKit；Linux WebKit 仅作为 Safari 近似环境，不等同于真实 iPhone Safari。

### Release 资产

- `pass-vault-v2-cloudflare-2.2.3.tar.gz`
- `pass-vault-v2-cloudflare-2.2.3.zip`
- `SHA256SUMS`

下载后请运行：

```bash
sha256sum -c SHA256SUMS
```

---

## English

PassVault v2.2.3 publishes the Cloudflare mobile-experience and sensitive-state lifecycle fixes completed after v2.2.2. It does not change data formats, the D1/R2 schema, API contracts, or cryptographic protocols.

### Fixes and improvements

- Mobile text inputs, textareas, and selects now use at least 16px text to reduce iOS Safari focus zoom.
- The main app and secure-share page now use a fixed-scale viewport. This intentionally disables pinch zoom as an explicit mobile UX trade-off in this release.
- Mobile row action menus are constrained to the list's actual visible interval so search/filter chrome cannot cover their upper actions.
- Mobile detail exits become fully transparent before detail DOM cleanup, preventing a visible WebKit end-frame jump when returning to the list.
- Closing the editor, applying the background privacy shield, and locking the vault clear sensitive editor baselines; locking also resets recovery and favorite/pin client registries to prevent stale-session residue.

### Security and compatibility

- No changes to Passkey/WebAuthn, Vault Key, KEK, master-password, attachment, or secure-share cryptographic protocols.
- No new migration is required; the complete Cloudflare migration chain still ends at `0034_admin_control_center.sql`.
- Production credentials, database exports, backups, logs, screenshots, videos, Git metadata, and `node_modules` are excluded.
- The Cloudflare archives include the complete public source, tests, documentation, and Agent guidance. Tests requiring the Linux backend or full repository topology remain on the GitHub source branch and are excluded from the Cloudflare archives.
- This release publishes and verifies Cloudflare archives only. The Linux runtime was not deployed or production-verified in this release.

### Verification

- Final repository suite: the final release candidate is required to pass the complete suite before tagging; exact counts are recorded in the GitHub Release after the gate completes.
- Lint, documentation checks, TypeScript, build, and diff checks passed.
- Mobile regressions cover Chromium and WebKit. Linux WebKit is only a Safari approximation, not real-device iPhone Safari evidence.

### Release assets

- `pass-vault-v2-cloudflare-2.2.3.tar.gz`
- `pass-vault-v2-cloudflare-2.2.3.zip`
- `SHA256SUMS`

Verify downloads with:

```bash
sha256sum -c SHA256SUMS
```
