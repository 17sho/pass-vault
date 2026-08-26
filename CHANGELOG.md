# Changelog

## v2.2.3

- Raises mobile text controls to at least 16px and applies the explicitly chosen fixed-scale viewport to the main and secure-share pages, preventing iOS focus zoom while disabling pinch zoom.
- Keeps mobile row menus inside the list's visible interval so toolbar chrome cannot cover their actions.
- Makes mobile detail exits fully transparent before DOM cleanup to remove the WebKit return-to-list end-frame jump.
- Clears editor baselines and recovery/marker client registries at privacy and lock boundaries to prevent stale sensitive state from crossing sessions.
- Adds Chromium/WebKit regressions for viewport policy, menu hit targets, animation completion/opacity, and sensitive-state lifecycle.
- Requires no new D1 migration from v2.2.2; Cloudflare-only release, with no Linux production verification in this cycle.

## v2.2.2

- Refactors the Cloudflare core Worker and Admin Worker into clearer runtime, HTTP, authentication, and UI module boundaries without adding deployment targets.
- Extracts low-coupling browser domains for dialog helpers and password generation while preserving existing UI, API, and cryptographic behavior.
- Replaces repeated list-animation `indexOf` lookups with linear map indexing and adds a regression gate.
- Stabilizes WebKit dialog geometry tests at animation completion and tightens final geometry tolerance to 1px.
- Adds repository-wide module, dependency-cycle, syntax, cache-identity, build-closure, release-membership, and dead-code gates.
- Removes an unreferenced legacy visibility SVG factory.
- Requires no new D1 migration from v2.2.1.

## v2.2.1

- Cloudflare Admin adds user suspension, privacy-aggregated security events, deduplicated notifications, bounded D1/R2 maintenance, and allowlisted JSON/CSV export.
- Main Worker fails closed for suspended users across password, Passkey, established-session, registration-finalization, and attachment-compensation paths.
- Adds `0034_admin_control_center.sql` and hardened maintenance/reporting audit contracts.
- Improves Cloudflare login typography for 14/16px readable text hierarchy.
- Cloudflare-only release; Linux archives are not produced or published. Shared frontend files remain compatible with the Linux build, but the Linux runtime was not released or production-verified in this cycle.

## v2.2.0

### Added / 新增

- 加密条目与附件历史、浏览器内差异比较、版本恢复和完整恢复中心。
- 安全分享 v2：多资料包、附件、可选密码、精确到期/查看限制和匿名加密对象读取。
- 加密收藏/置顶注册表及跨标签页字段级冲突合并。
- 独立 Cloudflare Admin Worker：用户/资源概览、安全事件、维护任务、四维用户配额、分级预警、风险筛选及配额调整历史。

### Security / 安全

- 主 Worker 在条目、附件、替换和备份导入写路径原子执行配额，消除 Admin-only 与 TOCTOU 绕过。
- 分享 manifest/对象采用随机 package key、AES-GCM、token/object AAD；密码通过 PBKDF2-SHA-256（310,000 次）包装密钥且不离开浏览器。
- 管理审计仅展示非敏感字段；安全事件仅保存聚合分类与计数。
- R2 回收检查当前附件、历史附件及分享引用，并用条件更新避免并发重复记账。

### Changed / 变更

- 回收站升级为支持预览、批量恢复和批量永久删除的恢复中心。
- Cloudflare 包现在同时包含主 Worker、D1 migrations 与脱敏 Admin Worker 配置模板。
- 新增 D1 migrations `0021`–`0028`。

### Compatibility / 兼容性

- 旧安全分享 v1 保持兼容。
- 新增 migrations 与 Admin/分享/历史能力属于 Cloudflare 运行时；Linux 包继续独立提供，但本轮未部署或生产验证 Linux 新路径。

## v2.1.0

### Added / 新增

- 自定义资料：支持空白资料与六种内置模板，可添加、排序和选择文本、密码、网址、邮箱、电话、日期、多行文本等字段类型。
- 加密个人模板：仅保存字段结构和顺序，不复制资料内容；模板随密码库密文同步，并可复用、管理和删除。
- 标签、收藏夹、隐私模式及更完整的跨分类整理流程。
- Cloudflare 管理面板：提供注册控制、用户与审计操作、配额和系统状态视图。

