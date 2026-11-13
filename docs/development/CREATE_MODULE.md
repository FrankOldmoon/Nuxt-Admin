# 创建模块（Create Module）

> 目标：从零创建一个可被 Core 校验、迁移、注册 API/CRUD 并通过生命周期管理的业务模块。
> 架构背景见 [../architecture/MODULE_ARCHITECTURE.md](../architecture/MODULE_ARCHITECTURE.md)。

## 1. 创建目录

```text
modules/my-module/
├── module.ts
├── register.ts
├── nuxt/
│   ├── pages/my-module.vue
│   └── components/...
├── server/
│   ├── context.ts
│   ├── services/items.ts
│   └── database/
│       ├── schema.ts
│       └── migrations.ts
└── test/unit.test.ts
```

## 2. 定义 manifest

```ts
// modules/my-module/module.ts
import type { ModuleDefinition } from '../../server/sdk'
import { migrations } from './server/database/migrations'

export const myModule: ModuleDefinition = {
  id: 'my-module',
  name: 'My Module',
  version: '1.0.0',
  apiVersion: '1',
  compatibility: { core: '^1.0.0' },
  migrationScope: 'global',
  capabilities: { multiTenant: true },
  dependencies: [],
  dependencyRanges: {},
  permissions: [
    'my-module.items.read',
    'my-module.items.create',
    'my-module.items.update',
    'my-module.items.delete'
  ],
  navigation: [
    { id: 'my-module', label: 'My Module', to: '/my-module' }
  ],
  database: ['my_module_items'],
  api: ['GET /api/modules/my-module/items'],
  tools: [],
  components: [],
  migrations,
  register: async (context) => {
    const { registerMyModule } = await import('./register')
    return registerMyModule(context)
  }
}
```

规则：

- `id` 小写 `[a-z0-9-]`，全局唯一。
- `version` 严格 semver；发布后只增不改。
- `apiVersion` 必须等于 `MODULE_API_VERSION`（当前 `1`）。
- `compatibility.core` 必须满足 `CORE_VERSION`（当前 `1.0.0`）。
- 权限格式 `module.resource.action`，禁止 `*`、禁止重复。
- `database` 中列出的表必须在模块 schema 中定义。

## 3. 注册到 catalog

```ts
// modules.catalog.ts
import { myModule } from './modules/my-module/module'

export const MODULE_DEFINITIONS = [exampleModule, myModule]
export const DEFAULT_ENABLED_MODULE_IDS = ['example', 'my-module']
```

构建期启用：

```bash
ENABLED_MODULES=example,my-module pnpm dev
```

未在 catalog 中声明的 ID 会直接构建失败。

## 4. 注册 API / Tool / CRUD

```ts
// modules/my-module/register.ts
import type { ModuleApiRouter, ToolRegistry, UiRegistry } from '../../server/sdk'
import { registerDashboardTable } from '../../server/sdk'
import { myModuleItems } from './server/database/schema'

export async function registerMyModule(context: {
  api: ModuleApiRouter
  tools: ToolRegistry
  ui: UiRegistry
}) {
  context.api.register({
    id: 'my-module.items.list',
    moduleId: 'my-module',
    method: 'GET',
    path: '/items',
    schema: {},
    authorize: actor => Boolean(actor?.userId),
    handler: async () => ({ items: [] })
  })

  registerDashboardTable(
    {
      meta: {
        table: 'items',
        moduleId: 'my-module',
        resource: 'items',
        permissions: {
          read: 'my-module.items.read',
          create: 'my-module.items.create',
          update: 'my-module.items.update',
          delete: 'my-module.items.delete'
        },
        exposure: 'generic-crud',
        label: 'Items',
        icon: 'i-lucide-box',
        fields: [],
        features: { organizationScoped: true }
      },
      getTable: () => myModuleItems
    },
    { menuOrder: 90, exposure: 'generic-crud' }
  )
}
```

要求：

- 模块只能从 `server/sdk` 导入 Core 契约。
- 权限、组织归属、审计归属必须显式声明。
- API 路径统一由 `/api/modules/my-module/**` 分发。

## 5. 数据库

```ts
// modules/my-module/server/database/schema.ts
import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core'

export const myModuleItems = pgTable('my_module_items', {
  id: serial('id').primaryKey(),
  organizationId: varchar('organization_id', { length: 64 }),
  name: varchar('name', { length: 120 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow()
})
```

```ts
// modules/my-module/server/database/migrations.ts
import type { ModuleMigration } from '../../../../server/sdk'

export const migrations: ModuleMigration[] = [
  {
    id: 'my-module:001',
    checksum: '1',
    async up(executor) {
      await executor.query(`
        CREATE TABLE IF NOT EXISTS "my_module_items" (
          "id" serial PRIMARY KEY,
          "organization_id" varchar(64),
          "name" varchar(120) NOT NULL,
          "created_at" timestamptz NOT NULL DEFAULT now()
        )
      `)
    }
  }
]
```

- `id` 全局唯一；`checksum` 是作者维护的修订号。
- 修改已发布迁移内容必须提升 `checksum`，否则启动会报 checksum mismatch。
- 迁移只追加，不修改历史。

更完整规则见 [../architecture/DATABASE_MIGRATIONS.md](../architecture/DATABASE_MIGRATIONS.md)。

## 6. 页面与导航

- 页面放在 `modules/my-module/nuxt/pages/`。
- 导航在 manifest `navigation` 声明；也可通过 `registerDashboardTable(..., { menuOrder })` 进入 dashboard 菜单。
- 页面应通过平台 API 获取数据，不直接信任前端传入的组织/租户。

## 7. 测试

至少覆盖：

- 权限允许/拒绝。
- 跨组织写入被拒绝。
- 专用创建服务的审计 `module_id`。
- 迁移幂等与失败重试。

```bash
pnpm vitest run test/unit/modules/my-module
```

参考 [MODULE_TESTING.md](./MODULE_TESTING.md)。

## 8. 检查清单

- [ ] `modules.catalog.ts` 已登记，`ENABLED_MODULES` 可解析。
- [ ] manifest 通过 `validateModuleManifests`。
- [ ] 只从 `server/sdk` 导入 Core 契约。
- [ ] 权限为 `module.resource.action`，无通配符。
- [ ] 迁移 ID 唯一、只追加、幂等、checksum 已提升。
- [ ] 组织/租户由服务端注入。
- [ ] 模块测试覆盖跨组织拒绝与审计归属。
- [ ] `pnpm test`、`pnpm build` 通过。
