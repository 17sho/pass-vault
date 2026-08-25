[中文](#中文) · [English](#english)

## 中文

### v1.1.12：移动端附件工具栏布局修复

- 修复 320px 与 390px 移动端附件工具栏：搜索框宽度至少 150px，“默认”分组完整可见且按钮宽度至少 70px，附件分类筛选器以至少 44px 高度占据完整第二行。
- Chromium 320px 与 WebKit 390px 的生产几何门禁覆盖元素不重叠、页面不横向溢出、无控制台或页面错误。
- 自定义分组 UI 测试改为每个测试使用独立服务器、SQLite 与附件目录，并在结束时等待服务器退出及精确清理夹具。
- 完整 91 项测试、lint、typecheck 与 build 均通过。

### 升级与校验

升级前备份 Cloudflare D1/R2 或 Linux SQLite/附件目录。下载对应平台压缩包与 `SHA256SUMS`，在同一目录运行 `sha256sum -c SHA256SUMS`。

> 安全提醒：忘记主密码无法恢复库密钥。Cloudflare D1/R2 与服务器资源可能产生费用。

如果这个项目对你有帮助，欢迎在 GitHub 点 Star。

## English

### v1.1.12: mobile attachment-toolbar geometry fix

- Fixes the attachment toolbar at 320px and 390px: search remains at least 150px wide, the “默认” group is fully visible with a button width of at least 70px, and the attachment category filter occupies a complete second row at least 44px high.
- Production geometry gates cover Chromium at 320px and WebKit at 390px, including non-overlap, no horizontal document overflow, and no console or page errors.
- Custom-group UI tests now use an isolated server, SQLite database, and attachment directory per test, await server exit, and remove their exact fixtures.
- All 91 tests, lint, typecheck, and build pass.

### Upgrade and verification

Back up Cloudflare D1/R2 or Linux SQLite/attachment storage first. Download the matching platform archive and `SHA256SUMS`, then run `sha256sum -c SHA256SUMS` in the same directory.

> Security note: a forgotten master password cannot recover the vault key. Cloudflare D1/R2 and server resources may incur charges.

If this project helps you, a GitHub Star is appreciated.
