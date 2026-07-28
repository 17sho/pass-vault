# v1.1.58 — iPhone回收站确认弹窗布局修复

## 中文

- 修复iPhone Safari中“彻底删除”和“清空回收站”确认框内容、按钮贴近弹窗边缘的问题。
- 手机端采用16px内容内边距、8px按钮间距、等宽双列操作按钮和44px触控高度。
- 长条目名称可安全换行，320–430px视口无横向溢出。
- Chromium与WebKit多宽度几何回归通过；完整测试179项通过。

## English

- Fix edge-hugging content and actions in the trash permanent-delete and empty-trash confirmations on iPhone Safari.
- Use 16px mobile content padding, an 8px action gap, equal-width two-column actions, and 44px touch targets.
- Long item names wrap safely without horizontal overflow across 320–430px viewports.
- Multi-width Chromium/WebKit geometry coverage and all 179 tests pass.

> 本版本继续采用纯文字Release，不附加安装压缩包。
