# 模块测试（Module Testing）

> 目标：用现有 Vitest 体系覆盖模块契约、权限、生命周期、迁移与真实数据库行为。

## 1. 测试分层

| 层级 | 目录/示例 | 说明 |
|---|---|---|
| 单元 | `test/unit/server/core/*`、`test/unit/modules/*` | 纯函数、manifest、权限、生命周期转换 |
| 集成（真实 PG） | `test/unit/modules/example/integration.test.ts`；外部 SIS/SMS 模块的 `test/`（在 `Nuxt-Extend-SMS` 仓库） | 建表、写入、跨组织拒绝、审计 |
| 授权 | `test/unit/server/auth.test.ts`、`permissions.test.ts`、`fileAccess.test.ts` | 守卫与决策 |
| 模块 SDK | `moduleDecoupling.test.ts`、`modules.test.ts` | 契约边界、注册表、工具限制 |
| 生命周期 | `moduleStates.test.ts`、`modules.test.ts` | 状态机、卸载守卫 |
| 迁移 | `moduleMigrations.test.ts` | 幂等、失败重试、checksum 篡改 |
| API | `test/e2e/api.test.ts` | 认证后的 HTTP 行为、模块目录 API |
| 组件/组合式 | `test/nuxt/**` | Nuxt 运行时环境 |

## 2. 真实数据库

- 集成测试直接使用 `server/database` 的 `pool` / `db`。
- 不使用 mock 替代租户隔离、事务、迁移行为。
- 默认连接：`postgres://postgres:postgres@localhost:5432/nuxt_ai`（`test/setup/global.ts`）。
- 模块集成测试在 `beforeAll` 调用 `applyModuleMigrations(pool, MODULE_DEFINITIONS)`。
- 测试数据使用唯一后缀，避免并发冲突：

```ts
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
```

## 3. 模块必测内容

1. **权限允许/拒绝**：无权限 actor 被拒绝，admin/规范权限通过。
2. **组织/租户隔离**：跨组织创建、更新、关系引用必须失败。
3. **审计归属**：专用创建服务写入的 `audit_logs.module_id` 正确。
4. **迁移幂等**：重复执行不报错；失败后可重试；checksum 不一致被拒绝。
5. **生命周期**：非法转换被拒绝；卸载需先停用；active 依赖方阻止卸载。
6. **契约边界**：模块不 import `server/core/**`（由解耦测试覆盖）。

## 4. 示例

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { pool } from '../../../../server/database'
import { applyModuleMigrations } from '../../../../server/database/moduleMigrations'
import { MODULE_DEFINITIONS } from '../../../../modules.catalog'

describe('my module (database)', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let organizationId = 0

  beforeAll(async () => {
    await applyModuleMigrations(pool, MODULE_DEFINITIONS)
    const tenant = await pool.query(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
      ['my-module-itest', `my-${suffix}`]
    )
    const org = await pool.query(
      `INSERT INTO organizations (tenant_id, name, slug) VALUES ($1, $2, $3) RETURNING id`,
      [tenant.rows[0].id, 'My Org', `my-org-${suffix}`]
    )
    organizationId = org.rows[0].id
  })

  it('rejects cross-organization writes', async () => {
    // 以另一个组织为上下文创建，应被拒绝
  })
})
```

## 5. 运行

```bash
# 模块自身
pnpm vitest run test/unit/modules/my-module

# 全量（需本地 PostgreSQL）
pnpm test

# 覆盖率
pnpm test:coverage
```

`vitest.config.ts` 已包含 `modules/*/test/**`；模块自带测试可直接放在模块目录。

## 6. CI

`.github/workflows/ci.yml` 使用真实 PostgreSQL 16 service，并在测试前执行：

```bash
pnpm exec drizzle-kit check
pnpm db:migrate:release
pnpm test
pnpm build
```

lint/typecheck 为历史债务的非阻塞步骤，不作为测试通过依据。

## 7. 检查清单

- [ ] 新增权限有允许/拒绝用例。
- [ ] 跨组织/跨租户写入与关系引用有用例。
- [ ] 审计 `module_id` 有用例。
- [ ] 新迁移有幂等/重试用例。
- [ ] 模块测试在真实 PG 下通过。
- [ ] 模块未从 `server/core/**` 导入。
