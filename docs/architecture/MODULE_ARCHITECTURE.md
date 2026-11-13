# 模块架构（Module Architecture）

> 状态：**Implemented**。生命周期细节见 [MODULE_LIFECYCLE.md](./MODULE_LIFECYCLE.md)。
> 面向开发者的操作步骤见 [../development/CREATE_MODULE.md](../development/CREATE_MODULE.md)。

## 1. 目标与边界

模块是**独立业务包**（可以是独立 Git 仓库），通过稳定契约接入平台：

| 模块可以做 | 模块不可以做 |
|---|---|
| 从 `server/sdk` 导入类型、注册函数、权限/数据范围/审计/CRUD 契约 | 从 `server/core/**` 或 `server/utils/**` 直接 import 实现 |
| 拥有自己的 `nuxt/` 页面、`server/` API/服务、`database/` schema 与迁移 | 在 Core 中硬编码模块 ID 或业务逻辑 |
| 在 `modules.catalog.ts` 注册一条定义 | 运行时动态 `import()` 未受信任代码 |
| 声明权限、导航、API、Tool、UI、迁移 | 声明通配权限 `*` 或重复权限 |

解耦由单元测试静态检查：

- `test/unit/server/core/moduleDecoupling.test.ts`：Core 不 import 具体模块；模块不 import `server/core/**`。

## 2. 公开 SDK

唯一契约入口：`server/sdk/index.ts`

```text
server/sdk
 ├─ moduleSdk              ModuleDefinition / ModuleManifest / ModuleApiRouter
 │                         ToolRegistry / UiRegistry / runModuleLifecycle / runModuleMigrations
 ├─ moduleManifest         validateModuleManifests / CORE_VERSION / MODULE_API_VERSION
 ├─ permissions            authorize / permMatches / roleCan* / ADMIN_ONLY_TABLES
 ├─ dataScope              DataScope 契约与 registerDataScopeResolver
 ├─ audit                  writeAudit / 审计类型
 ├─ dashboard/tables       registerDashboardTable
 ├─ dashboard/validators   registerTableValidator
 └─ app/types/dashboard    TableMeta / FieldMeta / TableFeatures 类型
```

`MODULE_API_VERSION` 表示契约版本；不兼容变更必须提升版本并要求模块 manifest 的 `apiVersion` 匹配。

## 3. 模块清单（Catalog）

唯一来源：仓库根 `modules.catalog.ts`

```ts
export const MODULE_DEFINITIONS = [exampleModule]
export const AVAILABLE_MODULE_IDS = MODULE_DEFINITIONS.map(m => m.id)
export const DEFAULT_ENABLED_MODULE_IDS = ['example']
export function resolveEnabledModuleIds(value = process.env.ENABLED_MODULES): string[]
```

- 位于根目录而不是 `modules/` 内，因为 Nuxt 会把 `modules/` 顶层文件当作本地 Nuxt module。
- `ENABLED_MODULES`（空格/逗号/换行分隔）决定构建期加载哪些 layer。
- `nuxt.config.ts` 从 `AVAILABLE_MODULE_IDS` 校验启用 ID，未知 ID 直接构建失败。

## 4. Manifest 与校验

`ModuleDefinition` 关键字段：

```ts
{
  id, name, version,                 // ID 小写 [a-z0-9-]，version 严格 semver
  apiVersion,                        // 必须等于 MODULE_API_VERSION
  compatibility: { core: '^1.0.0' }, // 必须满足 CORE_VERSION
  migrationScope: 'global'|'tenant',
  capabilities: { multiTenant: true },
  dependencies: [], dependencyRanges: {},
  permissions: ['my-module.items.read'],
  navigation: [{ id, label, to }],
  database: ['my_module_items'],
  api: [...], tools: [...], components: [...],
  migrations: [{ id, checksum, up }],
  register(context) { ... }
}
```

`validateModuleManifests()`（`server/core/moduleManifest.ts`）校验：

- ID 格式与唯一性。
- semver、`apiVersion`、`compatibility.core`。
- 权限格式、禁止 `*`、禁止重复。
- 导航项字段与 ID 唯一性。
- capabilities 值必须为布尔。
- `migrationScope` 只能是 `global` / `tenant`。
- 迁移 ID 非空且全局唯一，必须声明 `checksum` 修订号。

校验失败时模块不会进入激活流程；运行期可通过 `/api/dashboard/modules` 查看 `validation.ok=false` 与错误。

## 5. 单一发现管线

`resolveModuleCatalog(definitions, enabledIds)`（`server/core/moduleCatalog.ts`）：

```text
manifest 校验
   → 启用 ID 校验（未声明的 ID 直接报错）
   → 依赖存在性 / 循环 / 版本范围排序
   → { modules, enabledIds, order }
```

