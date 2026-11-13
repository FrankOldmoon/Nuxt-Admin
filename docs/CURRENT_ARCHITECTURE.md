# 当前架构（vNext Phase 0 复核）

> **Deprecated**：本文件是 Phase 0 的历史快照，仅用于追溯。当前真实架构请阅读
> [architecture/SYSTEM_ARCHITECTURE.md](./architecture/SYSTEM_ARCHITECTURE.md)。
> 根目录同名文件为更早的审计存档，同样不再维护。

> 本文件是《Nuxt-Admin vNext 实施任务书》Phase 0 产出，描述**当时的工作区代码**。
> 复核基线：`main` @ `350aa99`（Phase 1 Core 骨架已合入）。

## 1. 技术栈与运行形态

- Nuxt 4 + Vue 3 + TypeScript 单体应用，Nitro 承载 HTTP API、WebSocket 与启动插件。
- PostgreSQL + Drizzle ORM/Kit；主库迁移位于 `server/database/migrations`。
- 测试：Vitest（node + nuxt 双 project），当前 52 个测试文件 / 507 个用例。
- 关键依赖与脚本以 [package.json](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/package.json) 为准。

## 2. 目录与分层

| 目录 | 职责 |
|---|---|
| `app/` | 页面、组件、composables、dashboard 动态页面 |
| `server/api/` | Nitro HTTP 路由（认证、CRUD、LLM、支付、模块分发等） |
| `server/core/` | Phase 1 新增的平台核心：权限、审计、字段策略、模块 SDK/目录 |
| `server/utils/dashboard/` | 表注册、元数据推断、通用 CRUD、表级定制 |
| `server/database/` | schema、迁移、seed、发布迁移入口、模块迁移编排 |
| `extends/blog/` | 官方 Nuxt layer（博客），自带 DDL 与插件 |
| `modules/example/` | 示例业务模块（组织归属 notes、API/Tool/UI、模块迁移） |
| `test/` | `unit`、`nuxt`、`e2e` 三层测试 |

## 3. 启动与迁移

- [database.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/plugins/database.ts) 在启动时注册主 Drizzle schema；开发环境执行 Drizzle 迁移、模块生命周期与模块迁移，再 seed。
- 生产不再自动迁移：发布前执行 `pnpm db:migrate:release`（[migrate.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/database/migrate.ts)），依次执行 Drizzle、模块生命周期、模块迁移与 Blog DDL。
- 模块迁移由 [moduleMigrations.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/database/moduleMigrations.ts) 统一编排：`__module_migrations` 追踪 + `pg_advisory_xact_lock` 串行化。
- Blog 仍保留启动时幂等 DDL（兼容路径），发布入口也会执行一次。

## 4. 认证与授权链路

```text
请求
 └─ requireUser(event)                     server/utils/auth.ts
     ├─ session cookie → verifySessionToken → findUserById
     ├─ findRoleById(user.roleId)          ← 全局角色（users.roleId）
     └─ getOrganizationContext(event,user)
         └─ organization_memberships(active) + organizations → { id, tenantId }
 └─ requireDashboardAccess(event, table, action)
     └─ authorize(PermissionContext, ResourceRef)   server/core/permissions.ts
```

现状要点：

- `AuthContext = { user, role, organization? }`；组织仅在请求头 `x-organization-id` 或 `event.context.organizationId` 提供时解析，否则为 `null`。
- 授权使用**用户全局 role**（`users.roleId`）；`organization_memberships.roleId` / `departmentId` 已建表但**未进入授权上下文**。
- `authorize()` 目前只做表级动作判断：admin 绕过、`ADMIN_ONLY_TABLES` 限制、`* / table / table:action` 匹配。

## 5. Generic CRUD 链路

```text
/api/dashboard/data/:table/*
 └─ requireDashboardAccess(table, action)
 └─ getTableMeta(table)          server/utils/dashboard/tables.ts
     ├─ 显式 TABLES[] / registerDashboardTable()
     └─ 否则 autoDiscoverTable()  ← 任意已注册 Drizzle schema 的表
 └─ crudService: list/get/insert/update/delete/batch/import/export
     ├─ buildDataScopeWhere(): all | self（ownerColumn / userTable）
     ├─ assertWritableFields(): features.fieldPolicy
     ├─ hideUnreadableFields(): features.fieldPolicy
     └─ writeAudit(): 同事务写 audit_logs（create/update/delete/restore/permanent/batch）
```

