# 实施计划（vNext）

> **Historical**：Phase 0 的计划文档。实际完成状态以
> [architecture/UPGRADE_PROGRESS.md](./architecture/UPGRADE_PROGRESS.md) 与
> [architecture/IMPLEMENTATION_AUDIT.md](./architecture/IMPLEMENTATION_AUDIT.md) 为准。

> Phase 0 产出。执行顺序严格按任务书：Phase 0 → 1 → 2 → 3 → 4 → 5。
> 每个 Phase 结束时必须通过 `pnpm typecheck`、`pnpm test`、`pnpm build`，并汇报改动文件、测试结果、剩余问题。
> 现有 Phase 1 Core 骨架（权限/审计/字段策略/模块 SDK/组织模型）已存在，以下任务以**加固与补齐**为主，不重写。

## 进度

| Phase | 状态 | 说明 |
|---|---|---|
| 0 架构复核 | ✅ 完成 | 五份文档已产出 |
| 1 Permission Engine | ✅ 完成 | AuthContext v2、成员角色、活动组织、DataScope 六值、字段策略 v2、关系授权、记录级过滤；521 测试通过 |
| 2 CRUD 安全边界 | ✅ 完成 | 显式 exposure 白名单、内部表硬拒绝、失败访问审计、用户/角色变更审计；E2E 验证内部表 404 |
| 3 Module SDK | ✅ 完成 | `modules.catalog.ts` 静态清单、`register()` 自注册、`module_states` 持久化与审计、依赖版本校验、Tool 超时/UI 版本校验 |
| 4 AI Agent | ✅ 完成（HTTP） | 服务端多轮 Tool Calling、权限网关、Query/Command 确认、审计、固定 UI 校验；WS 流式与持久化会话后续补 |
| 5 SIS Demo | ✅ 完成 | `sis-demo` 独立模块：Student/Class/TeacherAssignment、Generic CRUD 组织+教师范围、共享 Search Service、Agent Tool、固定 StudentTable UI；关闭模块不打包页面 |

## Phase 0：架构复核（已完成）

产出：

- [CURRENT_ARCHITECTURE.md](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/docs/CURRENT_ARCHITECTURE.md)
- [IMPROVEMENT_AUDIT.md](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/docs/IMPROVEMENT_AUDIT.md)
- [SECURITY_GAP_ANALYSIS.md](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/docs/SECURITY_GAP_ANALYSIS.md)
- [MODULE_SDK_DESIGN.md](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/docs/MODULE_SDK_DESIGN.md)
- 本文件

结论：任务书描述的大部分 P0 缺口可复现（S-01 ~ S-10）。

## Phase 1：Permission Engine

**目标**：请求级、行级、字段级授权形成一条可测试链路。

### P1.1 AuthContext v2

- 新增 `server/core/authContext.ts`：定义 `AuthContext`（userId/tenantId/organizationId/membershipId/roleId/departmentId/roles/permissions/attributes）。
- `server/utils/auth.ts` 的 `getSessionUser()` 改为组装 v2 上下文，保留现有字段以兼容调用方。
- 有效角色优先级：active membership 的 `roleId` → 用户全局 `roleId`；两者都无 → 无权限。

**测试**：同一用户两组织不同角色；membership 禁用；无 membership 的组织资源请求 403。

### P1.2 Active Organization

- 服务端解析顺序：已校验的 `active_organization_id` cookie/请求上下文 → 用户唯一 active membership → 否则组织资源拒绝。
- 绝不直接信任请求头中的 tenant/org；header 仅作为“期望组织”，必须命中 membership。
- 组织切换后重新解析上下文，不缓存旧权限。

**测试**：不带组织访问组织资源 403；伪造 header 403；切换组织权限立即变化。

### P1.3 权限来源统一

- `getEffectivePermissions(context)` / `getEffectiveRole(context)` 实现于 `server/core/permissions.ts`。
- `requireDashboardAccess` 使用有效权限，而不是 `users.roleId` 对应角色。

### P1.4 DataScope 六值

- 新增 `server/core/dataScope.ts`：`DataScope = own|assigned|department|organization|tenant|global` + `resolveDataScope({context, resource, action})`。
- 扩展 `TableFeatures.dataScope`：`{ scope, ownerColumn?, assigneeColumn?, departmentColumn?, organizationColumn?, tenantColumn? }`。
- 不支持/缺列/缺上下文 → 拒绝，不跳过。
- `list/get/update/delete/batch/import/export` 全部复用解析结果。

**测试**：矩阵覆盖 own/assigned/department/organization/tenant/global；跨组织/跨租户拒绝；缺映射拒绝。

### P1.5 记录级 authorize

- `authorize({ context, resource, action, resourceId? })`：无 resourceId 时做表级；有 resourceId 时结合 scope 查询判定。
- `filterAccessibleRecords()` / `filterReadableFields()` / `filterWritableFields()` 作为统一导出。

### P1.6 关系与字段

