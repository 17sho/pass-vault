# Pass Vault V2 v1.1.15

[中文](#中文) · [English](#english)

## 中文

### 隐式“全部”分组

- 账号、网站、笔记、附件四个菜单各自新增隐式“全部”视图，可查看并搜索该菜单中的所有资料。
- 附件“全部”视图仍可与图片、视频、其他文件分类筛选组合。
- 创建自定义分组不再切换当前分组；创建前处于全部、默认或某个自定义分组，创建后均保持不变。
- “全部”标记仅存在于浏览器界面状态，不写入加密分组注册表，不作为 API `groupId`，也不会出现在编辑、上传或移动目标中。服务端零知识边界不变。

### 升级

升级前备份 Cloudflare D1/R2 或 Linux SQLite/附件目录。下载对应平台压缩包与 `SHA256SUMS`，在同一目录运行 `sha256sum -c SHA256SUMS`。

完整步骤：[Cloudflare 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.15/docs/cloudflare-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.15/docs/cloudflare-deployment.en.md)；[Linux 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.15/docs/server-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.15/docs/server-deployment.en.md)。

> 安全提醒：邀请码是注册准入控制，不是身份验证因素。忘记主密码无法恢复库密钥。Cloudflare 与服务器资源可能产生费用。

如果这个项目对你有帮助，欢迎 Star ⭐️。

## English

### Implicit “All” groups

- Accounts, websites, notes, and attachments each gain an implicit All view for browsing and searching every record in that menu.
- Attachment category filters (images, videos, and other files) continue to combine with All.
- Creating a custom group no longer changes the active group; All, Default, and custom selections are all preserved.
- The All sentinel exists only in browser UI state. It is never written to the encrypted group registry, sent as an API `groupId`, or offered as an edit, upload, or move target. The server-side zero-knowledge boundary is unchanged.

### Upgrade

Back up Cloudflare D1/R2 or Linux SQLite/attachment storage first. Download the matching platform archive and `SHA256SUMS`, then run `sha256sum -c SHA256SUMS` in the same directory.

Full instructions: [Cloudflare 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.15/docs/cloudflare-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.15/docs/cloudflare-deployment.en.md); [Linux 中文](https://github.com/17sho/pass-vault-v2/blob/v1.1.15/docs/server-deployment.zh-CN.md) / [English](https://github.com/17sho/pass-vault-v2/blob/v1.1.15/docs/server-deployment.en.md).

> Security note: the invitation is admission control, not an authentication factor. A forgotten master password cannot recover the vault key. Cloudflare and server resources may incur charges.

If this project helps you, please consider starring it ⭐️.