### Improved / 改进

- 自定义资料已接入搜索、分组、置顶、回收站、批量操作和加密备份恢复。
- 调整移动端弹窗、标签筛选、详情和操作菜单，在 Chromium 与 WebKit 的桌面及窄屏视口保持可用。
- 公开 Cloudflare 配置使用示例管理员邮箱，不包含生产域名、账户、资源 ID 或凭据。

### Database / 数据库

- 新增 Cloudflare D1 迁移 `0020_custom_entries.sql`，允许 `custom` 条目类型并保持既有密文与修订号不变。

## v1.1.72

### Security / 安全

- 条目和附件新增服务端revision CAS与删除tombstone，过期页面不能静默覆盖或在删除后复活对象。
- 上传、重命名、删除及补偿绑定发起时的session、CSRF、revision和vault key；锁库或切换账户后的迟到响应不能借用新会话继续写入。
- Cloudflare R2写入后失锁、D1失败与跨账户清理使用精确且限权的补偿路径。

### Reliability / 可靠性

- Cloudflare新增`0014`–`0016`迁移；Linux SQLite和Cloudflare D1均使用原子条件写入。
- 备份导入锁增加续租、所有权校验与fencing，并在成功或显式错误响应前释放。
- Linux附件删除改为持久化outbox，进程异常后可恢复清理。

### Verification / 验证

- 最终完整串行门禁`359/359`通过；三路独立审查、双端部署和Cloudflare Chromium/Linux WebKit生产烟测通过。
- 发布临时账户、子记录及附件对象已精确清理；生产配置与秘密不进入仓库或制品。

## v1.1.71

### Added / 新增

- 账号、网站、笔记、TOTP 与附件均支持在当前类型、分组、搜索结果和附件分类范围内批量设置分组、置顶、取消置顶和移入回收站。
- 同批软删除使用统一 `deletedAt`；批量删除笔记时，只联动未被其他存活笔记共享的附件。

### Security / 安全

- 批量设置分组、置顶、取消置顶、删除及失败补偿均绑定操作发起时捕获的 vault key 和会话代际，并在加密前与请求前校验，阻止锁库并登录第二账户后旧库密文跨会话写入。
- 置顶、分组和回收站状态继续保存在客户端加密 payload/附件 metadata 中，不增加服务端可见业务字段。

### Reliability / 可靠性

- 批量写入采用顺序提交、逆序补偿；补偿失败则重新加载权威密文，重载也失败时明确要求锁定并重新登录。
- Chromium/WebKit 覆盖 320px、失败补偿、五类资料以及锁库后登录第二账户再释放旧写入的竞态回归。

### Documentation / 文档

- 明确“共享前端”是同一套源码分别打包到 Cloudflare 与 Linux；两个部署不共用在线前端实例、账户、数据库或附件，也不自动同步生产数据。
- 补全中英文架构、API、发布、贡献、安全和双端部署说明。

## v1.1.70

- 批量写入绑定发起操作时捕获的密码库密钥与会话代际，并在加密后、请求前再次验证，阻止锁库并切换账户后旧库密文写入新会话。
- 新增锁库后登录第二账户的竞态回归测试，以及 Chromium/WebKit 320px 批量栏溢出与触控尺寸验证。

## v1.1.69

### Added / 新增

- 现有批量选择栏新增“置顶所选 / 取消置顶所选”和“删除所选”，范围继续限定在当前分类、分组、搜索结果及附件分类筛选。
- 账号、网站、笔记、TOTP 与附件均支持批量置顶和批量移入回收站；批量删除笔记时，其未被其他未删除笔记引用的附件一并软删除，30 天内可恢复。

### Reliability / 可靠性

- 批量写入使用目标状态而非翻转，并复用补偿式一致性：中途失败逆序恢复已写入项；补偿失败时重新加载权威密文；重载失败明确要求锁定后重新登录。
- Chromium 与 WebKit 手机视口覆盖置顶、取消置顶、删除确认、五类资料、附件关系和 390px 无横向溢出。

## v1.1.68

### Added / 新增

