# Changelog

## [1.1.35] - 2026-07-15

### Improved / 改进
- 分组管理弹窗固定标题和关闭按钮，仅分组列表独立滚动。
- 分组排序弹窗固定标题、副标题、关闭按钮及四类选择标签，仅排序列表独立滚动。

## [1.1.34] - 2026-07-13

### Improved / 改进
- 登录卡片以 320ms 退出，密码库页面以 720ms 淡入、位移和缩放恢复，替代登录成功后的突然闪切。

## [1.1.33] - 2026-07-13

### Fixed / 修复
- 附件详情中的元数据、预览和创建时间统一增加 24px 左右内边距，不再紧贴边框。

## [1.1.32] - 2026-07-13

### Improved / 改进
- 登录页首次动画延长到 760ms，并增强淡入、位移与缩放幅度，使其在真实设备上清晰可感知。

## [1.1.31] - 2026-07-13

### Improved / 改进
- 登录页首次从域名打开时以 420ms 淡入、轻微位移和缩放动画平滑出现。
- 动画仅执行一次，并尊重系统减少动态效果设置。

## [1.1.30] - 2026-07-13

### Fixed / 修复
- 附件详情“← 返回”仅在手机单栏显示，桌面双栏不再显示多余返回按钮。

## [1.1.29] - 2026-07-13

### Added / 新增
- 顶部“更多”新增“置顶排序”，账号、网站、笔记、附件可独立调整已置顶资料顺序。
- 置顶顺序随资料内容在浏览器内加密，并应用于分类、分组、搜索与附件类别筛选结果。

## [1.1.28] - 2026-07-13

### Fixed / 修复
- 顶部“更多”菜单会在打开条目菜单、进入详情、切换分类或点击外部时自动收起。
- Top and per-record action menus are now mutually exclusive with synchronized `aria-expanded` state.

## [1.1.27] - 2026-07-13

### Fixed / 修复
- 修复刷新或重新登录后，手机窄屏点击已有附件无法进入详情与图片预览。
- Fixed reloaded attachments missing their client-side attachment type, which prevented narrow-screen detail opening.

## [1.1.26] - 2026-07-13

### Added / 新增
- 账号、网站、笔记与附件支持置顶/取消置顶，并在菜单、分组、搜索和附件类别结果中优先显示。
- Added encrypted per-record pinning for accounts, websites, notes, and attachments without exposing pin state to the server.

## [1.1.25] - 2026-07-13

### Added / 新增
- “更多”菜单新增“分组排序”，账号、网站、笔记和附件可分别调整自定义分组上下顺序；`全部` 与 `默认` 固定在顶部。
- Added independently persisted custom-group ordering for all four menus, with All and Default pinned at the top.

## [1.1.24] - 2026-07-13

### Fixed / 修复
- 修复新建不同类型资料后，实际列表已切换但顶部分类菜单仍停留在旧类型的问题；保存后菜单、列表、搜索与详情状态现在同步切换。
- Fixed category desynchronization after creating an item of another type; navigation, list, search, and detail state now switch together after save.

## [1.1.23] - 2026-07-13

### Fixed / 修复
- 完全移除“新建什么资料？”标题的蓝色焦点框，同时保留程序化焦点和键盘导航。
- Removed the visible blue outline from the creation picker heading while preserving programmatic focus and keyboard navigation.
- 前端资源缓存键提升至 `v1.1.23`，避免浏览器继续使用旧 CSS。

### Verification / 验证
- 完整自动化测试 116/116 通过；Lint、Typecheck 和 Build 通过。
- Cloudflare Chromium 320px 与 Linux WebKit 390px 均确认标题无 outline/box-shadow 且无横向溢出。

## [1.1.22] - 2026-07-13

### Fixed / 修复
- “新建什么资料？”弹窗打开后将初始焦点放在标题，不再让右上角关闭按钮自动显示绿色焦点框，同时保留 Tab、Escape 和焦点恢复行为。
- The creation picker now focuses its heading instead of automatically showing a green focus ring on the close button, while preserving Tab, Escape, and focus restoration behavior.
- 前端资源缓存键提升至 `v1.1.22`，避免浏览器继续使用旧资源。

### Verification / 验证
- 完整自动化测试 116/116 通过；Lint、Typecheck 和 Build 通过。
- Cloudflare Chromium 320px 与 Linux WebKit 390px 生产验证通过，关闭按钮初始无焦点框且页面无横向溢出。

## [1.1.21] - 2026-07-13

