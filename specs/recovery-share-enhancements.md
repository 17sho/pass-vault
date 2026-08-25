# Cloudflare 恢复中心与安全分享增强规格

## 范围与边界

- 仅发布 Cloudflare Worker + D1 + R2；共享前端仍不得把资料、分组、附件元数据、密码或分享内容明文发送给服务端。
- 保持旧分享 URL、旧 `secure_shares` 行和旧客户端兼容；协议 v2 新增的能力不得削弱 v1。
- 所有新增二级窗口统一使用纵向 flex：`max-height:min(82dvh,calc(100dvh - 24px))`，标题/底栏 `flex:none`，唯一内容滚动区 `flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain`。
- 禁止原生 `select/alert/prompt/confirm`。所有危险操作使用可访问的自有确认对话框。

## 恢复中心

### 回收站保留策略

- 保留期支持 7、30、90 天和永久保留；设置写入新的 `recovery_registry` 加密 settings envelope，旧库默认为 30 天。
- 服务端看不到保留期、删除状态、标题或分组；过期清理仍只在成功解锁和完整解密后由浏览器执行。
- 清理失败保留项目并下次重试；不误报成功。

### 恢复中心交互

- 「回收站」升级为「恢复中心」，保留原入口兼容。
- 支持逐项预览、单项恢复、批量选择/全选、批量恢复、批量永久删除、清空。
- 批量执行逐项 CAS；任一失败时报告成功/失败数量，失败项保留，禁止把部分成功误报为整体成功。
- 预览只在浏览器内渲染解密内容；敏感字段默认隐藏；附件可在不恢复的情况下预览/下载。
- 锁库、退出、后台隐私遮罩必须清空预览 DOM、Blob URL、选择状态和对象引用。

### 历史比较与恢复

- 当前版本与选中历史版本在浏览器内做字段级差异；服务端只返回密文 envelope。
- 比较窗口显示新增、删除、修改字段，但密码、TOTP、secret 字段默认遮挡；用户可逐项显隐。
- 恢复仍为新的 CAS 保存，当前版本自动进入历史。

### 附件版本

- D1 新增 `attachment_versions`，保存旧 metadata envelope、旧 R2 object key/大小、source revision 与归档时间。
- 附件 metadata 更新前归档 metadata；附件内容替换时上传新密文对象，原对象转入历史；两者作为同一版本快照。
- 每附件最多 10 版、每用户最多 50 版；裁剪版本对应 R2 对象必须进入 `pending_r2_deletions`，不得在仍被当前附件、附件历史或分享对象引用时删除。
- 附件永久删除级联清理历史记录，并把当前及历史对象加入删除队列。配额计数包含当前附件、附件历史和分享附件对象。
- 附件版本可预览、下载和 CAS 恢复；恢复旧内容时当前内容先归档。

### 分组关系恢复

- `recovery_registry` 加密保存最近删除的分组墓碑 `{type,id,name,deletedAt}`，最多 100 条，保留期跟随恢复设置。
- 删除分组时条目仍回退默认，但写入加密墓碑；恢复资料时若其原 groupId 对应墓碑，可选择同时恢复分组。分组名冲突时要求用户在自有弹窗中改名，不静默覆盖。
- 服务端看不到分组名、分组 ID 与资料关联。

## 安全分享 v2

### 包与密码保护

- 分享对象为加密包：1–50 条资料，可包含附件；manifest 在浏览器内序列化并用随机 256-bit package key + AES-GCM 加密。
- 分享密码可选。无密码时 fragment 携带 package key；有密码时 fragment 只携带随机 salt、PBKDF2 参数和由密码派生 KEK 包装后的 package key，不携带原 key。
- 密码 KDF 固定 PBKDF2-SHA-256、310000 次、随机 16-byte salt；错误密码只在本地 AES-GCM 解包失败，不发送密码、派生密钥或完整口令哈希。
- 所有 envelope 使用协议/分享 token/对象 ID 隔离的 AAD。Base64URL 必须规范编码。

