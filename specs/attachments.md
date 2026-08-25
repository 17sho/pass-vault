# Spec: 零知识笔记图片与独立附件库

## Objective
为 Pass Vault 增加两条入口：
1. 笔记编辑器可选择并附加图片，详情中显示缩略图并可查看/下载/移除。
2. 顶部新增独立“附件”分类，集中管理图片、视频、文档、压缩包及其他普通文件，支持上传、预览/播放（浏览器支持时）、下载、重命名、删除和类型筛选。

所有文件与文件元数据均在浏览器中使用 Vault Key 加密；Cloudflare R2、Linux 文件目录、D1、SQLite、日志只接触密文或不可读的随机标识。两后端不自动同步。

## Confirmed UX
- 保留账号、网站、笔记三种资料契约；新增附件不复用这些类型。
- “+ 新建”仍是唯一主要新增入口，增加“附件”选项；导航新增“附件”。
- 笔记正文仍是纯文本，图片作为笔记附件显示，不采用可执行 HTML 富文本。
- 独立附件支持图片、视频及其他文件。
- 视频 MVP 为完整下载、浏览器解密后播放，不做 Range/流式解密。

## Limits
- 图片单文件明文最大 10 MiB。
- 视频单文件明文最大 100 MiB。
- 其他文件单文件明文最大 25 MiB。
- 每篇笔记最多 20 个图片附件。
- 文件名最多 255 个 Unicode 字符；拒绝控制/格式字符。
- 浏览器一次加解密单文件；UI 显示进度/忙碌状态。MVP 不含断点续传和图片自动压缩。

## Crypto and Data Model
- 每个文件生成随机 `attachmentId` 和随机 96-bit AES-GCM IV。
- 文件内容使用 Vault Key + AES-256-GCM 单独加密；绝不复用 IV。
- AAD 认证协议版本和附件 ID，防止密文替换。
- 文件名、MIME、明文大小、分类、可选 noteId 组成元数据对象，再作为普通 envelope 单独加密；后端只保存 metadata IV/ciphertext 和密文对象大小。
- Cloudflare：密文对象存 R2，随机对象键；D1 保存用户归属、ID、加密元数据 envelope、对象键、密文大小和时间。
- Linux：密文对象写到 `ATTACHMENTS_DIR/<user-hash>/<random-object-key>`；SQLite 保存同等元数据。使用临时文件+原子 rename，删除时同时删除对象。
- 附件读写必须验证当前 session 的 user_id；禁止 IDOR。
- 删除笔记时，关联图片由前端先明确删除；后端提供按用户归属的单附件删除。孤儿清理只删除数据库无引用的随机对象。

## API Contract
- `GET /api/attachments`：返回当前用户的加密元数据 envelope 列表。
- `POST /api/attachments/:id`：上传二进制密文；加密元数据通过请求头或独立 JSON 初始化接口提交（实现时以可流式、安全限制为准）。
- `GET /api/attachments/:id/content`：返回 `application/octet-stream` 密文、`no-store`。
- `PUT /api/attachments/:id/metadata`：替换加密元数据。
- `DELETE /api/attachments/:id`：删除元数据和密文对象。
- 所有变更请求沿用 Origin + CSRF；上传按密文大小限制，禁止信任客户端 MIME。

## Backup
- 新格式 `pass-vault-v2` version 2：包含条目 envelopes、附件 metadata envelopes 和密文附件对象。
- UI 提供“仅资料”和“包含附件”导出；包含附件时生成单个版本化归档，导入前校验数量、ID、密文大小和摘要。
- 继续接受 version 1 旧备份；旧备份导入后附件为空。
- 不允许静默导出遗漏附件；当存在附件时，“仅资料”必须明确提示。

## Commands
- Test: `npm test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Build: `npm run build`
- Worker dry run: `npx wrangler deploy --dry-run --config apps/worker/wrangler.jsonc`

## Testing Strategy
- 契约单测：文件名、分类、大小、envelope、AAD、唯一 IV。
- Linux 集成：上传/列举/下载/改名/删除、跨用户隔离、超限、CSRF、重启持久化、原子文件清理。
- Worker 集成：R2 binding mock，覆盖同等行为和 D1 migration。
- UI E2E：笔记图片上传/预览/移除；附件菜单上传图片/视频/普通文件、筛选、播放/下载/改名/删除；320/768/1440px；键盘和 reduced motion。
- 备份：v1 兼容，v2 含附件往返，损坏/重复/超限拒绝。

## Boundaries
- Always：浏览器端加密；随机唯一 IV；服务端鉴权/CSRF/大小检查；日志不含文件名、MIME、密文或用户内容；部署前备份。
- Ask first：提高默认大小/配额；引入付费服务；流式视频；改变现有三种条目字段。
- Never：将 Base64 文件塞入 entries；服务端解密；公开生产 R2/D1 ID、文件、备份或凭据；自动同步两版数据库。

## Success Criteria
- 笔记可添加、预览、查看、下载、移除图片。
- 独立附件菜单可安全管理图片、视频和其他文件。
- D1/SQLite/R2/服务器磁盘扫描不到明文文件名、MIME 和内容。
- 两生产后端功能一致，旧数据与 v1 备份保持兼容。
- 全套自动测试、构建、Worker dry-run、生产 smoke 和公开发行包验证全部通过。
