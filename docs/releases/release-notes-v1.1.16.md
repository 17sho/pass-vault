# Pass Vault V2 v1.1.16

<a id="中文"></a>
## 中文

### 更新
- 长列表现在只在列表区域内滚动；页眉、分类导航和搜索/分组工具栏保持不动。
- 桌面详情与移动端详情均可独立滚动，不移动应用框架。
- 支持动态视口高度、安全区域，以及 Chromium/WebKit 的 320px、390px 和桌面布局。

升级前请备份 Cloudflare D1/R2 或 Linux SQLite/附件目录。下载对应平台压缩包与 `SHA256SUMS`，在同一目录运行 `sha256sum -c SHA256SUMS`。

完整步骤：[Cloudflare 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.16/docs/cloudflare-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.16/docs/cloudflare-deployment.en.md)；[Linux 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.16/docs/server-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.16/docs/server-deployment.en.md)。

> 安全提醒：邀请码不是身份验证因素；忘记主密码无法恢复库密钥。Cloudflare 与服务器资源可能产生费用。

如果这个项目对你有帮助，欢迎 Star。

<a id="english"></a>
## English

### Changes
- Long collections now scroll only inside the list while the header, category navigation, and search/group toolbar remain stationary.
- Desktop and mobile details scroll independently without moving app chrome.
- Dynamic viewport height, safe areas, and Chromium/WebKit layouts at 320px, 390px, and desktop widths are covered.

Back up Cloudflare D1/R2 or Linux SQLite/attachment storage before upgrading. Download the matching archives and `SHA256SUMS`, then run `sha256sum -c SHA256SUMS` in that directory.

Full instructions: [Cloudflare 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.16/docs/cloudflare-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.16/docs/cloudflare-deployment.en.md); [Linux 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.16/docs/server-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.16/docs/server-deployment.en.md).

> Security: invite codes are not authentication factors; a forgotten master password cannot recover the vault key. Cloudflare and server resources may incur charges.

If this project helps you, please consider starring it.
