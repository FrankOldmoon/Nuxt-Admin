# 核心服务（Core Services）

> 状态：**Implemented**，除标注 **Partial / Planned** 的条目。
> 本文只列 Core 与平台服务，不展开业务模块（SIS 见 [MULTI_TENANCY.md](./MULTI_TENANCY.md) 与模块文档）。

## 1. 认证与授权

| 服务 | 位置 | 职责 |
|---|---|---|
| AuthContext | `server/core/authContext.ts` | 服务端创建 `{ user, role, organization, tenantId, membershipId, departmentId, permissions }`；`effectiveRoleId` 让组织内成员角色优先；`permissionsOf` 规整权限数组；`hasGlobalScope` 要求显式 `*`/`global` |
| 权限原语 | `server/core/permissions.ts` | `authorize()` 单一决策点；`permMatches` 支持 `*` / `table` / `table:action`；`ADMIN_ONLY_TABLES` 硬拒绝 |
| 会话与守卫 | `server/utils/auth.ts` | `getSessionUser` / `requireUser` / `requireAdmin` / `getAuthContext` / `getActiveOrganization` / `requireDashboardAccess` |
| 组织上下文 | `server/utils/auth.ts` | `getOrganizationContext()` 只从 active `organization_memberships` 解析；显式 ID 必须匹配成员关系 |
| 数据范围 | `server/core/dataScope.ts` | `own / assigned / department / organization / tenant / global`；模块可注册 resolver；未知 resolver 或缺失上下文一律拒绝 |
| 字段策略 | `server/core/fieldPolicy.ts` | 按角色名控制字段可读/可写，防止越权字段泄露或写入 |
| 文件授权 | `server/core/fileAccess.ts` | `canAccessPrivateFile`、`actorFromAuthContext`、签名 URL 创建/校验 |

详见 [AUTHORIZATION.md](./AUTHORIZATION.md)。

## 2. 审计

| 服务 | 位置 | 职责 |
|---|---|---|
| 审计写入 | `server/core/audit.ts` | `writeAudit()` 写入 `audit_logs`；递归脱敏 password/token/secret/credential/apiKey |
| CRUD 审计 | `server/utils/dashboard/crudService.ts` | create/update/delete/restore/permanent/batch 同事务写审计，带 `moduleId` / `resource` |
| 拒绝审计 | `server/utils/auth.ts` | `requireDashboardAccess` 失败时 best-effort 写 `access.denied`，不阻断 403 |
| 模块生命周期审计 | `server/database/moduleStates.ts` | 每次状态转换写 `module.<state>` |
| Agent 审计 | `server/core/agent.ts` + 调用方 | 工具允许/拒绝/失败、审批决策 |

## 3. 通用 CRUD

| 服务 | 位置 | 职责 |
|---|---|---|
| 表注册/元数据 | `server/utils/dashboard/tables.ts` | 显式注册 + Drizzle schema 自动发现；`TableMeta` 含 `moduleId`、`resource`、`permissions`、`features` |
| 表校验器 | `server/utils/dashboard/tableValidators.ts` | 模块注册业务校验，在写入前执行 |
| CRUD 管线 | `server/utils/dashboard/crudService.ts` | list/detail/create/update/softDelete/restore/permanent/batch/import/export；`resolveContextColumns`、`assertRelationScope`、`castForDbInsert/Update`、`loadRelationOptions` |
| 表级定制 | `server/utils/dashboard/tableOverrides.ts` | L1 列表/CRUD 定制注册表，供业务模块接管 |
| 通用 API | `server/api/dashboard/data/[table]/*` | list/get/create/update/batch/import/export/seed；custom 表对 import/export 返回 405 |

关键安全行为：

- 创建时服务端注入 `organizationId` / `tenantId`；更新时移除浏览器提交的归属列。
- 关系与 many-to-many 目标若自身有归属列，则校验目标与 actor 组织/租户一致。
- `global` 数据范围必须显式拥有 `*` / `global` 权限，admin 身份本身不隐含。
- 分页上限 100；导出行上限 50k；关系选项上限 500；列表 count 与 rows 并行查询。

## 4. 文件

| 服务 | 位置 | 职责 |
|---|---|---|
| 存储 | `server/utils/fileStorage.ts` | 本地存储、路径解析、目录穿越防护 |
| 访问控制 | `server/core/fileAccess.ts`、`server/utils/fileRequest.ts` | public/private、owner/admin/org 检查、签名 URL |
| API | `server/api/files/{upload,serve,download}` | 上传、预览、下载 |