### Fixed / 修复
- 空的说明、标签及其他可选文本字段在详情中保持留白，不再显示破折号；留白最小高度 24px，标签后顶部间距 8px。
- Empty descriptions, tags, and optional text fields now remain blank with a 24px minimum area and an 8px top gap instead of showing an em dash.
- 删除条目后，剩余列表不再重复播放入场动画，避免列表抽搐。
- Remaining rows no longer replay their entrance animation after deletion, preventing list jitter.

## [1.1.20] - 2026-07-12

### Added / 新增
- 账号、网站、笔记和附件详情底部显示由服务端记录的创建时间，并统一按北京时间呈现。
- Account, website, note, and attachment details now show server-recorded creation time in Beijing time.

### Changed / 变更
- D1 新增 `0006_entries_created_at.sql`；Linux 启动迁移幂等新增 `created_at`，并以 `updated_at` 回填旧条目。编辑不会改变创建时间。
- D1 adds `0006_entries_created_at.sql`; Linux idempotently adds `created_at` at startup and backfills legacy entries from `updated_at`. Edits preserve creation time.

## [1.1.19] - 2026-07-12

- 分组弹窗打开、选择后重绘及重新打开时聚焦当前分组；当前项具有唯一 `aria-pressed` 状态和可见焦点环，关闭后焦点返回分组触发按钮。
- Group dialogs now focus the current group on open, rerender, and reopen, with one `aria-pressed` current option, a visible focus ring, and focus restoration to the trigger on close.

## [1.1.18] - 2026-07-12

- 修复修改登录名弹窗在窄屏及桌面上的字段重叠，统一为可访问的单列布局和 44px 触控目标。
- Fixed overlapping change-username fields with an accessible single-column layout and 44px touch targets.

## [1.1.17] - 2026-07-12

### Added / 新增
- 新增经认证、同源 CSRF 保护且要求当前主密码复核的登录用户名修改；成功后原子撤销全部会话并清除 Cookie。
- Added authenticated, same-origin CSRF-protected login username changes with current-master-password reauthentication, atomic account update, and complete session revocation.

### Security / 安全
- 请求严格只接受新用户名和当前主密码；用户名沿用共享 Unicode 契约。该流程不修改密码、KDF、包装密钥或任何密文，因此不会重新加密密码库。
- Requests strictly allow only the new username and current password and reuse the shared Unicode username contract. Passwords, KDF material, wrapped keys, and vault ciphertext remain untouched, so no vault re-encryption occurs.

## [1.1.16] - 2026-07-12

- 长列表和详情独立滚动，同时保持页眉、分类导航和工具栏固定在应用视口内。
- Keep long lists and details independently scrollable while app chrome remains viewport-bound.
- Add Chromium and WebKit regression coverage at 320px, 390px, and desktop widths.

## [1.1.15] - 2026-07-12

### Added / 新增
- 账号、网站、笔记、附件各自新增隐式“全部”视图，可在当前菜单全部资料中组合搜索；该视图仅存在于浏览器 UI 状态，不进入加密注册表、API `groupId` 或移动目标。
- Added an implicit per-menu “All” view that combines with search. Its sentinel remains UI-only and never enters the encrypted registry, API `groupId`, or move targets.

### Fixed / 修复
- 创建自定义分组后保留创建前的当前分组（全部、默认或自定义）。
- Creating a custom group now preserves the previously active All, Default, or custom group.

All notable changes to this project will be documented here. This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project intends to use [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.13] - 2026-07-12

### Security / 安全
- 注册现在必须提供管理员配置的共享邀请码；缺失配置时关闭注册，错误邀请码按来源持久限速，既有账户登录不受影响。邀请码不会写入日志、仓库或构建产物。
- Registration now requires an administrator-configured shared invitation code. Registration fails closed when it is absent, wrong codes are durably rate-limited by source, and existing-account sign-in is unaffected. The code is never written to logs, the repository, or build artifacts.

### Tests / 测试
- Linux、Worker 与浏览器测试覆盖缺失/错误/正确邀请码、可见邀请码字段、持久限速和登录兼容；所有维护中的生产注册 smoke 脚本均要求 `INVITE_CODE` 环境变量。
- Linux, Worker, and browser tests cover missing/wrong/correct invitations, the visible invitation field, durable rate limiting, and sign-in compatibility; every maintained production registration smoke script now requires `INVITE_CODE` in its environment.

## [1.1.12] - 2026-07-12

