# 安全差距分析（P0 / P1）

> **Historical**：Phase 0 分析，修复状态已随后续阶段变化。当前安全状态见
> [architecture/AUTHORIZATION.md](./architecture/AUTHORIZATION.md) 与
> [architecture/IMPLEMENTATION_AUDIT.md](./architecture/IMPLEMENTATION_AUDIT.md)。

> Phase 0 产出。只记录**当前代码可证实**的风险，按可利用性与影响排序。
> 所有结论均给出代码位置；修复建议对应 `IMPLEMENTATION_PLAN.md` 的任务编号。

## 修复状态（Phase 2 完成后）

- **S-01 已修复**：Generic CRUD 改为显式 `exposure` 白名单，`getExposedTable()` 不再回退 schema 自动发现；未注册表直接 404。
- **S-02 已修复**：内部表（tokens / oauth* / audit_logs / tenants / organizations / memberships / departments / private_messages / wx* / notification_reads 等）硬编码拒绝，即使误注册为 `generic-crud` 也无法访问；E2E 覆盖。
- **S-07 部分修复**：敏感列（password/token/secret/credential/apiKey）在 Generic CRUD 中永久不可读。
- **S-09 部分修复**：403 拒绝访问、用户创建/更新/角色变更/批量操作写入审计。
- 其余（S-03/S-04/S-05 已由 Phase 1 机制覆盖，S-06 关系授权、S-08 Agent、S-10 模块解耦）按对应 Phase 推进。

## 摘要

| 编号 | 风险 | 级别 | 可利用面 |
|---|---|---|---|
| S-01 | Schema 自动发现使内部表可经 Generic CRUD 访问 | **P0** | 已获任意表权限的角色 / admin 通配符 |
| S-02 | Token / OAuth 凭据表暴露 tokenHash | **P0** | 同上，直接 API 请求 |
| S-03 | 授权只使用全局 `users.roleId`，成员角色不生效 | **P0** | 多组织用户越权 |
| S-04 | DataScope 仅 all/self，组织/租户隔离未落地 | **P0** | 跨组织读写 |
| S-05 | 组织上下文可选，缺失时按全局数据放行 | **P0** | 不携带组织头的请求 |
| S-06 | 关系字段与选项加载无关联授权 | **P1** | 通过关联下拉枚举他组织数据 |
| S-07 | 敏感字段无全局兜底脱敏（字段策略未配置） | **P1** | 读取 passwordHash 等 |
| S-08 | Tool/UI Registry 未进入服务端 LLM 链路，工具在浏览器执行 | **P1** | 能力绕过 / 审计缺失 |
| S-09 | 模块生命周期与失败访问无审计 | **P1** | 不可追溯 |
| S-10 | 模块目录硬编码 example，第三方模块需改 Core | **P1** | 供应链/可维护性 |

---

## S-01 CRUD 自动发现绕过白名单（P0）

**证据**