- “更多”新增“批量设置分组”：在当前分类、当前分组与当前搜索结果范围内多选或全选，并统一移动到默认或该类型的自定义分组。
- 账号、网站、笔记、TOTP 与附件使用同一交互和加密写入语义，Cloudflare 与 Linux 双运行时保持一致。

### Reliability / 可靠性

- 批量写入中途失败时补偿已成功项目；补偿失败则重新加载服务端权威密文，同时保留选择以便重试。
- Chromium 与 WebKit 手机视口覆盖 44px 触控区、无横向溢出、刷新持久化及“全部”哨兵不持久化。

## v1.1.67

### Fixed / 修复

- 加固 Linux 备份导入、附件替换/删除及同账户并发边界，保留当前账户包装材料并使用原子文件切换。
- 统一 Linux 匿名认证 POST 的同源与 JSON 门禁；记录密码、Passkey 和旧会话认证方式。
- 锁库清除主密码表单、编辑器敏感 DOM 与附件预览引用，并用保险库代际阻止迟到备份导入/导出继续执行。
- 明文迁移在任何上传前完成全部本地加密与校验，避免本地失败造成部分导入。
- Linux systemd 模板增加严格权限、设备/主目录/内核/控制组保护和重启退避。

### Packaging / 打包

- 同时发布经过范围隔离的 Cloudflare 与 Linux tar.gz/zip 制品及统一 SHA256SUMS。
- Cloudflare 制品包含 `0011`–`0013` R2 生命周期迁移与补偿修复；所有示例配置保持占位和脱敏。

## v1.1.66

> Release scope: GitHub publishes Cloudflare artifacts only. The stable Linux artifact remains v1.1.65 while Linux packaging is held back for separate verification.

### Added / 新增

- 新增可撤销的服务器辅助 Passkey：先在已认证会话中注册；后续可在没有现有会话时通过匿名 Passkey challenge 和平台用户验证恢复服务器包装的保险库密钥，并创建新会话。
- Cloudflare Worker/D1 与 Linux Node.js/SQLite 使用相同 AES-256-GCM 包装协议，并分别配置独立 KEK、精确 RP ID 与 canonical Origin。
- Cloudflare 新增 `0009_passkey_assisted_unlock.sql`；Linux 启动时幂等创建凭据、challenge 与失败限速表。

### Security / 安全

- 明确披露可选功能改变原纯客户端零知识边界：服务器配合一次通过用户验证的 Passkey 会话可以恢复保险库密钥，但不保存主密码、生物信息或明文保险库密钥。
- 双后端强制一次性 challenge、UV、精确 RP/Origin、CSRF、凭据归属、counter CAS 与验证前失败限速预占；修改主密码或用户名会撤销全部辅助凭据。
- 前端新会话后续解锁失败或认证代际变化时执行补偿 logout；所有浏览器测试钩子仅在 loopback hostname 生效。

## v1.1.65

- 允许已完成用户验证的系统同步型平台凭据用于快速解锁，兼容 iPhone Safari、Chrome 及现代移动密码管理器。
- 快速解锁包装材料保存在当前浏览器，并继续绑定当前账户、公开会话 ID、精确凭据 ID 与 PRF；浏览器配置或整机数据迁移可能带走该材料。
- 明确披露系统凭据和浏览器数据迁移边界；仅同步凭据而没有匹配本地记录与原绑定有效会话时不能解锁。
- 固定并升级 Cloudflare 本地测试/部署工具链（Miniflare 4.20260722.1、Wrangler 4.115.0），修复 Sharp/libvips 已知高危漏洞；生产运行依赖不变。

## [1.1.64] - 2026-07-29

### Fixed / 修复
- 修复iPhone Safari完成平台用户验证后，因注册响应仅通过标准CBOR `attestationObject.authData`提供验证器标志而被误报“未完成本机用户验证”的问题。
- 在缺少`getAuthenticatorData()`便捷接口时严格解析标准attestation数据；仍要求UV标志、拒绝可备份/同步凭据，并对缺失、截断或畸形CBOR安全失败。

## [1.1.63] - 2026-07-29