使用方（全部走同一入口）：

- `server/plugins/database.ts`（开发启动）
- `server/plugins/modules.ts`（运行期装配）
- `server/utils/moduleRuntime.ts`
- `server/database/migrate.ts`（发布迁移）
- `nuxt.config.ts` 从 catalog 派生 layer 列表

## 6. 构建期 layer 与运行期状态

```text
构建期（nuxt build）
 ENABLED_MODULES → modules/<id> Nuxt layer
   页面 / 组件 / composables / 插件编译进应用

运行期（启动后）
 resolveModuleCatalog → 校验 → 注册 API / Tool / UI / CRUD
   module_states 状态决定 /api/modules/<id>/** 是否可用
```

重要约束：

- 运行期停用/卸载**不会**卸载已编译的 Nuxt layer；要彻底移除页面需从 `ENABLED_MODULES` 移除并重新构建。
- 运行期门禁只影响模块 API 能力与状态；这是有意的设计，见 ADR 0002。

## 7. 注册表

| 注册表 | 作用 | 入口 |
|---|---|---|
| `ModuleApiRouter` | 模块 HTTP API，统一挂载 `/api/modules/<id>/**` | `register(context)` |
| `ToolRegistry` | Agent 工具，含风险/权限/限流/超时/输出限制 | `register(context)` |
| `UiRegistry` | Agent UI 卡片描述与校验 | `register(context)` |
| `registerDashboardTable` | 通用 CRUD 元数据（moduleId/resource/permissions/contextColumns） | `server/sdk` |
| `registerTableValidator` | 模块业务校验（组织归属、跨表约束） | `server/sdk` |
| `registerDataScopeResolver` | 模块自定义数据范围 | `server/sdk` |

API 分发：`server/api/modules/[...path].ts`

```text
/auth → 生命周期门禁 → router 匹配 → module authorize → handler
```

## 8. 推荐目录结构

```text
modules/<id>/
├── module.ts                 # ModuleDefinition（manifest + register + migrations）
├── register.ts               # 注册 API / Tool / UI / CRUD 元数据
├── nuxt/                     # Nuxt layer（pages / components / composables / plugins）
├── server/
│   ├── context.ts            # 模块内权限与 actor
│   ├── services/             # 业务服务
│   └── database/
│       ├── schema.ts
│       └── migrations.ts     # { id, checksum, up }
├── test/
└── docs/
```

内置模块：`modules/example`（示例）。SMS 模块位于独立仓库 `Nuxt-Extend-SMS`，克隆到 `modules/sms` 并在 catalog 注册 `smsModule` 后启用。

## 9. 模块管理

| 能力 | 位置 |
|---|---|
| 列表/校验/状态/迁移历史 | `GET /api/dashboard/modules` |
| 校验/启用/停用/卸载 | `PUT /api/dashboard/modules/:id` |
| 管理页面 | `app/pages/dashboard/modules.vue` |
| 依赖守卫 | `server/core/moduleGuards.ts` |

全部状态变更经过生命周期服务，详见 [MODULE_LIFECYCLE.md](./MODULE_LIFECYCLE.md)。

## 10. 限制与后续

| 项 | 状态 | 说明 |
|---|---|---|
| 运行期动态加载代码 | 不支持（设计如此） | 模块在构建期编译 |
| 独立仓库自动安装 | Planned | 目前需 clone/submodule 到 `modules/<id>` 后重新构建 |
| 模块事件总线 | Planned | 当前用生命周期回调与注册表 |
| Agent 模块抽取 | Planned | Agent 仍在 Core |

## 11. SDK 稳定化（2026-11）

- **兼容校验**：`validateModuleManifests` 要求 `apiVersion === MODULE_API_VERSION`；版本范围支持 `^`/`~`/`>=`/`>`/精确。
- **迁移契约**：`ModuleMigration` 增加可选 `down`（文档化回滚方式，暂不自动执行）；`up` 仍按 `id + checksum` 记录，重复执行幂等。
- **注册表一致性**：`test/unit/server/core/moduleDecoupling.test.ts` 会自动扫描 `modules/*/module.ts`，要求每个本地模块都在 `modules.catalog.ts` 中注册，防止手工目录漂移。
- **边界校验**：同一测试会扫描所有本地模块源码，禁止 `import server/core/**`；模块只能通过 `server/sdk`、`server/database` 与宿主交互。
- **构建期组合 vs 运行期激活**：`ENABLED_MODULES` 决定 layer 与注册；`module_states` 决定运行期 API/工具是否放行，两者继续分离。
- **CI**：新增“无业务模块”构建 job，验证禁用所有模块时主仓库仍可构建。