- `loadRelationOptions()` 与 many-to-many 读取走目标表 scope。
- FieldPolicy v2：`readable/writable/readPermission/writePermission/mask`；内置 `passwordHash/tokenHash/*secret*` 强制不可读。

### 验收

- 两组织、两租户隔离集成测试通过。
- 未授权字段不出现在响应；写未授权字段 403。
- `pnpm typecheck/test/build` 全绿。

## Phase 2：Generic CRUD 安全边界

### P2.1 显式白名单

- `getRegisteredTable()` 移除 `autoDiscoverTable()` 回退；自动发现仅供元数据浏览/开发工具。
- `registerDashboardTable` 增加 `exposure: 'generic-crud' | 'internal' | 'custom'`，默认 `internal`。
- 路由只解析 `exposure === 'generic-crud'` 的表；未开放 → 404。

### P2.2 内部表保护

- 内部表清单（tokens、oauth*、wxSessions、audit_logs、tenants、organizations、organizationMemberships、departments、configs、privateMessages 等）默认 `internal`。
- 敏感列名兜底不可读；内部表只能通过专用 Service 管理。

### P2.3 CRUD 审计补齐

- 失败访问（401/403）、导入汇总、导出、批量操作、恢复写入审计。
- 审计写入失败时重要写操作回滚（CRUD 已实现，补充模块 API 与 Tool）。

### 验收测试

- 未注册/内部表直接 API → 拒绝。
- `tokens` 表响应不含 tokenHash。
- 关系下拉不泄露他组织记录。
- 字段级读写矩阵通过。

## Phase 3：Module SDK 解耦

### P3.1 静态目录

- 新增 `modules/index.ts`（唯一模块清单）；`moduleCatalog.ts` 只消费该清单；`nuxt.config.ts` 从清单推导可用 ID。
- 可选生成脚本 + CI 校验。

### P3.2 生命周期状态

- 新增 `module_states` 表与迁移；实现 validate/install/migrate/activate/deactivate/upgrade/uninstall。
- 迁移失败 → `failed`；重试幂等；不删数据。
- 生命周期写审计。

### P3.3 注册解耦

- `ModuleDefinition.register(context)` 取代 Core 对 `registerExampleModule` 的 import。
- `moduleRuntime.ts` 遍历启用模块，无任何模块 ID 字面量。
- Tool/UI 契约升级（output schema、operation、timeout、version、ui.render 协议）。

### P3.4 Sample Module

- 用现有 `example` 作为 sample 验证：独立目录、独立迁移、独立测试、可禁用、不修改 Core。

### 验收测试

- Core 源码静态检查不含 `'example'` 字面量。
- 依赖缺失/循环/版本不兼容、迁移失败状态、禁用后不可调用、重新启用恢复。
- 新模块仅新增 `modules/<id>` + `modules/index.ts` 一行即可接入。

## Phase 4：AI Agent Integration

### P4.1 服务端 Tool Calling

- LLM WS/HTTP 请求携带启用工具描述；解析 `tool_call`；循环执行（最大轮次、超时、错误回传）。
- 每次执行经 Permission Gateway（AuthContext）并写审计；Tool Call ID 与会话状态持久化。

### P4.2 Query / Command

- `operation: query` 直接执行；`command` 需业务校验 + 预览 + 用户确认（第二人审批可选）。
- Agent 不得替用户确认；确认状态落库。

### P4.3 Fixed UI Rendering

- 服务端只返回注册组件 `name@version` + presentation + 授权数据引用；客户端按注册表渲染。
- 拒绝未注册/版本不匹配组件；数据只通过授权 API 获取。

### 验收测试

- 多轮 Tool Calling、无效工具、超时、权限失败、命令确认、审计、Prompt Injection、任意 SQL 拒绝、未注册 UI 拒绝。
- 关闭 Agent 不影响传统页面。

## Phase 5：SIS Demo 集成验证

- `modules/sis-demo`：Student / Class / Teacher / TeacherAssignment / StudentSearchTool / StudentTable UI。
- Student 使用 Generic CRUD + organization scope；TeacherAssignment 决定学生数据范围。
- 验证：SIS 独立接入、Core 零修改、AI 可调用 Student Search、AI 与页面共用 Service、关闭 Agent 后 SIS 正常。

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| 白名单改造导致现有页面 404 | 先列出当前实际使用的表，逐个标记 `exposure`；保留 feature flag 一版 |
| 有效角色切换影响现有管理员 | admin 角色保持全局兜底；新增测试覆盖 |
| DataScope 改造影响 CRUD 行为 | 先实现 `all/self` 等价迁移，再逐表启用 organization/tenant |
| Tool Calling 改造影响现有聊天 | 保留现有纯文本链路作为 fallback；新链路 feature flag |
| 模块状态表新增迁移 | 独立 forward migration，不改历史 SQL |

## 每阶段交付格式

1. 修改/新增文件列表。
2. 实现说明与关键决策。
3. 测试结果（typecheck/test/build）。
4. 未完成项与风险。