### Added / 新增
- 安全中心新增可选的“此设备快速解锁”；启用时再次验证当前主密码，并使用平台WebAuthn用户验证与PRF扩展保护本机包装的保险库密钥。
- 自动锁定后，锁定页显示独立的“使用此设备快速解锁”按钮；不支持WebAuthn PRF的浏览器继续使用主密码。

### Security / 安全
- 主密码、生物信息、裸保险库密钥和设备PRF输出均不发送至服务端；IndexedDB仅保存绑定用户名及当前公开会话ID的AES-256-GCM密文。
- 快速解锁会先验证当前HttpOnly会话、用户名和公开会话ID，再请求设备验证，避免旧CSRF材料在新会话中造成半解锁。
- 关闭功能、主动退出、修改用户名或主密码时删除本机材料并跨标签撤销入口；锁库期间迟到的WebAuthn结果不得恢复密钥或留下新记录。

## [1.1.62] - 2026-07-29

### Fixed
- Prevent repeated taps or form submissions while authentication is pending from sending duplicate login requests and creating duplicate sessions.
- Disable the authentication action with an in-progress label until success or failure, then safely restore it for retry.

## [1.1.61] - 2026-07-28

### Added / 新增

- “更多”新增安全中心，集中管理当前浏览器的自动锁定和剪贴板自动清除设置；会话区显示登录时间、最近活动、设备/浏览器类别与登录IP。
- 支持单独注销其他会话及一键注销其他所有设备，并始终保留当前会话。

### Security / 安全

- Cloudflare仅信任平台`CF-Connecting-IP`；Linux仅使用明确配置的可信头，拒绝多值/畸形IP并回退socket地址。
- 会话API仅暴露随机公开ID和必要元数据，不返回认证哈希、CSRF、Cookie、用户ID或完整User-Agent。
- 剪贴板定时清除前复核内容仍为密码库最后写入值，避免误清用户后来复制的内容；锁库立即取消待处理计时器及明文引用。
- Cloudflare新增`0008_session_metadata.sql`；Linux启动时幂等迁移，历史会话保留但显示未知IP/设备，无需重加密密码库。

## [1.1.60] - 2026-07-28

### Security

- Fix TOTP secret and code retention in hidden DOM after logout, idle lock, cross-tab lock, and successful credential changes. Locking now clears decrypted editor/list/detail DOM before awaiting server logout.
- Invalidate in-flight TOTP HMAC work on lock so a completed asynchronous calculation cannot write a code into an old connected node.
- Add browser regression coverage for immediate cleanup during delayed logout, credential changes, and in-flight TOTP calculation.

### Upgrade notice

- v1.1.59 was withdrawn because its lock paths could retain decrypted TOTP content in hidden DOM. Upgrade directly to v1.1.60. Cloudflare installations upgrading from v1.1.58 must apply `0007_totp_entries.sql`; installations that already applied it need no additional migration, and Linux performs the equivalent migration idempotently at startup. No vault re-encryption is required.

## [1.1.59] - 2026-07-28

### Added / 新增
- 新增独立TOTP菜单，录入账号与Base32密钥后在浏览器本地生成6位动态验证码、显示倒计时并自动刷新。
- TOTP支持加密分组、模糊搜索、置顶、最近查看、回收站与加密备份，旧四分类设置自动兼容。

### Security / 安全
- TOTP账号与密钥仅存在于客户端AES-256-GCM加密载荷，服务端只保存密文envelope；详情不直接展示密钥。
- 算法遵循RFC 6238默认SHA-1、30秒周期和6位输出，并通过标准向量及Chromium/WebKit端到端测试。
- Cloudflare新增`0007_totp_entries.sql`；Linux启动迁移幂等扩展类型约束并保留既有密文和创建时间。

## [1.1.58] - 2026-07-28

### Fixed / 修复
- 修复iPhone Safari回收站“彻底删除”和“清空回收站”确认弹窗内容与按钮贴边的问题。
- 手机宽度下统一16px内容内边距、8px按钮间距、等宽双列操作及44px触控高度；长名称可换行且不产生横向溢出。
- 新增Chromium/WebKit在320、390、430px视口下的双弹窗几何回归。

## [1.1.57] - 2026-07-28

