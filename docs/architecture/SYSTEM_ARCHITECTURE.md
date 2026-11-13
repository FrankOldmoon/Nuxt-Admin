# 系统架构（System Architecture）

> 状态：**Implemented**（Phase 0–7 完成后的真实实现）
> 本文是架构文档的入口。历史快照见 [CURRENT_ARCHITECTURE.md](../CURRENT_ARCHITECTURE.md)（**Deprecated**）。

## 1. 设计原则

1. **Core 不依赖具体业务模块**：Core 只认识 `modules.catalog.ts` 导出的定义列表；业务模块只通过 `server/sdk` 使用平台契约。
2. **服务端是授权与租户上下文的唯一来源**：浏览器不能提交角色、权限、tenantId/organizationId 作为授权依据。
3. **单一管线**：模块发现、CRUD 请求、迁移执行、Agent 工具调用都各只有一条受控路径，避免多套并行逻辑。
4. **失败关闭**：缺失上下文、未知数据范围、未注册解析器、损坏的签名一律拒绝，而不是回退到宽松行为。
5. **可验证**：迁移、模块生命周期、审批、权限都有对应测试；CI 使用真实 PostgreSQL。

## 2. 运行形态

- Nuxt 4 + Vue 3 + TypeScript 单体应用。
- Nitro 承载 HTTP API、WebSocket（crossws）与启动插件。
- PostgreSQL + Drizzle ORM/Kit；生产发布前由单一入口执行迁移。
- 同一进程内通过 `RealtimeBus` 支持单实例或 PostgreSQL LISTEN/NOTIFY 多实例广播。

```text
浏览器 / 小程序
   │  HTTPS + httpOnly session cookie
   ▼
Nuxt app/ (SSR + dashboard)
   │  /api/**
   ▼
Nitro server/
   ├─ api/            路由与传输层
   ├─ utils/          平台服务（auth、CRUD、files、llm…）
   ├─ core/           纯领域核心（权限、审计、数据范围、模块、Agent）
   ├─ sdk/            模块唯一公开契约
   ├─ database/       schema、迁移、seed、模块迁移
   └─ plugins/        启动装配（database、modules…）
   │
   ├─ PostgreSQL（主库 + 模块表 + __module_migrations / module_states）
   └─ LLM Provider（OpenAI-compatible HTTP）
```

## 3. 目录与分层

| 目录 | 职责 | 依赖方向 |
|---|---|---|
| `server/core/` | 无 h3/DB 副作用的领域核心：权限、AuthContext 类型、数据范围、字段策略、审计、模块 SDK/目录/状态/守卫、文件授权、Model Gateway、Agent loop、审批 | 不依赖 `app/`、不依赖具体模块 |
| `server/sdk/` | 模块公开契约的唯一入口，re-export core 类型与注册函数 | 只被模块使用 |
| `server/utils/` | 平台服务实现：session/token、users、files、mail、dashboard CRUD、模块运行时、realtime、agent store | 可依赖 core + database |
| `server/api/` | Nitro 路由：认证、dashboard CRUD、文件、模块分发、LLM、支付、WS | 依赖 utils/core |
| `server/database/` | Drizzle schema、主库迁移、seed、发布迁移入口、模块迁移与状态持久化 | 依赖 core 契约 |
| `modules/<id>/` | 业务模块：manifest、register、Nuxt layer、server services、自带 schema/迁移/测试 | **只允许**依赖 `server/sdk` |
| `extends/blog/` | 官方上游 layer（Blog），保留独立 DDL 与插件 | 上游兼容 |
| `app/` | 前端页面、组件、composables；dashboard 动态 CRUD 页面 | 调 HTTP API |
| `test/` | `unit` / `nuxt` / `e2e` 三层 Vitest | — |

> 解耦由 `test/unit/server/core/moduleDecoupling.test.ts` 静态检查：Core 不 import 具体模块，模块不 import `server/core/**`。

## 4. 启动与迁移

### 4.1 开发环境

`server/plugins/database.ts`：

1. 注册主 Drizzle schema（供 CRUD 自动发现）。
2. `ensureDatabase()` 创建目标库。
3. 执行主库 Drizzle 迁移。
4. `resolveModuleCatalog()` 校验并排序模块，执行 `onRegister` / `onEnable` 生命周期。
5. 执行模块迁移，记录 `module_states = migrated`。
6. `seed()` 幂等写入角色、管理员、默认配置；确保 `dashboard.menu`、admin 角色权限。
7. 校验连接。

