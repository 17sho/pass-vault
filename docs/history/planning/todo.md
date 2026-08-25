# 全仓库装修任务清单

- [ ] P0-1：完成工作区卫生审计，只清理确认无用的测试临时数据库
- [ ] P0-2：增加 GitHub CI、Issue/PR 模板和 CODEOWNERS
- [ ] P1-1：重做 README 首页与双语导航
- [ ] P1-2：整理 docs 目录、ADR 和开发/运维入口
- [ ] P2-1：审计 shared/ 与双后端契约，补齐漂移测试
- [ ] P2-2：整理 API client、crypto/session、attachment lifecycle 模块边界
- [ ] P3-1：建立前端 design tokens 和全局壳层
- [ ] P3-2：重做认证、安全中心、主列表、分组和批量工具栏
- [ ] P3-3：重做五类资料编辑/详情/附件/回收站视觉与响应式行为
- [ ] P4-1：安全、性能、日志和敏感信息门禁
- [ ] P5-1：最终独审、全量测试、双端制品与 GitHub 发布

## 当前基线

- 当前版本：1.1.71
- 当前分支：backup/group-management-v5-20260731
- 当前远程 main：以本地 `git rev-parse HEAD` 和 `git ls-remote origin refs/heads/main` 复核
- 当前全量测试：331/331 PASS（上一轮已验证）
- 当前工作树：开始本计划时干净；计划文件本身是本轮新增变更

## 规则

每完成一项必须更新状态并运行对应验证；不要把“写了计划”当成产品装修完成。产品层变更必须保留零知识、会话代际、附件一致性和双端独立数据边界。