### Fixed / 修复
- Linux原子部署健康门禁增加默认30次、每次1秒的有界重试，避免服务启动瞬间端口尚未监听时误触发回滚；超时后仍fail-closed并恢复旧版本。
- 部署前强制校验`package.json`版本与HTML资产缓存键，拒绝覆盖同版本目录；回滚重启失败明确记录`ROLLBACK_FAILED`。
- 生产烟测证据改为固定布尔白名单，清理句柄单独以0600保存；覆盖附件404、锁定清理、320px溢出，并通过健康接口核对后端。

## [1.1.56] - 2026-07-28

### Fixed / 修复
- **旧回收站附件兼容**：旧数据没有加密 `trashOwnerId` 时，仅在恰好一个已删除父笔记引用附件的情况下安全恢复父子关系；多父级歧义时保持独立，避免误恢复或误删。
- **过期清理可见重试**：超过 30 天的项目清理失败后保留密文项目，显示中文提示并在下次解锁时重试；补齐恰好 30 天与少 1 毫秒的边界回归。

### Security / 安全
- Linux 应用层补齐 `Permissions-Policy`，Caddy/Nginx 模板统一 HSTS、Permissions-Policy、Referrer-Policy 与 nosniff。
- 新增版本目录、权限归一化、原子软链切换、健康失败自动回滚、缓存重新验证和脱敏 JSON 证据工具；部署证据不记录凭据、Cookie、用户资料、密文或响应正文。

### Tests / 测试
- 增加已删除资料从最近查看、置顶排序、当前分类搜索和全站搜索排除，附件永久删除后内容端点 404，以及旧附件关系推断测试。
- 增加 Chromium/WebKit × SQLite/D1 的回收站生产冒烟脚本，覆盖软删除、恢复、永久删除和 320px 资源/控制台门禁。

## [1.1.55] - 2026-07-28

### Added / 新增
- **加密回收站**：账号、网站、笔记与附件普通删除改为软删除，默认列表、最近查看、置顶排序与全站搜索均隐藏已删除资料；“更多 → 回收站”支持恢复、逐项彻底删除与清空。
- **30 天保留期**：解锁后由客户端根据加密载荷中的删除时间清理过期项目；服务端仍只保存密文，不新增明文删除状态或索引。
- **笔记附件完整性**：删除笔记时，仅未被其他有效笔记引用的关联附件会以加密父级标识进入回收站并随父笔记恢复；彻底删除失败的附件转为独立回收站项目供重试，避免不可见孤儿对象或部分恢复。

### Security / 安全
- 彻底删除与清空回收站均使用明确危险文案和二次确认；普通删除不调用物理删除 API。
- 原分组不存在时恢复到默认分组；锁定或退出时关闭回收站并清空结果 DOM、解密对象和引用。

## [1.1.54] - 2026-07-27

### Added / 新增
- **更多菜单全站搜索**：对当前浏览器内已解密的账号、网站、笔记与附件元数据执行统一模糊搜索，结果显示资料类型和分组，点击后直接打开原有详情。
- **移动端搜索对话框**：固定标题与搜索框、结果区独立滚动，适配 390px iPhone WebKit、安全区和至少 44px 触控目标。

### Security / 安全
- 查询词与结果全程只在浏览器内处理，不新增搜索 API，不发送或跨标签广播任何查询词、标题、条目 ID、分组名或解密内容。
- 账号密码、密码历史与附件正文不参与搜索；锁定或退出时清空查询、结果 DOM 与内存结果引用。

## [1.1.53] - 2026-07-27

### Security / 安全
- **严格执行移动端后台自动锁定**：记录最后活动时间，页面从后台重新可见或通过 `pageshow`/BFCache 恢复时按真实经过时间判断；若已超过设置时长，立即清除内存 vault key 与解密数据，不再因 iOS Safari 冻结定时器而重新获得一个完整锁定周期。
- **多标签页联动锁定**：同一账户任一标签页自动锁定或退出，其余已解锁标签页同步清除内存密钥并回到登录页；广播不包含条目身份、标题、密文或密钥。

