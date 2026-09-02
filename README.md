# Pass Vault

[![Cloudflare release](https://img.shields.io/badge/Cloudflare-v2.2.3-f38020)](https://github.com/17sho/pass-vault/releases/tag/v2.2.3) [![Linux release](https://img.shields.io/badge/Linux-v2.2.3--server-2f81f7)](https://github.com/17sho/pass-vault/releases/tag/v2.2.3-server) [![iOS native](https://img.shields.io/badge/iOS-ios--native-0b5d48)](https://github.com/17sho/pass-vault/tree/ios-native) [![License](https://img.shields.io/github/license/17sho/pass-vault)](LICENSE)

[中文](README.md) · [English](README.en.md)

一个移动优先、客户端加密、可自托管的开源密码库。网页版可独立部署到 Cloudflare Workers + D1 + R2 或 Linux Node.js + SQLite；仓库另提供本地优先的原生 SwiftUI iOS 客户端。三条产品线拥有独立运行时和数据边界，不会自动同步账户、会话或资料。

> 如果这个项目对你有帮助，欢迎点一个 Star ⭐️。

## 主要功能

- 保存账号、网站、安全笔记、TOTP 动态验证码和加密附件
- 常规资料自定义字段，以及分组、标签、收藏、置顶、最近查看和回收站
- 浏览器本地模糊搜索、批量整理、加密备份导入与导出
- 支持笔记图片和独立附件库：预览、播放、下载、重命名、分组和删除
- 支持设备级快速解锁，以及可选的服务器辅助 Passkey
- 响应式 Web 桌面与移动界面，以及独立的原生 SwiftUI iOS 客户端
- revision CAS、删除 tombstone、CSRF、同源检查、会话控制和限速

Cloudflare v2.2.3 提供独立 `custom` 自定义资料、加密历史与恢复中心、安全分享 v2、跨页收藏，以及可选的 Cloudflare Admin 与配额管理。Linux v2.2.3-server 提供安全分享、独立 Admin 控制台和文件生命周期保护。完整说明和平台范围请查看 **[功能介绍](docs/FEATURES.zh-CN.md)**。

原生 iOS 版位于独立的 **[`ios-native` 分支](https://github.com/17sho/pass-vault/tree/ios-native)**，包含完整 SwiftUI 源码、XCTest/XCUITest、项目文档、Agent 指引，以及可自行重签名安装的未签名 arm64 IPA。它是本地设备密码库，不会连接或自动同步 Cloudflare/Linux 网页版数据。

## 加密与部署边界

```text
主密码（仅浏览器）
  └─ PBKDF2-SHA-256 → KEK
       └─ 解包随机 AES-256-GCM vault key
            ├─ 资料与附件元数据在浏览器加密 → 后端保存密文
            └─ 附件正文以唯一 IV + 认证 AAD 加密 → R2 / 本地磁盘
```

默认模式下，主密码与资料明文不上传。服务器辅助 Passkey 会增加由服务器 KEK 包装的 vault key，使服务器可在 Passkey 验证成功后恢复 vault key 并创建会话，因此服务器辅助 Passkey 会改变默认零知识边界。启用前请阅读 **[架构与安全边界](docs/ARCHITECTURE.zh-CN.md)**。

| | Cloudflare 版 | Linux 版 | 原生 iOS 版 |
|---|---|---|---|
| 运行时 | Workers + Static Assets | Node.js 22+ | iOS 17+ / SwiftUI |
| 数据库 / 附件 | D1 + R2 | SQLite + 本地磁盘 | 设备本地加密存储 |
| 运维 / 安装 | Wrangler / Dashboard | systemd + Caddy/Nginx | 未签名 IPA 自行重签名 |
| 数据同步 | 不与其他版本自动同步 | 不与其他版本自动同步 | 不与 Web 版自动同步 |

## 产品截图

以下截图使用隔离环境和虚构测试数据生成，不包含生产账户、密码、Cookie 或真实域名。

### 桌面端密码库

![桌面端密码库界面](https://raw.githubusercontent.com/17sho/pass-vault/main/docs/images/vault-desktop.png)

### 移动端密码库

<img src="https://raw.githubusercontent.com/17sho/pass-vault/main/docs/images/vault-mobile.png" alt="移动端密码库界面" width="390">

### 安全中心与 Passkey

![安全中心与 Passkey 设置](https://raw.githubusercontent.com/17sho/pass-vault/main/docs/images/security-center.png)

## 文档

| 需要了解 | 中文 | English |
|---|---|---|
| 完整功能与平台范围 | [功能介绍](docs/FEATURES.zh-CN.md) | [Features](docs/FEATURES.en.md) |
| 架构、加密与 Passkey 边界 | [架构说明](docs/ARCHITECTURE.zh-CN.md) | [Architecture](docs/ARCHITECTURE.en.md) |
| Cloudflare 部署 | [部署指南](docs/cloudflare-deployment.zh-CN.md) | [Deployment guide](docs/cloudflare-deployment.en.md) |
| Linux 部署 | [部署指南](docs/server-deployment.zh-CN.md) | [Deployment guide](docs/server-deployment.en.md) |
| API、开发与安全 | [API](docs/API.md) · [开发](docs/DEVELOPMENT.md) · [安全](SECURITY.md) | [API](docs/API.md) · [Development](docs/DEVELOPMENT.md) · [Security](SECURITY.md) |

## 获取版本

两个运行时使用独立 tag、独立归档和独立数据存储，不要跨平台部署制品：

| 平台 | 正式版本 | 下载与部署 |
|---|---|---|
| Cloudflare Workers + D1 + R2 | [**v2.2.3**](https://github.com/17sho/pass-vault/releases/tag/v2.2.3) | 历史资产 `pass-vault-v2-cloudflare-2.2.3.tar.gz` / `.zip` · [部署指南](docs/cloudflare-deployment.zh-CN.md) |
| Linux Node.js + SQLite | [**v2.2.3-server**](https://github.com/17sho/pass-vault/releases/tag/v2.2.3-server) | 历史资产 `pass-vault-v2-linux-2.2.3.tar.gz` / `.zip` · [部署指南](docs/server-deployment.zh-CN.md) |
| 原生 iOS 17+ | [`ios-native`](https://github.com/17sho/pass-vault/tree/ios-native) | [未签名 arm64 IPA](https://raw.githubusercontent.com/17sho/pass-vault/ios-native/PassVault-unsigned-arm64.ipa) · [SHA-256](https://github.com/17sho/pass-vault/blob/ios-native/SHA256SUMS) · 分支内完整源码与测试 |

Cloudflare 与 Linux Release 都附带 `SHA256SUMS`。iOS 分支也提供独立校验文件；下载 IPA 与校验文件后，在同一目录运行 `sha256sum -c SHA256SUMS`。未签名 IPA 需要使用你自己的证书和描述文件重签名后安装。

## 安全提示

这是安全敏感软件。请在部署前审查源码和威胁模型，只通过 HTTPS 使用，并保留经过恢复验证的加密备份。项目尚未经过独立第三方安全审计。

安全漏洞请通过 [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault/security/advisories/new) 私下报告。

[贡献指南](CONTRIBUTING.md) · [MIT License](LICENSE)
