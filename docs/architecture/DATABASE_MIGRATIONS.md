# 数据库迁移（Database Migrations）

> 状态：**Implemented**。
> 模块生命周期见 [MODULE_LIFECYCLE.md](./MODULE_LIFECYCLE.md)。

## 1. 两条迁移通道

| 通道 | 内容 | 执行者 |
|---|---|---|
| 主库 Drizzle 迁移 | `server/database/migrations/*.sql` + `meta/` | `drizzle-kit migrate` / 发布入口 |
| 模块迁移 | `{ id, checksum, up(executor) }` 数组，位于 `modules/<id>/server/database/migrations.ts` | `applyModuleMigrations` |

两条通道都由同一个发布入口串联：

```bash
pnpm db:migrate:release   # tsx server/database/migrate.ts
```

## 2. 发布入口顺序

`server/database/migrate.ts`：

```text
1. 读取 DATABASE_URL（缺失直接失败）
2. resolveModuleCatalog(MODULE_DEFINITIONS, resolveEnabledModuleIds())
3. Drizzle migrate('./server/database/migrations')
   —— 与 drizzle.config.ts、开发启动插件共用 public.__drizzle_migrations
4. 模块 onRegister → onEnable 生命周期
5. applyModuleMigrations（事务 + advisory lock）
6. 每个模块写 module_states = migrated（active/deactivated 不覆盖）
   迁移失败 → 写 failed → 抛错
7. Blog 迁移（BLOG_ENABLED != 'false'）
```

> 发布入口、`drizzle.config.ts` 与开发启动插件必须使用同一张迁移历史表（`public.__drizzle_migrations`）。早期发布入口使用 Drizzle 默认的 `drizzle.__drizzle_migrations`，会与开发模式形成两份历史，导致“表已存在”错误；已修正。

生产实例启动时**不自动迁移**：`server/plugins/database.ts` 在 `NODE_ENV === 'production'` 时跳过迁移，仅补齐配置并校验连接。

## 3. 开发环境

`NODE_ENV !== 'production'` 时启动插件自动：

1. `ensureDatabase()` 创建目标库。
2. 执行主库 Drizzle 迁移。
3. 模块生命周期 + 模块迁移。
4. seed（幂等）。

> 早期文档提到的 `AUTO_MIGRATE` 环境变量已不再使用；实际行为由 `NODE_ENV` 决定。

## 4. 主库迁移规范

1. 修改 `server/database/schema.ts`。
2. `pnpm db:generate` 生成新的 `NNNN_name.sql` + `meta` 快照。
3. 人工审查 SQL（索引、约束、默认值、回填）。
4. 本地 `pnpm db:migrate`。
5. `pnpm exec drizzle-kit check` 校验快照一致性。
6. 提交 SQL 与 `meta/`。

约定：

- 迁移**只追加**，已发布文件不得修改；修正需新增迁移。
- 破坏性变更（删列/改类型）必须提供回填或独立迁移步骤。
- 大表索引使用并发创建或明确维护窗口。

近期与架构升级相关的迁移：

| 迁移 | 内容 |
|---|---|
| `0009_core_organizations_audit.sql` | 组织/成员/审计基础 |
| `0011_wealthy_storm.sql` | `files.visibility`、`organization_id`、`tenant_id` |
| `0012_daffy_iron_man.sql` | 租户/组织索引 |
| `0013_orange_gorgon.sql` | Agent `agent_executions` / `agent_tool_calls` / `agent_approvals` / `agent_artifacts` |

## 5. 模块迁移

```ts
// modules/<id>/server/database/migrations.ts
export const migrations: ModuleMigration[] = [
  {
    id: 'my-module:001',
    checksum: '1',        // 作者维护的修订号；修改迁移体必须提升
    async up(executor) {
      await executor.query('CREATE TABLE IF NOT EXISTS ...')
    }
  }
]
```

`server/database/moduleMigrations.ts` 行为：

| 场景 | 行为 |
|---|---|
| 未应用 | 在事务内执行 `up`，写 `applied` + 耗时 |
| 已应用且 checksum 一致 | 跳过 |
| 已应用但 checksum 不一致 | 抛错，拒绝静默修改历史迁移 |
| 旧格式 checksum | 自动升级一次 |
| 执行失败 | `ROLLBACK`，写 `failed` + `last_error`，下次重试 |
| 并发实例 | `pg_advisory_xact_lock` 串行化同一迁移 |

`__module_migrations` 字段：`id`、`module_id`、`module_version`、`checksum`、`status`、`duration_ms`、`last_error`、`applied_at`。

**卸载模块不会删除迁移历史或业务表。**

## 6. 测试数据库

- 集成测试使用真实 PostgreSQL（`DATABASE_URL`，默认 `postgres://postgres:postgres@localhost:5432/nuxt_ai`）。
- `test/setup/global.ts` 在缺失时提供默认连接串。
- SIS/example 集成测试在 `beforeAll` 调用 `applyModuleMigrations()`。
- e2e 通过 `@nuxt/test-utils` 启动 Nuxt，开发模式启动插件会执行主库迁移与 seed。
- CI 使用 PostgreSQL 16 service，并在测试前运行 `pnpm db:migrate:release`。

不要用 mock 数据库替代租户隔离、事务、迁移行为测试。

## 7. 回滚策略

- 基础库（Drizzle）迁移仍**不做自动回滚**：发布前备份；失败时通过新迁移修复或从备份恢复。
- 模块迁移支持**显式单步回滚**（需要该迁移声明 `down`）：

```bash
# 列出可回滚的已应用模块迁移
pnpm db:rollback:module --list

# 回滚指定迁移（在同一事务内执行 down，并删除 __module_migrations 记录）
pnpm db:rollback:module sms:004-academic-domain
```

  - `down` 未声明 → 直接报错，不做猜测性删表。
  - 迁移未处于 `applied` 状态 → 报错，避免重复回滚。
  - `down` 失败 → 事务回滚，记录保持 `applied`，数据不受影响。
- 模块卸载只改变状态，不删数据；需要清理时由管理员显式执行独立脚本。
- 生产发布建议：备份 → `pnpm db:migrate:release` → 启动新实例 → 健康检查。

## 8. 检查清单

- [ ] `pnpm db:generate` 已生成 SQL + meta。
- [ ] `pnpm exec drizzle-kit check` 通过。
- [ ] 迁移只追加，历史文件未修改。
- [ ] 新模块迁移声明唯一 `id` 与 `checksum`。
- [ ] 需要可回滚的模块迁移已声明 `down`，并验证 `pnpm db:rollback:module --list` 可见。
- [ ] 本地 `pnpm test` 通过（含真实 PG 集成测试）。
- [ ] 生产发布前已备份，并安排维护窗口（如需）。
