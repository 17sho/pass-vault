# 自定义资料（Cloudflare 版）验收规格

## 目标与范围

新增统一的浏览器加密资料类型 `custom`，用于保存银行卡、身份证件、API 凭据、服务器、软件许可及空白资料。模板仅预填字段，不产生多个新资料类型。

- 仅修改、测试并部署 Cloudflare Worker/前端。
- 不修改、运行或部署 `apps/server`、Linux 服务和服务器版测试。
- 顶部“账号 / 网站 / 笔记 / TOTP / 附件”保持不变。
- 不新增服务端明文索引或明文字段表；服务端继续只保存统一 envelope、版本号和密文。

## 入口与导航

1. `+ 新建` 增加“自定义资料”。
2. 选择后进入模板选择：空白资料、银行卡、身份证件、API凭据、服务器、软件许可。
3. `更多 → 自定义资料` 打开二级资料列表，不增加顶部分类按钮。

## 数据契约

```json
{
  "type": "custom",
  "title": "香港服务器",
  "template": "server",
  "groupId": "production",
  "tagIds": ["cloudflare"],
  "notes": "仅允许密钥登录",
  "fields": [
    {"id":"field-1","label":"IP地址","type":"text","value":"192.0.2.10"},
    {"id":"field-2","label":"密码","type":"secret","value":"..."}
  ]
}
```

- 字段类型：`text | secret | url | date | textarea | number`。
- 字段具有稳定 ID；数组顺序即显示顺序。
- 模板选择后字段可增删、改名、改类型和排序；改类型不丢值。
- 标题必填；字段名称必填；数量和长度使用严格上限。
- 整条明文仅在浏览器内存在，加密后上传。

## 模板

- 空白资料：无字段。
- 银行卡：持卡人(text)、卡号(secret)、有效期(date)、安全码(secret)、账单地址(textarea)、客服电话(text)。
- 身份证件：证件号(secret)、签发日(date)、到期日(date)。
- API凭据：Endpoint(url)、API Key(secret)、API Secret(secret)、权限范围(text)、到期日期(date)。
- 服务器：IP地址(text)、SSH端口(number)、用户名(text)、密码(secret)、管理后台(url)。
- 软件许可：许可证(secret)、版本(text)、到期日(date)。

## 新建与编辑

- 基础信息沿用现有标题、分组、标签和备注控件。
- 资料字段顺序：拖动手柄、名称、内容、类型相关操作、编辑字段、删除。
- 添加/编辑字段使用产品自有弹窗，不使用原生 select/alert/prompt/confirm。
- 敏感字段默认隐藏并可显示/隐藏；普通字段无显示按钮。
- 离开存在未保存修改时显示自有确认弹窗。
- 320px/390px 下标题和底部操作固定，中间区域内部滚动，无背景滚动和横向溢出。

## 列表与详情

### 二级列表

仅显示：标题、模板名、一个非敏感摘要字段、分组/标签、置顶状态。绝不显示 secret 字段或银行卡/CVV/API Secret 等敏感值。

支持搜索、分组筛选、标签筛选和排序。

### 详情

- text/number/date：复制。
- secret：默认隐藏，显示/隐藏、复制。
- url：安全打开、复制。
- textarea：复制全部、选择复制。
- 详情操作：置顶、编辑、克隆、移动分组、管理标签、删除。

## 现有系统集成

`custom` 必须进入：

- 全站搜索（仅标题、模板、非敏感字段；禁止 secret 内容进入搜索）。
- 标签筛选和标签管理。
- 分组管理和批量设置分组。
- 置顶排序。
- 回收站、恢复和永久删除。
- 加密备份及恢复，兼容旧备份和未知字段保留。

## 安全与生命周期

- 请求体、日志、遥测、localStorage、DOM 持久属性不得包含字段明文。
- 锁库、退出、切后台隐私遮挡、关闭详情/编辑器时清理已显示敏感值及暂存状态。
- URL 仅允许安全协议。
- 克隆生成新资料 ID 和新字段稳定 ID。
- 所有异步保存受会话代际和防重复提交保护。

## TDD 与发布门禁

1. 每个纵向行为先写测试并观察预期 RED，再实现 GREEN。
2. 契约、加密请求体、模板、列表摘要脱敏、详情操作、编辑排序、搜索、分组/标签/置顶、回收站、备份恢复均有直接测试。
3. Chromium + WebKit，320px + 390px。
4. `node scripts/build.mjs`、语法检查、CF Worker typecheck、生产资产测试、`git diff --check`、Wrangler production-config dry-run。
5. 独立安全/UI审查通过后，仅部署 Cloudflare。
6. 生产验证缓存版本、D1、Passkey RP/Origin、控制台、临时账户全流程并清理测试数据。
