# ADR 0003 — 租户/组织上下文只由服务端解析

- Status: Accepted
- Date: 2026-06-30

## Context

浏览器可以提交任意 header/body。如果把 `x-organization-id` 或请求体中的 tenant/organization 当作授权依据，攻击者可以切换到其他租户的数据。

## Decision

- `getOrganizationContext()` 只读取 active `organization_memberships`。
- 显式组织 ID 只是“选择器”，必须匹配成员关系；否则 403。
- 未提供 ID 时，只有一个 active membership 自动选中；多个或零个不自动选择。
- 组织内成员角色优先于全局角色（`effectiveRoleId`）。
- 创建/更新 CRUD 时归属列由服务端注入/移除，不信任浏览器值。
- 关系外键在写入前校验目标归属（`assertRelationScope`）。

## Consequences

正面：

- 租户隔离不依赖前端行为。
- 多组织用户可以显式切换，但只能切到有成员关系的组织。

负面：

- 多组织用户在某些 API 调用中必须提供组织选择（或依赖唯一成员关系）。
- 直连数据库的工具/脚本仍需自行遵守隔离约束（无 RLS）。

## 相关实现

- `server/utils/auth.ts`
- `server/core/authContext.ts`
- `server/utils/dashboard/crudService.ts`
- `server/core/dataScope.ts`
