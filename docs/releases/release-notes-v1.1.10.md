[中文](#中文) · [English](#english)

## 中文

### v1.1.10：iPhone Safari 窄屏图例修复

- 修复多账号编辑器中“账号 N”图例在 iPhone Safari 窄屏下纵向断字的问题；图例保持横排且不产生横向溢出。
- 保存按钮原本可通过滚动编辑弹窗到达，因此本版本不改变保存流程。
- Chromium/WebKit 的 390px、320px、20 行回归及完整 78 项测试、lint、typecheck、build 均通过。
- 诊断确认旧 smoke 的保存超时是探针仅等待短暂 toast 的时序问题，而非产品保存回归；专用 smoke 现以成功的条目 API 响应、编辑器关闭、卡片出现及重开后的持久化内容为准，toast 仅作辅助证据。

### 升级与校验

升级前备份 D1/R2 或 SQLite/附件目录。下载对应平台压缩包与 `SHA256SUMS`，在同一目录运行 `sha256sum -c SHA256SUMS`。

> 安全提醒：忘记主密码无法恢复库密钥。Cloudflare D1/R2 与服务器资源可能产生费用。

## English

### v1.1.10: narrow iPhone Safari legend fix

- Fixes vertical breaking of “Account N” legends in the multi-account editor on narrow iPhone Safari viewports; legends stay horizontal without document overflow.
- The save button was already reachable by scrolling the editor dialog, so the save flow is unchanged.
- Chromium/WebKit regressions at 390px and 320px with 20 rows passed, together with all 78 tests, lint, typecheck, and build.
- Diagnosis confirmed that the prior save timeout was a probe race caused by using a transient toast as the sole completion oracle, not a product save regression. The dedicated smoke now requires a successful entry API response, editor closure, card appearance, and persisted content after reopening; toast state is supporting evidence only.

### Upgrade and verification

Back up D1/R2 or SQLite/attachment storage first. Download the platform archive and `SHA256SUMS`, then run `sha256sum -c SHA256SUMS` in the same directory.

> Security note: a forgotten master password cannot recover the vault key. Cloudflare D1/R2 and server resources may incur charges.
