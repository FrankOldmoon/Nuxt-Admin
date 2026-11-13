# ADR 0002 — 运行期模块状态不动态卸载构建期 layer

- Status: Accepted
- Date: 2026-06-30

## Context

模块的页面、组件、composables 是 Nuxt layer，在 `nuxt build` 时编译进应用。运行期需要能停用模块 API、阻止继续使用能力，但无法安全地在进程中卸载已编译代码和路由。

## Decision

- 构建期由 `ENABLED_MODULES` 决定加载哪些 layer。
- 运行期通过 `module_states` 与生命周期服务控制模块 API 可用性。
- `deactivated` / `uninstalling` / `uninstalled` 状态下，`/api/modules/<id>/**` 返回 403。
- 停用/卸载不删除业务数据、不 DROP 表、不删除迁移历史。
- 要彻底移除页面/路由，必须从 `ENABLED_MODULES` 移除并重新构建。

## Consequences

正面：

- 状态变更可审计、可回滚、无需重新构建。
- 避免运行期卸载代码带来的内存泄漏与路由不一致。

负面：

- 停用后页面仍可能被访问（页面本身需自行检查模块状态或后端 API 已拒绝）。
- 真正的“卸载”是运维层面的构建变更。

## 相关实现

- `nuxt.config.ts`
- `server/core/moduleState.ts`
- `server/database/moduleStates.ts`
- `server/api/modules/[...path].ts`
- `app/pages/dashboard/modules.vue`
