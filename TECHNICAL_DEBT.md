# 技术债与已证实差距

> 本清单记录源码可观察到的限制、目标方案未覆盖项与明确的测试/运维缺口。未做全量安全渗透或生产验收，不将未证实项定性为漏洞。

## P0 / 架构目标阻塞

### 1. Module SDK 与生命周期缺失

存在 Nuxt layer 挂载、schema/table 注册函数及 Blog 示例，但未发现统一 manifest、依赖检查、模块版本、生命周期、启停、卸载、统一 API/权限/菜单/迁移注册契约。README 所称独立 nav/doc 仓库不在当前检出中。后续应先对现有扩展接口定型，再实现 SDK，避免将目录扫描误作完整模块系统。

证据：[`nuxt.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/nuxt.config.ts#L17-L40)、[`blog.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/extends/blog/server/plugins/blog.ts#L33-L76)、[`tables.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/tables.ts#L887-L913)。

### 2. 复杂权限、多租户与字段级权限未形成统一引擎

当前角色有权限字符串与 `all/self` 数据范围；通用 CRUD 的 `self` 过滤依赖各表配置 `userTable`/`ownerColumn`。未配置或无法解析时过滤条件可能不生成；权限引擎未涵盖附件提出的 ABAC、组织/部门/任教关系、字段读写权限和统一 `authorize` API。当前主 schema 未见 Tenant、Organization、Membership 通用模型，也未发现 PostgreSQL RLS 的用户上下文/事务集成。

这对 SIS 教师-班级-学科-学生的动态授权尤其关键；不得仅靠前端隐藏按钮或通用角色判断。

证据：[`schema.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/database/schema.ts#L18-L68)、[`tables.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/tables.ts#L717-L762)、[`crudService.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/crudService.ts#L392-L444)。

### 3. 统一审计能力不足

CRUD 的版本快照仅对配置启用 `features.versions` 的表保存有限旧值，不等同于覆盖操作者、组织、模块、操作结果、前后值、请求来源等字段的统一审计。seed 中存在移除 `audit_logs` 表的逻辑，代码中未发现相应统一审计服务的完整写入路径。

证据：[`crudService.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/crudService.ts#L748-L793)、[`seed.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/database/seed.ts#L443-L444)。

## P1 / 可靠性与扩展性

### 4. 迁移管理分裂

宿主使用 Drizzle Kit 迁移，Blog layer 使用单独幂等 DDL。没有可见的跨模块顺序、统一状态、回滚/恢复编排；新增模块时必须定义失败恢复及版本兼容策略。

证据：[`drizzle.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/drizzle.config.ts#L4-L16)、[`migrate.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/extends/blog/server/database/migrate.ts#L4-L18)。

### 5. 进程内实时状态

WebSocket peer/在线状态注册及消息频率限制使用进程内 Map；横向多实例时状态不共享，也没有可见的 Redis Pub/Sub 适配。

证据：[`wsRegistry.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/wsRegistry.ts#L11-L57)、[`ws.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/ws.ts#L3-L27)。

### 6. 文件存储抽象与访问策略

实际文件内容写入本地 `storage/`；数据库中的 `storage` 字段并不能证明云存储 provider 已实现。文件预览/下载路由按路径查找记录并回传流，所审阅的 serve handler 中没有身份/所有权检查；上传类型依赖 multipart 提供的 MIME 声明。需先核验产品预期可见性，再明确私有/公开授权策略及内容类型验证。

证据：[`fileStorage.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/fileStorage.ts#L6-L42)、[`serve route`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/files/serve/%5B...path%5D.get.ts#L3-L23)、[`upload route`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/files/upload.post.ts#L31-L75)。

## P1 / AI Agent 能力差距

### 7. 当前 LLM 聊天不等于 Agent Runtime

现有实现支持 OpenAI 兼容流式对话；审计未发现通用工具注册、工具输入/输出 schema、执行时授权、Query/Command 分离、用户确认、工具调用审计、上下文持久化、固定 UI Registry 或持久化 Workflow。AI Agent 应建立在现有 LLM provider 接入上，但不能把 prompt 或聊天接口作为权限边界。

证据：[`llm.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/llm.ts#L34-L105)、[`llm/ws.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/llm/ws.ts#L42-L59)。

## P2 / 测试与交付

### 8. 关键领域专项测试缺口

测试目录中未发现 OAuth/OIDC 端到端专项、会员/Stripe/支付宝全流程专项测试；部分 WebSocket/LLM/通知/消息/文件服务有单测，但不等同于浏览器或生产 provider 集成验证。通用 CRUD 纯函数测试不覆盖完整路由鉴权链。应针对权限边界、支付回调幂等、迁移升级和文件访问补集成测试。

证据：[`vitest.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/vitest.config.ts)、[`dashboardCrudGeneric.test.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/test/unit/server/dashboardCrudGeneric.test.ts#L1-L10)。

### 9. 仓库级 CI/CD/容器化定义未发现

对当前根目录检查未发现 `.github` workflows、Dockerfile/Compose 或常见托管平台配置；存在 PM2 示例。不能据此断言仓库外没有流水线，但当前仓库本身未给出 CI 构建/测试/部署保证、容器运行定义或恢复运维说明。

证据：[`ecosystem.config.example.cjs`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/ecosystem.config.example.cjs#L1-L13)。

## 10. 先决条件与验收方式

- 确定模块 API 契约和迁移所有权，再做 SIS/Agent 模块实现。
- 在 SIS schema 前先定义组织、租户、成员关系和可信上下文来源。
- 统一服务端授权入口，覆盖 CRUD、定制 API、文件、Agent 工具。
- 为敏感写操作建立可检索审计记录，并做拒绝访问测试。
- 记录迁移版本、升级/失败恢复步骤，验证从空库和上一版本升级。
- 对支付、OAuth/OIDC、上传/下载、实时多实例能力做真实集成验证。
