[中文](#中文) · [English](#english)

## 中文

### v1.1.14：紧凑分组操作

- 自定义分组的“重命名”“删除”按钮仅显示紧凑动作文字，完整分组名称保留在准确的无障碍标签中。
- 320px 窄屏不再因长分组名称撑宽操作区域；加密、分组持久化和服务端零知识边界不变。
- 完整 95 项测试、lint、typecheck、build，以及 Cloudflare Chromium 与 Linux WebKit 专用生产冒烟均通过。

### 升级与校验

升级前备份 Cloudflare D1/R2 或 Linux SQLite/附件目录。下载对应平台压缩包与 `SHA256SUMS`，在同一目录运行 `sha256sum -c SHA256SUMS`。

完整步骤：[Cloudflare 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.14/docs/cloudflare-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.14/docs/cloudflare-deployment.en.md)；[Linux 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.14/docs/server-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.14/docs/server-deployment.en.md)。

> 安全提醒：邀请码是注册准入控制，不是身份验证因素。忘记主密码无法恢复库密钥。Cloudflare 与服务器资源可能产生费用。

如果这个项目对你有帮助，欢迎在 GitHub 点 Star。

## English

### v1.1.14: compact group actions

- Custom-group Rename and Delete buttons now show compact action text while preserving the complete group name in precise accessible labels.
- Long group names no longer widen the action area at 320px. Encryption, group persistence, and the server-side zero-knowledge boundary are unchanged.
- All 95 tests, lint, typecheck, build, and dedicated production smoke checks on Cloudflare Chromium and Linux WebKit pass.

### Upgrade and verification

Back up Cloudflare D1/R2 or Linux SQLite/attachment storage first. Download the matching platform archive and `SHA256SUMS`, then run `sha256sum -c SHA256SUMS` in the same directory.

Full instructions: [Cloudflare 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.14/docs/cloudflare-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.14/docs/cloudflare-deployment.en.md); [Linux 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.14/docs/server-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.14/docs/server-deployment.en.md).

> Security note: the invitation is admission control, not an authentication factor. A forgotten master password cannot recover the vault key. Cloudflare and server resources may incur charges.

If this project helps you, a GitHub Star is appreciated.