### Fixed / 修复
- 修复 320px 与 390px 移动端附件工具栏布局：搜索框保持至少 150px 宽，当前“默认”分组完整可见，附件分类筛选器以至少 44px 高度占据完整第二行，且无重叠或横向溢出。
- Fixed the attachment toolbar at 320px and 390px: search remains at least 150px wide, the current “默认” group stays fully visible, and the attachment category filter occupies a complete second row at least 44px high without overlap or horizontal overflow.

### Tests / 测试
- 自定义分组 UI 测试改为每个测试使用独立服务器、SQLite 与附件目录，并在测试后等待服务器退出及精确删除临时目录，避免认证夹具与端口状态泄漏。
- Custom-group UI tests now use an isolated server, SQLite database, and attachment directory per test, then await server exit and remove the exact temporary directory to prevent auth-fixture and port leakage.

## [1.1.11] - 2026-07-12

### Added / 新增
- 为账号、网站、笔记与附件新增相互独立的客户端加密自定义分组，支持空分组持久化、创建、重命名、计数、分配、筛选与删除回默认分组。
- Added independent browser-encrypted custom groups for accounts, websites, notes, and attachments, with empty-group persistence, create, rename, counts, assignment, filtering, and delete-to-default behavior.

### Security / 安全
- 分组注册表仅以保留的 `settings` 密文 envelope 保存；分组名称和 `groupId` 只在浏览器加密前出现，附件元数据头同样保持加密。旧条目、旧备份及失效分组均安全回退到默认分组。
- The group registry is stored only as a reserved encrypted `settings` envelope; group names and `groupId` exist only before browser-side encryption, including encrypted attachment metadata headers. Legacy records, old backups, and invalid groups safely fall back to the default group.

## [1.1.10] - 2026-07-12

### Fixed / 修复
- 修复 iPhone Safari 多账号编辑器图例在窄屏下纵向断字的问题；图例保持横排且不产生横向溢出。保存按钮原本即可通过滚动弹窗到达，因此未改变保存流程。
- Fixed vertically broken account legends in the narrow iPhone Safari editor; legends stay horizontal without overflow. The save action was already reachable by scrolling the dialog, so the save flow is unchanged.

## [1.1.9] - 2026-07-11

### Added / 新增
- 账号条目支持 1–20 组独立账号与密码，包含逐行添加、移除、显示、复制、搜索、编辑与持久化；320px 和 iPhone Safari 均有专门回归测试。
- Account entries support 1–20 independent credential pairs with per-row add, remove, reveal, copy, search, edit, and persistence coverage on 320px and iPhone Safari.

### Security / 安全
- 旧版顶层账号/密码在浏览器内规范化为 `credentials`；服务端仍只接收密文 envelope。拒绝半空、超限、混合或含未知敏感字段的结构，且密码不进入列表或搜索索引。
- Legacy top-level credentials normalize in-browser to canonical arrays while servers continue receiving encrypted envelopes only. Half-empty, oversized, mixed, and unknown-sensitive-field shapes are rejected, and passwords never enter list or search indexes.

## [1.1.8] - 2026-07-11

### Added / 新增
- 新增完全在浏览器内运行的当前分类模糊搜索：优先精确与子串结果，支持大小写/空白/标点归一化、中文片段、英文拼写与相邻换位容错及连续字母匹配；仅搜索各资料类型和附件的可见元数据，不向服务器发送明文查询。
- Added category-scoped fuzzy search that stays entirely in the browser, prioritizes exact/substring results, normalizes case/spacing/punctuation, and supports Chinese fragments, Latin typo/transposition tolerance, and subsequences while limiting matches to visible item/attachment metadata.

### Fixed / 修复
- 初始登录页在普通动态效果下仅执行一次轻量入场；减少动态效果时立即显示，切换登录/注册或显示错误均不重播。
- The initial authentication screen now performs one lightweight entrance with normal motion, appears immediately with reduced motion, and never replays on mode switches or errors.
- 登录成功后仅保留一次纯透明度密码库显示，不移动或重建列表卡片；Linux 附件集成测试显式隔离每个临时附件目录，避免共享服务器环境状态引发 `ENOENT`。
- Login keeps one opacity-only vault reveal without moving or rebuilding cards; Linux attachment integration tests now isolate each temporary attachment directory instead of inheriting shared server environment state that caused `ENOENT`.

## [1.1.7] - 2026-07-11

### Fixed / 修复
- 修复登录成功后认证页退场、密码库入场与列表入场动画叠加，并因重复渲染重建卡片而产生的可见抖动；登录现在只执行一次无位移、无透明度变化的稳定提交与显示。
- Fixed visible login jitter caused by compounded auth-out, vault-in, and list-in animations plus duplicate card rendering; login now performs one stable commit and reveal with no translation or opacity transition.
- 保留退出登录的原有退场/入场动效，并新增 Chromium 390、WebKit iPhone 与减少动态效果模式的登录稳定性回归。
- Preserved the existing logout transition and added Chromium 390, WebKit iPhone, and reduced-motion login stability coverage.