### Added / 新增
- **完整加密备份**：导出时可选择“完整备份（资料与附件）”或“仅资料”；完整备份使用 v2 格式，附件内容及元数据均保持客户端密文。
- **导入预览与安全恢复**：恢复前展示资料与附件数量并二次确认；导入时保留当前账户的 KDF 与包装密钥，拒绝无法用当前 vault key 解密的备份，确保恢复后原主密码仍有效。
- **多标签页资料同步**：条目、分组、附件或备份恢复成功后通知其他同账户标签页重新拉取密文并在本地解密；若正在操作对话框则延迟到关闭后刷新，避免覆盖未保存输入。

### Fixed / 修复
- 锁定或退出后认证界面统一复位为“登录并解锁”，修复新注册后退出时按钮偶尔仍显示“创建并进入”。
- 新增 Chromium/WebKit 后台恢复、多标签页同步及完整附件备份恢复回归测试。

## [1.1.52] - 2026-07-26

### Fixed / 修复
- **修复分组管理中「当前选中项」青绿色边框在 iOS Safari 被右边缘裁切**:选中态此前用 `outline` + `outline-offset:2px` 绘制,outline 画在元素框**外侧**;在「全部/默认」这类占满整行宽度、右侧无按钮的选中项上,outline 向右外扩约 5px 溢出到 `#groups-list`(`overflow:auto` 滚动容器,右内边距仅 3px)之外,被容器右边缘/滚动条 gutter 裁切,导致绿框右边显示不完整(iOS Safari 尤其明显)。改用 `inset box-shadow`(绘制在元素框**内侧**)+ 同色 `border-color` 表示选中,边框永不溢出容器,四条边始终完整;键盘 `:focus-visible` 仍保留常规聚焦轮廓(改为 `outline-offset:-4px` 内置,避免同样溢出)。
- 新增回归测试:在列表可滚动状态下选中全宽项,断言选中框使用 inset box-shadow、不再用 outline,且右边界不溢出滚动容器。

## [1.1.51] - 2026-07-26

### Changed / 优化
- **分组管理对话框:删除按钮改为危险红色以区分**:每个分组行的「删除」按钮此前与「重命名」样式完全相同(同为普通色),危险操作缺乏视觉区分、易误删。现将「删除」按钮文字与边框改为危险色(`--danger`,暗色下为柔和红),「重命名」保持普通色。
- **列表按钮触控区增大到 ≥44px**:分组行内「分组名/重命名/删除」按钮的最小高度提升到 44px,符合移动端触控目标标准,减少误触。
- 新增回归测试:断言分组删除按钮带 `group-remove` 类且为危险色、重命名按钮非危险色、两者触控高度均 ≥44px。

### 说明
- 经 DOM 实测,原对话框已具备 sticky 标题头 + 列表内部滚动、底部创建按钮有 20px 留白、删除按钮距右边缘 23px(未贴边),故本次仅针对真实缺陷(删除按钮无危险色区分、触控区偏小)优化,未做冗余改动。

## [1.1.50] - 2026-07-26

### Fixed / 修复
- **修复手机端详情页返回动画的卡顿感**:返回时的退场动画(`mobile-detail-out`,180ms)此前用固定 `setTimeout(180)` 等待后即替换 DOM,但动画实际启动有约 40–55ms 的浏览器延迟,导致定时器到点时动画尚未播完(约剩 25ms 未归位),DOM 被 `replaceChildren` 提前替换、动画被 `animationcancel` 强制中断 —— 视觉上表现为返回时"跳一下/卡顿"。改为监听真实 `animationend`/`animationcancel` 事件(新增 `animationDone()` 辅助,带兜底超时与 reduced-motion 直通)后再替换 DOM,动画完整播放到结束。
  - 客观帧率实测(Playwright + rAF 采样):修复前 6× CPU 节流下有掉帧且动画被取消;修复后桌面与 6× 节流下均 0 掉帧、`start→end` 完整。
  - 新增回归测试断言退场动画恰好触发一次 `animationstart`+`animationend`、零 `animationcancel`,且 DOM 在 `animationend` 之后才替换。

## [1.1.49] - 2026-07-26

