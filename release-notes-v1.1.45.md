# v1.1.45 — 密码历史 / 修改时间 + 最近查看

本次发布新增两项功能，均严守端到端零知识边界。

## ✨ 新增

### 功能6 · 密码历史与修改时间
- 账号条目每次保存记录 `updatedAt`；详情页显示「更新于」时间（北京时区小字）。
- 编辑时若某组密码发生变化，旧密码自动压入加密的 `passwordHistory`（每行 `{username,password,changedAt}`，最多保留 10 条）。
- 详情页新增可展开的「密码历史」，逐条按需显示 / 复制历史密码。
- 历史与时间戳均在客户端加密，永不进入服务端可见字段。

### 功能7 · 最近查看
- 打开任一条目（账号 / 网站 / 笔记 / 附件）即记录，去重后按时间倒序、最多 20 条。
- 当前分类无搜索词时，列表顶部以胶囊展示「最近查看」，一键打开。
- 采用跨设备同步方案：加密持久化于保留的 `recents_registry` settings envelope，换设备重新登录后仍保留；服务端仅可见该 envelope 的写入时间，看不到条目身份。

## 🔒 契约变更
- `SETTINGS_ID` → `SETTINGS_IDS`（`settings_registry` + `recents_registry`）；`validEnvelope` 放宽为允许这两个固定 settings id。
- 新增 `normalizeRecents`（结构、上限、时间戳边界校验，去重保留最新）。
- account 明文白名单纳入 `updatedAt` / `passwordHistory` 并加结构校验；旧版顶层 `username/password` 结构继续兼容。

## ✅ 质量
- 新增契约单测与 UI 集成 E2E（功能6 改密码留历史 + 显示更新时间；功能7 记录 + 重新登录后保留）。
- 全量回归、lint、lint:docs、typecheck、build 全部通过。
- 双端部署：`pass.23cm.me`（Cloudflare Worker / D1）与 `passkey.23cm.me`（Linux / SQLite）。