## [1.1.6] - 2026-07-11

### Fixed / 修复
- 修复 iPhone Safari 长列表中部和底部条目的更多操作菜单被定位到可视区域下方、导致“编辑/删除”不可见的问题；菜单现在按可视视口固定定位并在空间不足时向上翻转。
- Fixed iPhone Safari overflow menus for middle and bottom rows being positioned below the visible viewport; menus now use visual-viewport-aware fixed placement and flip above the trigger when needed.
- 保留点击外部、Escape 和滚动关闭行为，且不产生横向溢出。
- Preserved outside-click, Escape, and scroll dismissal without introducing horizontal overflow.

## [1.1.5] - 2026-07-11

### Fixed / 修复
- 修复 Safari 新建条目保存成功后因 `editing` 与 `currentDetail` 同为 `null` 而错误打开空详情、显示 `null is not an object (evaluating 'x.type')` 的问题。
- Fixed Safari saves incorrectly treating two null state values as an active edited detail, which called detail rendering with `null` after a successful create.

## [1.1.4] - 2026-07-11

### Fixed / 修复
- 修复手机端连续切换顶部分类菜单时，旧详情短暂残留、列表卡片透明闪烁及附件筛选器显隐不同步的问题。
- Fixed mobile top-category navigation flicker: stale detail content is removed in the same frame, list cards remain visible during rapid switches, and the attachment filter visibility stays synchronized.

## [1.1.3] - 2026-07-11

### Fixed
- Release R2 storage-byte reservations when an upload fails after quota reservation, including R2 put and D1 metadata insert failures.
- Release the exact new/old storage delta when attachment backup replacement fails, while conservatively retaining attempted Class A operation counts.

## [1.1.2] - 2026-07-11

### Added
- Conservative D1-backed, atomic R2 storage and monthly Class A/B hard limits with explicit Chinese quota feedback.
- Bilingual documentation of account-wide free allowances, alert limitations, and residual billing risks.

## [1.1.1] - 2026-07-11

### Fixed
- Cloudflare R2 uploads now buffer the validated, fixed-length ciphertext body before calling `R2Bucket.put`, avoiding the production runtime failure caused by passing a transformed request stream.
- Cloudflare uploads now require and verify `Content-Length` before writing an attachment object.

## [1.1.0] - 2026-07-11

### Added
- Zero-knowledge note images and a standalone attachment library for Cloudflare R2 and Linux disk storage.
- Encrypted attachment upload, preview/playback, download, rename, delete, filtering, and version 2 backup round-trips.
- Bilingual Chinese/English project home pages.
- Detailed bilingual Cloudflare CLI, Cloudflare Dashboard, and Linux deployment guides.
- Security policy and contribution guide.

### Security
- Public documentation uses placeholders rather than production domains, database IDs, paths, or credentials.

## [0.1.0] - 2026-07-11

### Added
- Shared mobile-first browser frontend with client-side encryption.
- Cloudflare Workers + Static Assets + D1 backend.
- Linux Node.js + SQLite backend.
- Encrypted backup import/export and password re-wrapping flow.
- Authentication, session, CSRF, origin, and rate-limit protections.

[Unreleased]: https://github.com/17sho/pass-vault-v2/compare/v1.1.10...HEAD
[1.1.10]: https://github.com/17sho/pass-vault-v2/compare/v1.1.9...v1.1.10
[1.1.9]: https://github.com/17sho/pass-vault-v2/compare/v1.1.8...v1.1.9
[1.1.8]: https://github.com/17sho/pass-vault-v2/compare/v1.1.7...v1.1.8
[1.1.7]: https://github.com/17sho/pass-vault-v2/compare/v1.1.6...v1.1.7
[1.1.6]: https://github.com/17sho/pass-vault-v2/compare/v1.1.5...v1.1.6
[1.1.5]: https://github.com/17sho/pass-vault-v2/compare/v1.1.4...v1.1.5
[1.1.4]: https://github.com/17sho/pass-vault-v2/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/17sho/pass-vault-v2/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/17sho/pass-vault-v2/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/17sho/pass-vault-v2/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/17sho/pass-vault-v2/compare/v1.0.0...v1.1.0
[0.1.0]: <REPOSITORY_URL>/releases/tag/v0.1.0
