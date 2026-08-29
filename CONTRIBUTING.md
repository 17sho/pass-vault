# Contributing / 贡献指南

感谢贡献。Pass Vault 是安全敏感软件：小改动也可能影响密文兼容、会话隔离或两个运行时。/ Thank you for contributing. Pass Vault is security-sensitive: even a small change can affect ciphertext compatibility, session isolation, or both runtimes.

## 开始 / Getting started

要求 Node.js 22+。

```bash
git clone https://github.com/17sho/pass-vault.git
cd pass-vault
npm ci
npm test
npm run lint
npm run lint:docs
npm run typecheck
npm run build
```

所有命令必须自然退出 `0`。不要用超时、中止或旧 commit 的结果代替当前门禁。

## 仓库结构 / Repository map

| 路径 | 作用 |
|---|---|
| `public/` | 两个部署版本共用的浏览器 UI 与 WebCrypto |
| `shared/` | 两后端共用的密文契约、校验和安全工具 |
| `apps/worker/` | Cloudflare Worker、D1 migrations 与占位 Wrangler 模板 |
| `apps/server/` | Linux Node.js + SQLite 后端 |
| `tests/` | 契约、后端、浏览器和发布制品测试 |
| `docs/` | API、架构、安全与部署文档 |
| `scripts/` | 构建、检查、打包与原子部署工具 |

阅读 [`docs/ARCHITECTURE.zh-CN.md`](docs/ARCHITECTURE.zh-CN.md) / [`docs/ARCHITECTURE.en.md`](docs/ARCHITECTURE.en.md) 后再修改跨运行时行为。

## 分支与提交 / Branches and commits

1. 从最新 `main` 创建聚焦分支；
2. 一个 PR 解决一个清晰问题，避免无关重构；
3. 行为变更先加可失败测试，再实现并重构；
4. 使用可读的 Conventional Commit，例如 `fix(vault): ...`；
5. 不移动公开 tag，不替换历史 Release 来隐藏热修。

## 强制规则 / Mandatory rules

- 服务端不得接触或记录主密码、明文 vault key、条目明文、搜索词或敏感请求正文。
- 输入、所有权、CSRF、Origin、会话代际和异步操作边界必须 fail closed。
- API/密文契约变更必须同步更新 `shared/`、两个后端、浏览器、测试和 [`docs/API.md`](docs/API.md)。
- D1 schema 只增加 migration；不要重写已执行 migration。Linux schema 迁移必须幂等。
- UI 必须可键盘操作，并验证 Chromium 与 WebKit；移动路径至少覆盖 320px 且触控目标至少 44px。
- 批量写入必须绑定发起操作时的 key/generation；正向写入和补偿不得读取后来切换账户后的全局会话状态。
- 中英文用户文档必须保持等价，不得只更新一种语言。
- 不得提交真实域名、资源 ID、token、邀请码、KEK、数据库、导出、生产配置、Cookie、用户数据、密文或敏感截图。
- 贡献分支不得直接部署生产，也不得包含生成的生产状态。

## 测试期望 / Testing expectations

| 变更 | 最低证明 |
|---|---|
| `shared/` 或 API | 双后端契约测试、负面输入与所有权测试 |
| 加密/会话 | 锁库、退出、跨标签页、迟到异步结果和账户切换测试 |
| UI | Chromium + WebKit、键盘、320px/移动端几何与无横向溢出 |
| 附件/备份 | 对象生命周期、失败补偿、配额、损坏/超限、恢复兼容 |
| 部署/制品 | variant 边界、无秘密扫描、`SHA256SUMS`、文档链接 |
| 文档 | `npm run lint:docs`、中英文一致性和示例占位检查 |

提交前运行完整门禁：

```bash
npm test && npm run lint && npm run lint:docs && npm run typecheck && npm run build && git diff --check
```

## Pull Request 内容

PR 应写明：

- 问题与用户影响；
- 实现方法和被拒绝的替代方案；
- 对默认零知识边界、服务器辅助 Passkey、会话和数据迁移的影响；
- 真实执行的测试命令与结果；
- Cloudflare/Linux 是否都受影响；
- 文档与升级说明；
- 是否需要 migration、配置变化、备份或回滚步骤。

## 安全问题 / Security reports

不要用公开 Issue、Discussion 或 PR 报告可利用漏洞。请使用 [GitHub Private Vulnerability Reporting](https://github.com/17sho/pass-vault/security/advisories/new)；详见 [`SECURITY.md`](SECURITY.md)。

贡献一经合并，将按仓库根目录的 [MIT License](LICENSE) 分发。
