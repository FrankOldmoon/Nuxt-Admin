# ADR 0001 — 单一模块 catalog 管线

- Status: Accepted
- Date: 2026-06-30

## Context

早期实现里模块目录、构建期 layer、运行期注册各自硬编码 `example`，新增模块需要改多处，且不同入口的校验/排序可能不一致。

## Decision

- `modules.catalog.ts` 是模块定义的唯一来源（id、manifest、依赖）。
- 所有入口统一调用 `resolveModuleCatalog()`：manifest 校验 → 启用 ID 校验 → 依赖排序。
- 使用方包括开发启动插件、发布迁移入口、运行期装配、`nuxt.config.ts` layer 派生。
- 未知启用 ID 直接失败，而不是静默忽略。

## Consequences

正面：

- 新增模块只改 catalog 一处（加上 layer 目录）。
- 校验与排序行为一致，避免“启动通过、发布失败”。
- 依赖/循环/版本范围在任何入口都能被发现。

负面：

- catalog 是静态导入，模块必须在构建期存在。
- 运行期不能安装任意新模块。

## 相关实现

- `modules.catalog.ts`
- `server/core/moduleCatalog.ts`
- `server/core/moduleManifest.ts`
- `nuxt.config.ts`