`NODE_ENV === 'production'` 时跳过 1–5，只做配置补齐与连接校验。

### 4.2 生产发布

`pnpm db:migrate:release`（`server/database/migrate.ts`）是唯一发布迁移入口：

```text
Drizzle 主库迁移
  → 模块 onRegister / onEnable
  → applyModuleMigrations（advisory lock + checksum）
  → 写入 module_states = migrated
  → Blog 幂等 DDL（BLOG_ENABLED != false）
```

详见 [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md)。

## 5. 关键请求链路

### 5.1 认证与授权

```text
请求
 └─ requireUser / getAuthContext
     ├─ session cookie → tokens 表校验
     ├─ findUserById（isActive、未删除）
     ├─ getOrganizationContext（active membership，服务端校验）
     └─ AuthContext { user, role, organization, tenantId, membershipId, departmentId, permissions }
 └─ requireDashboardAccess(table, action)
     └─ authorize(ctx, { table, action, permissions })   // 默认拒绝
```

详见 [AUTHORIZATION.md](./AUTHORIZATION.md)。

### 5.2 通用 CRUD

```text
/api/dashboard/data/:table/*
 └─ requireDashboardAccess(table, action)
 └─ getTableMeta(table)（显式注册 / schema 自动发现 / ADMIN_ONLY_TABLES 兜底）
 └─ crudService
     ├─ resolveDataScope()                行级范围
     ├─ assertRelationScope()             关系目标跨组织/租户校验
     ├─ resolveContextColumns()           organizationId / tenantId 服务端注入
     ├─ fieldPolicy                        字段可读/可写
     ├─ table validators                  模块业务校验
     └─ writeAudit()                      同事务审计（含 moduleId/resource）
```

### 5.3 模块 API

```text
/api/modules/<id>/**
 └─ server/api/modules/[...path].ts
     ├─ 生命周期门禁：deactivated / uninstalling / uninstalled → 403
     ├─ ModuleApiRouter 按 id 查找
     ├─ 权限/Actor 校验
     └─ handler
```

### 5.4 文件

- `files.visibility` 为 `public | private`，新上传默认 `private`。
- 私有文件：owner / admin / 同组织且具 `files:read` 者可访问。
- 临时访问通过 HMAC 签名 URL（`createSignedFileUrl`），失败关闭。
- 路径经过数据库记录 + `getAbsolutePath` 双重校验，拒绝目录穿越。

详见 [AUTHORIZATION.md](./AUTHORIZATION.md) 第 6 节。

### 5.5 Agent

```text
/api/llm/chat
 └─ ModelGateway（provider 适配、超时、重试、回退、成本）
 └─ runAgentLoop
     ├─ ToolRegistry.run：schema → 权限复检 → 取消 → 限流 → 超时 → 输出上限
     ├─ 高风险工具：持久化审批（参数哈希绑定）
     └─ 记录 executions / tool_calls / approvals / artifacts
```

详见 [AGENT_ARCHITECTURE.md](./AGENT_ARCHITECTURE.md)。

## 6. 模块边界

- 模块清单唯一来源：仓库根 `modules.catalog.ts`（不是 `modules/` 内部）。
- 构建期：`ENABLED_MODULES` 决定加载哪些 Nuxt layer。
- 运行期：manifest 校验 + 依赖排序 + 生命周期状态决定模块 API 是否可用。
- 模块不得声明通配权限 `*`，不得直接 import `server/core/**`。
- 停用/卸载只影响运行期能力与状态，**不会**卸载已编译的 Nuxt layer。

详见 [MODULE_ARCHITECTURE.md](./MODULE_ARCHITECTURE.md) 与 [MODULE_LIFECYCLE.md](./MODULE_LIFECYCLE.md)。

## 7. 多租户与数据隔离

