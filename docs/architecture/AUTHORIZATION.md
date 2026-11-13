# 授权（Authorization）

> 状态：**Implemented**；文末列出 **Partial / Planned** 项。

## 1. 原则

- 认证与授权上下文**只由服务端创建**。客户端不能提交角色名、权限数组、`tenantId`、`organizationId` 作为授权证据。
- 默认拒绝：无权限、缺上下文、未知数据范围、签名无效都返回 401/403，而不是放行。
- 所有 dashboard 路由共用 `requireDashboardAccess`，所有通用 CRUD 共用同一条管线。

## 2. 会话与 AuthContext

入口：`server/utils/auth.ts`

```text
getSessionUser(event)
 ├─ readSessionToken(cookie)
 ├─ verifySessionToken → tokens 表（type=session）
 ├─ findUserById（isActive 且未软删除）
 ├─ getOrganizationContext(userId)
 ├─ effectiveRoleId(globalRoleId, membershipRoleId)  // 成员角色优先
 └─ AuthContext
```

`AuthContext`（`server/core/authContext.ts`）：

```ts
{
  user: UserRow
  role: RoleRow | null                 // 当前组织内有效角色
  organization?: OrganizationContext | null
  tenantId?: number | null
  membershipId?: number | null
  departmentId?: number | null
  permissions: string[]                // 来自有效角色
}
```

## 3. 组织上下文解析

`getOrganizationContext`：

| 请求情况 | 结果 |
|---|---|
| 未提供组织 ID，且只有 1 个 active membership | 自动使用该组织 |
| 未提供组织 ID，且 0 或多个 active membership | `null` |
| 提供 `x-organization-id` / `event.context.organizationId`，且匹配 active membership | 使用该组织 |
| 提供 ID 但无 active membership | `403 No active membership in the requested organization` |
| 提供非法 ID | `400 Invalid organization context` |

- 请求头只是**选择器**，不是授权依据；必须与数据库成员关系匹配。
- 需要组织的模块应调用 `getActiveOrganization(event)`，无组织时直接 403。

## 4. 权限模型

### 4.1 权限字符串

| 形式 | 含义 |
|---|---|
| `*` | 全部表、全部动作 |
| `sis:read` | `sis` 表所有动作（旧式） |
| `sis:create` | `sis` 表 create 动作（旧式） |
| `sis.students.read` | 规范资源权限：模块.资源.动作（推荐） |
| `files:read` | 文件访问使用的动作式权限 |

`permMatches(perm, table, action)` 同时兼容旧式 `table` / `table:action` 与规范资源权限（通过 `TableMeta.permissions` 映射）。

### 4.2 决策点

`authorize(ctx, resource)`（`server/core/permissions.ts`）：

1. `ADMIN_ONLY_TABLES` 且非 admin → 拒绝（`admin-only`）。
2. 无 table（如 dashboard 首页）→ 需要 admin 或至少一个 dashboard 权限。
3. 规范权限命中 `resource.permissions[action]` → 允许。
4. admin 或旧式 `table:action` 命中 → 允许。
5. 否则拒绝（`action-denied`）。

`ADMIN_ONLY_TABLES` 包含 users/roles/configs/files、tokens/sessions/audit、tenants/organizations/memberships/departments、私信与 OAuth/WX 内部表。

### 4.3 动作映射

| TableAction | 覆盖操作 |
|---|---|
| `read` | list、detail、export |
| `create` | create、import |
| `update` | update |
| `delete` | batch 软删/恢复/永久删除 |

路由层通过 `requireDashboardAccess(event, table, action)` 统一执行，并在拒绝时写 `access.denied` 审计。

## 5. 数据范围（行级）

`server/core/dataScope.ts` 支持：

`own`、`assigned`、`department`、`organization`、`tenant`、`global`。

规则：

- 表级 `features.dataScope.scope` 优先于旧的角色级 `dataScope`（`all` → `global`，`self` → `own`）。
- `global` 必须显式拥有 `*` 或 `global`；**admin 身份本身不隐含**。
- 缺列映射 → `missing-column`；缺组织/租户/部门上下文 → `missing-context`；未知 resolver → `unknown-resolver`。全部拒绝。
- 模块可通过 `registerDataScopeResolver()` 提供领域逻辑（如 SIS 教师只看所授班级）。
- 单条记录读取后还会用 `recordMatchesScope()` 复核，避免绕过列表过滤。

## 6. 字段策略

`server/core/fieldPolicy.ts`：

- 按角色名声明字段可读/可写。
- 读取时 `hideUnreadableFields()` 移除字段；写入时 `assertWritableFields()` 拒绝越权字段。
- 未配置策略的表不受影响（默认全部可读写，但仍受表级权限约束）。

## 7. 文件授权

`server/core/fileAccess.ts` + `server/utils/fileRequest.ts`：

| 文件 visibility | 访问规则 |
|---|---|
| `public` | 任何人可访问 |
| `private` | owner、admin、或同组织且拥有 `files:read`/`*` 的成员 |

- 新上传默认 `private`；历史数据迁移回填为 `public`。
- 私有文件可用 `createSignedFileUrl(path, ttl)` 生成短时签名 URL；`verifySignedFileUrl` 校验过期时间与 HMAC（timing-safe），失败关闭。
- 路径访问必须先查数据库文件记录，再经 `getAbsolutePath` 防目录穿越；e2e 覆盖 404 场景。
- 拒绝访问会写审计。

## 8. 模块 API 授权

`server/api/modules/[...path].ts`：

1. 生命周期门禁：`deactivated` / `uninstalling` / `uninstalled` → 403。
2. 通过 `ModuleApiRouter` 按 module id + path 查找。
3. 执行模块声明的 `authorize(actor)`。
4. 调用 handler。

模块权限必须声明为 `module.resource.action`，禁止 `*`；manifest 校验阶段会拒绝通配符与重复项。

## 9. Agent 工具授权

`ToolRegistry.run` 每次调用都重新检查：

- 工具声明的权限与当前 actor。
- 风险级别与 `requiresApproval`；高风险调用必须进入持久化审批。
- 限流、超时、取消信号、输出字节上限。

审批绑定执行批次与参数哈希（`server/core/agentApproval.ts`），浏览器不能把一次审批复用到不同参数。

## 10. 审计

| 事件 | 位置 |
|---|---|
| CRUD 写操作 | `crudService` 同事务写 `audit_logs`，含 `moduleId` / `resource` |
| 拒绝访问 | `requireDashboardAccess` → `access.denied` |
| 登录成功/失败 | 认证路由 |
| 模块状态转换 | `module.<state>` |
| Agent 工具/审批 | Agent loop 与 `agentStore` |

脱敏由 `writeAudit` 统一处理（password/token/secret/credential/apiKey）。

## 11. 已知边界

| 项 | 状态 | 说明 |
|---|---|---|
| 规范资源权限全覆盖 | Partial | 新表（SIS、files 等）已声明；旧表仍依赖 `table`/`table:action` |
| 组织/部门级管理员 | Planned | 目前 admin 是全局角色；成员角色已参与授权但无“组织管理员”独立语义 |
| 通用 `DELETE /data/:table/:id` | 不存在（设计如此） | 删除统一走 `/batch`，UI 已匹配 |
| 多实例全局限流 | Planned | 当前限流为进程内 |
| WS LLM 路径工具授权 | Partial | WS 流式不走服务端工具管道 |