### 精确到期与消费策略

- 到期可选择预设或 `datetime-local` 精确时间；必须晚于当前时间且不超过 7 天，服务端再次硬校验。
- 支持 1、3、10 次与首次打开失效。首次打开失效等价于首次成功 claim 后禁止新浏览器 claim，但已 claim 的浏览器会话可在到期前读取包内附件。
- 支持「仅一个浏览器会话」：首次成功 claim 原子写入 share session，设置 HttpOnly、Secure、SameSite=Strict、path 限定的匿名 cookie；后续 manifest/附件读取必须持有该 session。其他浏览器统一返回 `share_unavailable`。
- 不启用单浏览器绑定时，每次新 claim 原子增加 view_count；同一 claim 会话读取多个包对象不重复计数。

### 分享附件与多资料包

- 客户端从 vault 解密所选附件，再用 package key 和对象级 AAD 重新加密；服务端/R2 仅保存分享密文。
- 创建采用 prepare/upload/commit：D1 创建 pending 分享与 upload token；每个对象上传到专用随机 R2 key；commit 仅在 manifest 与所有声明对象齐全、大小/数量符合限制时激活。
- 失败或超时 pending 上传由定时任务回收；撤销/到期后对象进入 R2 删除队列。
- 每包最多 50 条资料、8 个附件、附件密文合计 25 MiB、单对象不超过现有 Worker 上限；单用户最多 20 个活跃分享。
- 匿名下载使用随机 opaque object ID，不暴露原资料或附件 ID。响应 `no-store`，内容为密文。

### 分享页面与管理

- 分享页保持 `noindex,nofollow`、no-referrer；fragment 解析后立即清除。
- 有密码时显示自有密码解锁区；错误密码不消费新的查看次数（claim 可先取得 envelope，但 package key 解包在本地；单次 policy 的 claim 计数仍只由一次原子 claim 产生）。
- 多资料包使用固定 header/footer、内部滚动列表；附件下载/预览仅在本地解密，切后台清空明文与 Blob URL。
- 管理页显示加密备注、包类型/数量（由 ownerNote 加密）、创建/到期、已 claim 次数、首次打开/单会话策略、最近打开时间和撤销状态。
- 最小审计仅记录服务端时间：首次 claim、最近 claim、claim 次数；不记录 IP、UA、标题、对象 ID 明文或内容。

## API 概要

- `POST /api/shares/v2`：创建 pending 包元数据。
- `PUT /api/shares/v2/:token/objects/:opaqueId`：认证所有者上传分享密文对象。
- `POST /api/shares/v2/:token/commit`：认证所有者激活。
- `POST /api/shares/claim`：匿名原子 claim，返回 manifest envelope 并设置匿名 session cookie。
- `GET /api/shares/objects/:opaqueId`：匿名会话读取分享附件密文。
- 现有 `GET /api/shares` 与 `DELETE /api/shares/:id` 扩展 v2 状态；v1 路由继续工作。
- `GET /api/attachments/:id/versions`、`GET /api/attachments/:id/versions/:revision/content`、`POST /api/attachments/:id/versions/:revision/restore`。

## 发布门禁

- Worker/D1：创建、上传、commit、失败补偿、到期、撤销、并发 claim、首次打开、单浏览器绑定、账户隔离、对象越权、R2 引用与配额。
- Crypto：密码包装、错误密码、规范 Base64URL、AAD token/object 隔离、旧 v1 兼容。
- UI：恢复批量部分失败、预览清理、差异遮挡、分组墓碑、精确到期、多资料/附件选择、分享管理。
- 布局：Chromium/WebKit × 1280×800、390×844、320×700、320×420；长列表、safe-area、footer 始终可达、唯一内容区滚动、零横向溢出、关闭后焦点回归。
- 全量核心、共享前端、lint、typecheck、build、Wrangler dry-run、独立安全/R2/布局复审全部自然 exit 0 后才能部署。
