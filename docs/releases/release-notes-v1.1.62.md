# v1.1.62 - Login submission stability

## 中文

### 修复
- 登录请求处理中立即禁用提交按钮，连续点击或重复提交只发送一次登录请求，避免短时间生成多条重复会话。
- 登录成功或失败后统一释放互斥状态；失败后仍可正常重试。

### 验证
- WebKit/iPhone回归测试在400毫秒延迟登录响应下连续提交三次，确认仅产生一个`POST /api/login`。
- 完整测试、lint、TypeScript、构建、双平台打包和生产烟测均作为发布门禁。
- 无数据库迁移；Cloudflare和Linux数据仍完全独立。

## English

### Fixed
- Disable authentication submission immediately while a request is pending so repeated taps or form submissions send only one login request and do not create duplicate sessions.
- Release the submission lock after either success or failure so failed sign-ins remain retryable.

### Verification
- A WebKit/iPhone regression submits the form three times while the login response is delayed by 400 ms and asserts that only one `POST /api/login` is sent.
- Full tests, lint, TypeScript, build, both release packages, and production smoke checks remain release gates.
- No database migration; Cloudflare and Linux data remain fully independent.
