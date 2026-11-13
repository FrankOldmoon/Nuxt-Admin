# 模块生命周期（Module Lifecycle）

> 状态：**Implemented**。
> 架构与 SDK 契约见 [MODULE_ARCHITECTURE.md](./MODULE_ARCHITECTURE.md)。

## 1. 状态机

`server/core/moduleState.ts`：

```text
discovered → validated → installed → migrated → active ⇄ deactivated
                                                  deactivated → uninstalling → uninstalled
任意阶段 → failed →（修复后重试）
```

合法转换：

| From | 允许的 To |
|---|---|
| `discovered` | `validated`, `failed` |
| `validated` | `installed`, `failed` |
| `installed` | `migrated`, `failed` |
| `migrated` | `active`, `failed` |
| `active` | `deactivated`, `failed` |
| `deactivated` | `active`, `uninstalling`, `failed` |
| `uninstalling` | `uninstalled`, `failed` |
| `uninstalled` | —（终态） |
| `failed` | 重试任意目标（由 `recordModuleState` 放行） |

- `uninstalled` 是终态，重新安装必须走新的安装流程，不能直接切回 `active`。
- `failed` 可重试，便于修复迁移/启动错误后恢复。

## 2. 持久化

`server/database/moduleStates.ts` → `recordModuleState(db, entry)`：

1. 在事务中读取 `module_states` 当前状态。
2. 非 `failed` 且状态变化时执行 `assertTransition()`；相同状态写入是幂等 no-op。
3. Upsert `module_states`（`version`、`state`、`last_error`、`updated_at`）。
4. **同一事务**写入 `audit_logs`：`action = module.<state>`，`resource = module_states`，`recordId = moduleId`。

因此状态与审计不会出现“状态成功但审计丢失”的不一致。

## 3. 启动与发布中的状态

| 场景 | 行为 |
|---|---|
| 开发启动（`server/plugins/database.ts`） | 迁移成功后写 `migrated`；失败写 `failed` 并抛出 |
| 发布迁移（`pnpm db:migrate:release`） | 同上，source = `release-migration` |
| 已 `active` / `deactivated` | 启动/发布不覆盖 |
| 迁移失败 | 所有模块写 `failed`，修复后可重试 |

## 4. 模块迁移

`server/database/moduleMigrations.ts`：

- 每个迁移是 `{ id, checksum, up(executor) }`。
- `checksum` 是**作者维护的修订号**（而不是函数源码哈希），避免不同打包器差异。
- 计算值：`v2:sha256(id + "\n" + checksum)`。
- PostgreSQL 事务 + `pg_advisory_xact_lock('module-migration:<id>')` 串行化。
- `__module_migrations` 记录 `module_id`、`module_version`、`checksum`、`status`、`duration_ms`、`last_error`、`applied_at`。
- 已应用迁移的 checksum 不匹配 → 直接失败（防止静默修改历史迁移）。
- 旧格式 checksum 会自动升级一次；缺少 `checksum` 的迁移在 manifest 校验阶段即被拒绝。
- 失败记录 `status='failed'`，修复后重试；成功后覆盖为 `applied`。

详见 [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md)。

## 5. 操作入口

| 操作 | API | 前置条件 | 结果 |
|---|---|---|---|
| `validate` | `PUT /api/dashboard/modules/:id` `{ action: 'validate' }` | admin | 重新校验全部 manifest，422 返回错误 |
| `enable` | `{ action: 'enable' }` | 状态 `migrated` 或 `deactivated` | `active`（已 active 幂等返回） |
| `disable` | `{ action: 'disable' }` | 状态 `active` | `deactivated`（已停用幂等返回） |
| `uninstall` | `{ action: 'uninstall', confirm: '<id>' }` | `deactivated` 或 `uninstalling`；`confirm` 必须等于模块 ID；无 active 依赖方 | `uninstalling → uninstalled` |

管理页面：`/dashboard/modules`（仅管理员）。

## 6. 卸载守卫

`server/core/moduleGuards.ts`：

- `activeDependents(definitions, moduleId, stateOf)`：列出依赖该模块且处于 `active` 的模块。
- 存在 active 依赖方 → `409`，消息中列出依赖方。
- 卸载**不删除业务数据**：不 DROP 表、不删除记录、不删除迁移历史；数据清理必须由管理员显式执行独立脚本/迁移。
- 两步卸载（`deactivated → uninstalling → uninstalled`）保证崩溃后仍可重试。

## 7. 运行时门禁

`server/core/moduleGuards.ts`：

```ts
UNAVAILABLE_MODULE_STATES = ['deactivated', 'uninstalling', 'uninstalled']
```

`server/api/modules/[...path].ts` 在这些状态下对 `/api/modules/<id>/**` 返回 **403**。

注意：

- 停用/卸载不会卸载已编译的 Nuxt 页面（layer 是构建期概念）。
- 要彻底移除页面/组件，需要从 `ENABLED_MODULES` 移除并重新构建。
- 通用 CRUD 中已注册的表不会因模块停用而自动隐藏；管理页面会展示状态，业务侧应同时参考模块状态。

## 8. 测试覆盖

| 测试 | 覆盖 |
|---|---|
| `test/unit/server/core/moduleManifest.test.ts` | manifest 校验、权限/兼容性 |
| `test/unit/server/core/moduleStates.test.ts` | 合法/非法转换、幂等、卸载链 |
| `test/unit/server/database/moduleMigrations.test.ts` | 幂等、失败重试、checksum 篡改 |
| `test/unit/server/core/modules.test.ts` | 目录解析、依赖、卸载守卫 |
| `test/e2e/api.test.ts` | 模块目录 API 的认证与响应 |
| `test/unit/modules/example/integration.test.ts` | 状态持久化与审计 |
