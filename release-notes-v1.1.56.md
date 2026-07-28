# v1.1.56 — 回收站兼容与原子部署

## 中文

- 兼容旧版无 `trashOwnerId` 的回收站附件：仅在唯一已删除父笔记引用时安全联动，多父级歧义时保持独立。
- 过期项目清理失败时保留密文、显示中文提示，并在下次解锁重试；覆盖恰好30天和少1毫秒边界。
- Linux应用和代理模板补齐安全响应头。
- 增加版本目录、755/644权限归一化、原子软链切换、健康失败自动回滚、缓存重新验证和脱敏JSON证据。
- 增加双端生产回收站烟测和严格临时账户清理工具。
- 完整测试：176项通过；生产依赖审计0项漏洞。

## English

- Safely infer legacy trash attachment ownership only when exactly one deleted note references the attachment; ambiguous attachments remain standalone.
- Preserve expired encrypted items after cleanup failures, show a Chinese retry notice, and retry on the next unlock; cover the exact 30-day boundary.
- Add Linux application and reverse-proxy security headers.
- Add immutable release directories, 0755/0644 permission normalization, atomic symlink activation, health-failure rollback, cache revalidation, and redacted JSON evidence.
- Add dual-runtime production trash smoke testing and strict temporary-account cleanup.
- Full suite: 176 tests passed; zero production dependency vulnerabilities.

> 本版本继续采用既有发布方式：仅提供Release说明，不附加安装压缩包。