- `tenants → organizations → organization_memberships`，成员角色在组织内优先于全局角色。
- 表通过 `features.organizationScoped` / `tenantScoped` 或显式 `contextColumns` 声明归属。
- 创建时服务端注入归属列；更新时删除浏览器提交的归属列。
- 关系外键在 create/update/import 时校验目标归属，拒绝跨组织/跨租户引用。
- 关键业务表使用作用域唯一索引（如 `sis_students(organization_id, student_no)`）。

详见 [MULTI_TENANCY.md](./MULTI_TENANCY.md)。

## 8. 实时

- 单一 `/api/ws`：通知、私信、presence、LLM 流式。
- 本实例注册表 + `RealtimeBus`；多实例使用 PostgreSQL `LISTEN/NOTIFY`。
- 事件类型：`user`（定向）、`all`（广播）、`presence`（仅跨实例簿记）。
- 生产配置与限制见 [PRODUCTION.md](./PRODUCTION.md)。

## 9. AI / Agent

- `ModelGateway` 统一 OpenAI-compatible HTTP 调用，支持超时、重试、provider fallback、usage 与成本估算。
- `ToolRegistry` 是唯一的服务端工具执行入口，带风险级别、审批、限流、超时、输出上限与取消。
- 审批记录持久化并绑定执行批次与参数哈希；浏览器不能伪造审批。
- Agent 目前仍属于 Core（`server/core/agent.ts`），抽取为独立模块属于 **Planned**。

详见 [AGENT_ARCHITECTURE.md](./AGENT_ARCHITECTURE.md)。

## 10. 测试与 CI

- 测试分层：单元、集成（真实 PostgreSQL）、授权、模块 SDK、生命周期、迁移、API、e2e。
- CI：安装 → lint（非阻塞，历史债务）→ typecheck（非阻塞，历史债务）→ 迁移校验 → 发布迁移 → 全量测试 → 生产构建。
- 当前工作流位于 `.github/workflows/ci.yml`，PR 与 `main` push 都会触发。

## 11. 状态总览

| 领域 | 状态 | 说明 |
|---|---|---|
| 认证 / 会话 / RBAC | Implemented | 服务端 AuthContext + 规范权限 |
| 文件授权 / 签名 URL | Implemented | 私有文件、owner/admin/org 检查、遍历防护 |
| 通用 CRUD + 多租户 | Implemented | 归属注入、关系域校验、作用域唯一索引 |
| 模块 SDK / 清单 / 生命周期 / 迁移 | Implemented | 单管线、状态机、卸载守卫、管理 UI |
| SIS/SMS 模块 | External | 位于独立仓库 `Nuxt-Extend-SMS`；主仓库不再内置。学年/学期/年级/科目/教师/班级/学生/选课/监护人已实现；课表、考勤、评估、报表未实现 |
| Agent | Partial | Gateway/工具管道/审批/执行记录已完成；Anthropic 原生适配器、保留清理、模块抽取未完成 |
| 实时多实例 | Implemented（PostgreSQL） | Redis 适配器、对象存储、全局限流未实现 |
| CI / 文档 | Implemented | 本阶段交付；lint/typecheck 历史债务仍存在 |

## 12. 文档地图

| 主题 | 文档 |
|---|---|
| 核心服务目录 | [CORE_SERVICES.md](./CORE_SERVICES.md) |
| 授权 | [AUTHORIZATION.md](./AUTHORIZATION.md) |
| 多租户 | [MULTI_TENANCY.md](./MULTI_TENANCY.md) |
| 模块架构 | [MODULE_ARCHITECTURE.md](./MODULE_ARCHITECTURE.md) |
| 模块生命周期 | [MODULE_LIFECYCLE.md](./MODULE_LIFECYCLE.md) |
| 数据库迁移 | [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md) |
| Agent | [AGENT_ARCHITECTURE.md](./AGENT_ARCHITECTURE.md) |
| 实施审计 | [IMPLEMENTATION_AUDIT.md](./IMPLEMENTATION_AUDIT.md) |
| 阶段进度 | [UPGRADE_PROGRESS.md](./UPGRADE_PROGRESS.md) |
| 生产/实时 | [PRODUCTION.md](./PRODUCTION.md) |
| 模块开发 | [MODULE_DEVELOPMENT.md](./MODULE_DEVELOPMENT.md)（索引） |
| 开发指南 | [../development/](../development/) |
| 决策记录 | [../decisions/ADRs/](../decisions/ADRs/README.md) |