- `getRegisteredTable()` 在无显式条目时调用 `autoDiscoverTable()` 并缓存：
  [tables.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/tables.ts#L1390-L1418)
- 启动时 `registerDrizzleSchema(mainSchema)` 注册全部主 schema：
  [database.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/plugins/database.ts#L25-L32)
- 通用路由只做 `requireDashboardAccess(table, action)`，不检查“是否显式注册”：
  [index.get.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/dashboard/data/%5Btable%5D/index.get.ts)

**影响**

任何进入主 schema 的新表（包括未来内部表）都会自动成为 CRUD 资源。所谓“未注册表不可访问”不成立；黑名单只覆盖 4 张表。

**修复**

1. 引入 `exposure` 概念：只有 `registerDashboardTable(..., { exposure: 'generic-crud' })` 或显式白名单中的表可被通用 CRUD 解析。
2. 移除 `getRegisteredTable()` 的自动发现回退；自动发现仅用于元数据浏览器/开发工具，不用于授权。
3. 内部表清单改为“默认禁止 + 显式开放”，而不是黑名单。

**验收测试**：请求未显式注册的表 → 404/403；新增 schema 表不自动出现在 generic CRUD。

---

## S-02 凭据表与 tokenHash 暴露（P0）

**证据**

- `tokens.tokenHash`、`oauth_access_tokens.tokenHash`、`oauth_refresh_tokens.tokenHash`、`oauthAuthorizationCodes`、`wxSessions` 均在主 schema：
  [schema.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/database/schema.ts#L324-L340)
- `ADMIN_ONLY_TABLES` 只包含 `roles/users/files/configs`：
  [auth.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/auth.ts#L108-L113)
- `oauthClients` 有专门的 secret 脱敏 override，但 token 表没有：
  [oauthClients.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/tableOverrides/oauthClients.ts#L25-L33)

**影响**

拥有对应表权限或 `*` 的角色可直接读取 tokenHash / clientId / userId，为离线爆破、关联分析、会话固定提供素材；auditLogs、privateMessages 也同理。

**修复**

1. 内部表（tokens、oauth 系列、wxSessions、audit_logs、tenants/organizations/memberships/departments、configs、privateMessages）全部从 generic CRUD 白名单排除。
2. 兜底规则：任何名为 `*token* / *secret* / passwordHash` 的列默认不可读，除非表级显式声明。
3. 需要管理这些表时，走专用 Service + 明确权限 + 审计。

**验收测试**：对内部表直接请求 `/api/dashboard/data/tokens` → 拒绝；响应中永不出现 tokenHash / passwordHash。

---

## S-03 成员角色不生效（P0）

**证据**

- `AuthContext.role` 来自 `findRoleById(user.roleId)`：
  [auth.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/auth.ts#L75-L77)
- `getOrganizationContext()` 只 select `organizations.id / tenantId`：
  [auth.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/auth.ts#L16-L40)
- `organization_memberships.roleId / departmentId` 建表但未被读取。

**影响**

同一用户在 A 组织为教师、B 组织为管理员时，系统始终按全局角色授权，导致跨组织越权或权限不足。

**修复**：按 active membership 解析有效角色；`AuthContext` 增加 `membershipId/roleId/departmentId/roles/permissions/attributes`；切换组织即重新解析。

**验收测试**：同一用户两组织不同角色；切换后权限立即变化；membership 置为 disabled 后请求被拒绝。

---

## S-04 DataScope 仅 all/self（P0）

**证据**：[crudService.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/crudService.ts#L439-L470)

- 支持 `all`、`self`；`self` 依赖 `ownerColumn` 或 `userTable`。
- 无 assigned / department / organization / tenant / global。
- 未支持 scope 直接 403（方向正确），但没有可用实现。

**影响**：组织/租户隔离无法落地；只能靠表级权限 + 前端。

**修复**：建立 `DataScope` 六值与 `resolveDataScope({ context, resource, action })`；所有 CRUD 读写、批量、导入导出统一走同一解析器；不支持或缺少归属映射 → 默认拒绝。

---

## S-05 组织上下文可选（P0）

**证据**：`getOrganizationContext()` 在未提供 `x-organization-id` / `event.context.organizationId` 时直接返回 `null`：[auth.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/auth.ts#L16-L18)

**影响**：客户端不带组织头即可在“无组织”上下文中访问非组织表；若未来给表加 organization 过滤，缺失上下文会被当作“无限制”。

**修复**：区分“公共资源”和“组织资源”；组织资源缺失上下文一律 403；active organization 由服务端会话/用户偏好解析，不能只信请求头。

---

## S-06 关系数据未授权（P1）

**证据**：`loadRelationOptions()` 直接查询关联表全部选项：[crudService.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/crudService.ts#L1149-L1175)

**影响**：即使主表受限，也可通过 relation 下拉枚举其他组织/租户的记录（ID + label）。

**修复**：关系选项加载必须经过目标表的 `resolveDataScope`，并限制字段；many-to-many 虚拟字段同样处理。

---

## S-07 敏感字段默认暴露（P1）

**证据**

- 字段策略按角色名配置，未配置即全放行：[fieldPolicy.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/core/fieldPolicy.ts#L15-L26)
- 没有“密码/Token/密钥永不返回”的全局规则；只有审计快照脱敏 [audit.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/core/audit.ts#L22-L34)。

**修复**：字段策略增加 `readable/writable/readPermission/writePermission/mask` 语义；内置敏感列名兜底；对 `passwordHash`、`tokenHash`、`clientSecretHash` 等强制不可读。

---

## S-08 Tool/UI Registry 未接入服务端（P1）

**证据**

- LLM HTTP/WS 路由只返回文本：[chat.post.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/llm/chat.post.ts#L55-L70)
- 工具块与 UI 块由客户端解析执行：[useChatTools.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/app/composables/useChatTools.ts)、[useChatUi.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/app/composables/useChatUi.ts)
- 服务端 `ToolRegistry` 仅示例模块与单测使用。

**影响**：AI 无法真正调用平台 Tool；工具执行不经过服务端权限网关与统一审计；UI 协议没有版本与数据授权约束。

**修复**：按任务书第五章实现服务端 Tool Calling 循环（query/command、超时、最大轮次、审计、持久化状态）；UI 只返回注册表中的组件 ID + 版本 + presentation，数据由授权 API 获取。

---

## S-09 审计缺口（P1）

**证据**：`writeAudit` 调用点仅 CRUD、登录、导出、示例模块：[writeAudit 引用](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/core/audit.ts)

**缺失**：失败访问（401/403）、角色/权限变更的专门事件、模块生命周期、审批、Tool Registry 强制审计、批量导入汇总事件。

**修复**：在 `requireDashboardAccess` / `requireAdmin` / 模块生命周期 / Tool 执行器中统一记录；失败事件记录 actor 与资源但不记录敏感输入。

---

## S-10 模块体系硬编码（P1）

**证据**：[moduleCatalog.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/core/moduleCatalog.ts#L1-L15)、[moduleRuntime.ts](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/moduleRuntime.ts#L1-L25)、`nuxt.config.ts` 的 `AVAILABLE_MODULE_IDS`。

**影响**：新增模块必须修改 Core 文件；第三方模块无法独立接入；与“Core 不依赖具体业务模块”目标冲突。

**修复**：构建期生成静态模块清单（见 `MODULE_SDK_DESIGN.md`），Core 只消费清单，不含任何模块 ID 字面量。

---

## 不在本轮范围

- PostgreSQL RLS：继续使用应用层隔离，除非单独完成连接池/事务级上下文验证。
- 微服务拆分。
- SIS / CRM 等业务实现（Phase 5 仅做最小验证模块）。