## 5. 模块系统

| 服务 | 位置 | 职责 |
|---|---|---|
| 公开 SDK | `server/sdk/index.ts` | 模块唯一允许依赖的契约入口 |
| SDK 类型/注册表 | `server/core/moduleSdk.ts` | `ModuleDefinition`、`ModuleManifest`、`ModuleApiRouter`、`ToolRegistry`、`UiRegistry`、`runModuleLifecycle`、`runModuleMigrations` |
| 清单校验 | `server/core/moduleManifest.ts` | ID/semver/apiVersion/compatibility/权限/导航/capabilities/migrationScope |
| 单一目录管线 | `server/core/moduleCatalog.ts` | `resolveModuleCatalog`：manifest 校验 → 启用 ID 校验 → 依赖排序 |
| 生命周期状态 | `server/core/moduleState.ts` | 合法转换与终态约束 |
| 状态持久化 | `server/database/moduleStates.ts` | `module_states` + 审计 + `assertTransition` |
| 卸载守卫 | `server/core/moduleGuards.ts` | 依赖方检查、不可用状态集合 |
| 模块迁移 | `server/database/moduleMigrations.ts` | advisory lock、checksum、失败可重试 |
| 运行时装配 | `server/utils/moduleRuntime.ts` | 按 catalog 注册模块 API/Tool/UI/CRUD |
| 模块分发 | `server/api/modules/[...path].ts` | 生命周期门禁 + 路由 |
| 管理 API/UI | `server/api/dashboard/modules*`、`app/pages/dashboard/modules.vue` | 校验、启用、停用、卸载 |

详见 [MODULE_ARCHITECTURE.md](./MODULE_ARCHITECTURE.md)、[MODULE_LIFECYCLE.md](./MODULE_LIFECYCLE.md)。

## 6. 实时

| 服务 | 位置 | 职责 |
|---|---|---|
| 总线 | `server/core/realtimeBus.ts` | `InMemoryRealtimeBus` / `PostgresRealtimeBus` / `createRealtimeBus` |
| 平台封装 | `server/utils/realtime.ts` | 本地 peers + 跨实例广播、presence、在线判断 |
| WS 注册表 | `server/utils/wsRegistry.ts` | userId → peers，断线清理 |
| 网关 | `server/api/ws.ts` | 通知、私信、presence、LLM 流式 |

生产配置见 [PRODUCTION.md](./PRODUCTION.md)。

## 7. LLM 与 Agent

| 服务 | 位置 | 职责 |
|---|---|---|
| Model Gateway | `server/core/modelGateway.ts` | OpenAI-compatible 适配器、规范化、超时、重试、provider fallback、usage、成本 |
| Agent loop | `server/core/agent.ts` | 多轮工具调用、确认、轮次/调用上限、用量累计、UI 指令解析 |
| 工具注册表 | `server/core/moduleSdk.ts` | `ToolRegistry.run`：schema → 权限复检 → 取消 → 限流 → 超时 → 输出上限 |
| 审批契约 | `server/core/agentApproval.ts` | 状态机、参数哈希、绑定校验 |
| 执行持久化 | `server/utils/agentStore.ts` | executions / tool_calls / approvals / artifacts |
| Chat API | `server/api/llm/chat.post.ts` | 模型调用 + 持久化执行 + 审批恢复 |
| WS 流式 | `server/api/llm/ws.ts` | 流式输出（不走服务端工具管道，见文档限制） |

详见 [AGENT_ARCHITECTURE.md](./AGENT_ARCHITECTURE.md)。

## 8. 配置与基础设施

| 服务 | 位置 | 职责 |
|---|---|---|
| 配置中心 | `server/utils/configs.ts`、`/api/config/*` | 键值 + 类型 + 描述；公开配置脱敏筛选 |
| Seed | `server/database/seed.ts` | 角色、管理员、默认配置、演示数据（幂等） |
| 数据库 | `server/database/index.ts` | Pool + Drizzle；连接池参数可配 |
| 发布迁移 | `server/database/migrate.ts` | 单一发布入口 |
| 限流 | `server/utils/rateLimit.ts` | 进程内私信/登录限流（多实例需网关层限流，**Planned**） |
| 健康检查 | `server/api/health.get.ts` | 进程与数据库可用性 |
| i18n | `i18n/locales/*` | 多语言；前端 `t()` 与后端 fallback 标签 |