- 表注册同时来自“显式注册”和“schema 自动发现”，未注册但存在于主 schema 的表也会被解析为 CRUD 资源。
- 内部表保护只有 `ADMIN_ONLY_TABLES = { roles, users, files, configs }` 黑名单。
- 字段级策略 [fieldPolicy.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/core/fieldPolicy.ts) 按**角色名**放行，属于可选能力，目前没有内置表配置。
- 关系字段（relation / many-to-many）没有独立的关联数据授权。

## 6. 模块体系

- 契约：[moduleSdk.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/core/moduleSdk.ts) 提供 manifest、依赖排序、重复/缺失/循环校验、`ApiRegistry` / `ToolRegistry` / `UiRegistry` / `ModuleApiRouter`、`runModuleLifecycle`、`runModuleMigrations`。
- 目录：[moduleCatalog.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/core/moduleCatalog.ts) 中 `MODULE_DEFINITIONS = [exampleModule]` 为**硬编码**。
- 构建期启停：[nuxt.config.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/nuxt.config.ts) 用 `ENABLED_MODULES` 映射 layer，`AVAILABLE_MODULE_IDS = ['example']` 也是硬编码。
- 运行期装配：[moduleRuntime.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/moduleRuntime.ts) 显式判断 `'example'` 后调用 `registerExampleModule()`。
- 模块 API 通过 [api/modules/[...path].ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/modules/%5B...path%5D.ts) 统一分发；Tool/UI 注册表目前只被示例模块和单测使用。
- 模块生命周期只有 `onRegister/onEnable/onDisable` 回调，无持久化状态、无 install/upgrade/uninstall 流程。

## 7. 审计与版本

- [audit.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/core/audit.ts)：`writeAudit()` + 递归脱敏（password/token/secret/credential/apiKey）。
- 已接入：CRUD 写操作、登录成功/失败、导出、示例模块 API 创建与 Tool 执行。
- 未接入：权限/角色变更（仅随 CRUD 的 roles 表更新间接记录）、失败访问、模块生命周期、批量导入的独立事件、审批。
- 版本历史：`TableFeatures.versions` 仅对显式开启的表记录 `versions` jsonb 快照。

## 8. LLM Chat 与 AI 能力

- `server/api/llm/chat.post.ts` 与 WebSocket 路由只做“消息 → 模型 → 文本”的同步调用，未接入 `ToolRegistry`。
- 客户端 [useChatTools.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/app/composables/useChatTools.ts) / [useChatUi.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/app/composables/useChatUi.ts) 解析模型输出中的 ```tool / ```ui 代码块，并在**浏览器侧**执行已注册工具、渲染已注册卡片。
- 服务端 UI Registry 仅保存描述符，没有 `ui.render` 协议与版本校验；服务端 Tool Registry 与客户端工具集是两套体系。

## 9. 其他已有能力

认证/OAuth/OIDC、用户与角色管理、通知与 WebSocket、文件存储、支付与会员、配置中心、i18n、导入导出、表级 CRUD 定制（L0–L4）。

## 10. 与 vNext 目标的结构性差距（摘要）

1. 授权上下文仍是“全局角色 + 可选组织”，未形成租户/组织/成员/部门统一的 `AuthContext`。
2. DataScope 只有 `all` / `self`，缺少 assigned/department/organization/tenant/global。
3. CRUD 开放面来自 schema 自动发现，而非显式白名单。
4. 模块目录与运行时装配硬编码 `example`。
5. Tool/UI Registry 尚未进入 LLM 调用链，AI UI 协议未落地。
6. 模块生命周期缺少状态、版本兼容与审计。

详见 `IMPROVEMENT_AUDIT.md`、`SECURITY_GAP_ANALYSIS.md`、`MODULE_SDK_DESIGN.md`、`IMPLEMENTATION_PLAN.md`。