### Fixed / 修复
- **补齐两个对话框的内边距**:全面审计全部 14 个对话框的内边距后,发现「新建资料选择器」(`#picker`)与「确认删除」(`#delete-dialog`)既无表单内边距也无对话框层内边距(实际 padding 均为 0),导致选项/内容贴到四周、底部圆角被顶掉呈平截贴边。为二者补 `form{padding:24px}`,底部圆角与四周留白恢复正常。
- 至此所有对话框均具备内边距(表单层或对话框层),不再有 padding 为 0 的裸对话框。

## [1.1.48] - 2026-07-26

### Fixed / 修复
- **自动锁定时间对话框布局修复**:`#idle-lock` 对话框此前缺少表单内边距(命中不到 `#editor/#attachment-upload/#rename-dialog form` 的 padding 规则,实际 padding 为 0),导致选项贴到对话框四周、底部圆角被内容顶掉、呈现平截贴边。现为其补齐 `padding:24px` 与选项区间距,底部圆角与四周留白恢复正常。
- 修复 iOS Safari 下打开对话框时标题聚焦产生的蓝色 outline:为 `#idle-lock-title:focus` 补上与 `#picker-title` 一致的 `outline:none;box-shadow:none`。
- 将 `#idle-lock` 表单由 `<form method="dialog">` 改为普通 `<form>`,与其它选择类对话框(如新建类型选择器)结构保持一致。

## [1.1.47] - 2026-07-26

### Added / 新增
- **自动锁定时间可设置（设置项）**：菜单新增「自动锁定时间」入口,可在 1 / 5 / 15 / 30 分钟与「从不」之间选择,菜单按钮实时显示当前值。选择通过 `localStorage`(键 `pass-vault-idle-lock-ms`,单位毫秒)持久化;选「从不」则不启动空闲计时器。此前自动锁定时长写死为 5 分钟且无法在界面调整,本次开放为用户可配置。测试钩子 `window.__IDLE_LOCK_MS` 优先级仍最高(仅供 E2E)。

### Fixed / 修复
- 修复初始化时因 `const IDLE_LOCK_CHOICES` 暂时性死区(TDZ)导致 `updateIdleLockControl()` 抛异常、中断后续事件绑定的问题:将初始化调用移至相关常量与函数定义之后。

## [1.1.46] - 2026-07-26

### Added / 新增
- **密码生成器（功能4）**：账号编辑器每组密码旁新增「生成」按钮，展开面板可调长度（12–64，默认 20）与字符集（大写/小写/数字/符号，默认全选）。使用 `crypto.getRandomValues` 无偏拒绝采样，保证每个所选字符集至少出现一位，随机洗牌后填入。默认字符集已排除易混字符（0/O、1/l/I）。生成完全在浏览器内进行，不产生网络请求。
- **空闲自动锁定（功能2）**：登录后启动空闲计时器，默认 5 分钟无操作自动锁库——清空内存中的 vault key 与解密数据并回到解锁界面。`click`/`keydown`/`pointerdown`/`touchstart` 及页面重新可见都会重置计时器。锁定与「退出登录」共用清理逻辑，区别在于自动锁定不主动注销服务端会话。

## [1.1.45] - 2026-07-26

### Added / 新增
- **密码历史与修改时间（功能6）**：账号类型每次保存时记录 `updatedAt`，编辑改动密码时把旧密码压入加密的 `passwordHistory`（每行 `{username,password,changedAt}`，最多保留 10 条）。详情页显示「更新于」时间，并提供可展开的密码历史（逐条按需显示/复制旧密码）。所有历史仍在客户端加密，永不进入服务端可见字段，零知识边界不变。
- **最近查看（功能7）**：打开任一条目（账号/网站/笔记/附件）时在浏览器内记录 `{type,id,at}`，去重后按时间倒序、最多 20 条，加密持久化于保留的 `recents_registry` settings envelope。当前分类无搜索词时，列表顶部以胶囊形式展示「最近查看」，可一键打开。采用跨设备同步方案（B）：换设备重新登录后仍保留；服务端仅可见该 settings envelope 的写入时间，看不到条目身份。

