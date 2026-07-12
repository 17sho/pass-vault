# Pass Vault V2 v1.1.19

## 中文

- 修复分组弹窗打开时焦点落在关闭按钮的问题；现在“全部”“默认”或当前自定义分组会立即获得焦点。
- 当前分组具有唯一的 `aria-pressed="true"` 状态与可见绿色焦点环，选择导致列表重绘后焦点仍保持。
- 关闭弹窗后焦点返回分组触发按钮，关闭按钮仍可通过键盘访问。

## English

- Fixed the Groups dialog initially focusing its close button; All, Default, or the active custom group now receives focus immediately.
- The current group has the sole `aria-pressed="true"` state and a visible green focus ring, retained after selection rerenders the list.
- Closing restores focus to the Groups trigger while the close button remains keyboard reachable.