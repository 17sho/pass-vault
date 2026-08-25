# Pass Vault V2 v1.1.33

[跳转到 English](#english)

## 中文

### 修复

- 附件右侧详情面板中的分组信息、图片/视频预览和创建时间统一增加 24px 左右内边距。
- 预览内容不再紧贴面板边框，并与详情标题形成一致的内容对齐线。
- 图片和视频最大宽度同步扣除两侧内边距，避免窄窗口横向溢出。

### 验证

- 新增 1440px 桌面附件详情几何回归，实测正文各项左边距为 24px，预览右侧至少保留 24px。
- 完整自动化回归 124/124 通过。

<a id="english"></a>
## English

### Fixed

- Added consistent 24px horizontal spacing for attachment metadata, image/video previews, and creation timestamps.
- Preview content no longer touches the detail panel border and aligns with the detail header.
- Preview maximum width accounts for both gutters to prevent horizontal overflow.