### 契约 / Contract
- `SETTINGS_ID` 扩展为 `SETTINGS_IDS`（`settings_registry` + `recents_registry`），`validEnvelope` 放宽为允许这两个固定 settings id；新增 `normalizeRecents` 校验（结构、上限、时间戳边界、去重保留最新）。
- account 明文白名单纳入 `updatedAt`/`passwordHistory` 并加结构校验；旧版顶层 `username/password` 结构仍兼容。

## [1.1.44] - 2026-07-26

### Fixed / 修复
- 修复夜晚模式下附件页「全部附件」分类筛选下拉（`#attachment-filter`）仍为白底浅字、几乎不可读的问题：该 `<select>` 的 ID 规则硬编码 `background:#fff` + 浅色边框，其特异性高于深色主题的 `select` 元素规则，导致深色覆盖不生效。现已将 `#attachment-filter` 显式纳入深色输入表面清单（`var(--input-bg)` + `var(--input-line)`），与搜索框一致。

## [1.1.43] - 2026-07-26

### Fixed / 修复
- 修复夜晚模式下条目详情顶部工具栏（返回/标题/置顶/编辑/删除）仍为白色背景的问题：深色主题覆盖清单遗漏了 `.detail-head`，导致移动端 sticky 头部保留浅色 `#fff` 背景，其上为深色主题设计的浅灰标题文字压白底、几乎不可读。现已纳入 `var(--surface)` 深色表面。

## [1.1.42] - 2026-07-26

### Security / 安全
- 修复反向代理后登录/注册限流退化为全局单桶的问题：新增 `CLIENT_IP_HEADER` 配置，按可信来源头（生产用 Cloudflare `cf-connecting-ip`）识别真实客户端 IP。此前所有请求的来源 IP 均为反代的 `127.0.0.1`，攻击者每分钟 10 次失败尝试即可连坐锁定全站用户登录（拒绝服务）。
- 未配置 `CLIENT_IP_HEADER` 时安全回退为直连 socket IP，且忽略客户端伪造的转发头；部署示例（systemd/nginx）同步加入头覆盖说明。

## [1.1.41] - 2026-07-26

### Added / 新增
- 增加白天与夜晚模式，可在顶部「更多」菜单中一键切换。
- 首次使用跟随系统主题，手动选择后在本机持久化，刷新与重新登录后保持。
- 深浅主题覆盖页面、卡片、详情、弹窗、输入框、菜单、附件预览和危险操作区域。

### UX / 体验
- 主题颜色、边框、阴影以 360ms 平滑过渡，不触发布局动画。
- 首帧前加载同源主题初始化脚本，避免深色用户刷新时闪白。
- 尊重 `prefers-reduced-motion`，减少动态模式下立即完成切换。

## [1.1.40] - 2026-07-25

### Fixed
- 保存异步回调缓存 form 元素，避免 `e.currentTarget` 变 null 导致运行时错误
- 手机端新建/编辑弹窗：字段区内部滚动，背景列表不再跟着滑；保存按钮可滚到并固定底部可见
- 弹窗打开时锁定页面滚动，关闭后恢复
- 保存防重复提交：连点「保存」不会再生成重复条目（账号/网站/笔记）
- `dialog[open]` 才使用 flex 布局，避免关闭后弹窗仍可见


## [1.1.39] - 2026-07-22

### Added / 新增
- 笔记详情正文增加小按钮：复制全部、选择复制。
- “选择复制”首次选中全文，已有选区时只复制选中部分，便于手机局部复制。

## [1.1.38] - 2026-07-22

### Fixed / 修复
- iPhone Safari 等 WebKit 浏览器打开 PDF 附件时不再显示空白框。
- PDF 改为浏览器本地解密后用 PDF.js 渲染到 canvas，并支持上下页。

### Changed / 变更
- 构建产物增加 `dist/vendor/pdf.min.mjs` 与 `pdf.worker.min.mjs`。

## [1.1.37] - 2026-07-22

### Added / 新增
- 附件详情内置预览：PDF iframe、文本内容、音频播放；未知类型仍可下载。

### Security / 安全
- CSP 增加 `frame-src 'self' blob:`，允许解密后的 PDF 本地预览。

## [1.1.36] - 2026-07-22

### Fixed / 修复
- 手机进入资料详情后再打开顶部“更多”菜单，不再被详情顶栏遮挡。

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
