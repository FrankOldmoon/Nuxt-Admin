# Module SDK 设计（vNext）

> **Implemented**：本设计已落地；当前契约与生命周期以
> [architecture/MODULE_ARCHITECTURE.md](./architecture/MODULE_ARCHITECTURE.md)、
> [architecture/MODULE_LIFECYCLE.md](./architecture/MODULE_LIFECYCLE.md) 为准。

> Phase 0 产出。目标是在**现有实现上演进**，不重写：保留 `moduleSdk.ts` 的注册表、依赖排序与迁移编排，补齐目录解耦、生命周期状态、版本与契约。

## 1. 设计目标

1. Core 不出现任何业务模块 ID 字面量。
2. 模块构建期静态可分析，运行期不执行任意动态代码。
3. Discover / Validate / Install / Migrate / Activate 分阶段，状态可持久化、可恢复、可审计。
4. 模块之间只通过公开契约（Service / API / Tool / Event）通信。
5. 禁用模块不删除业务数据；卸载是显式、可审计的操作。
6. 迁移失败不得处于“假成功”状态。

## 2. 当前实现与目标映射

| 能力 | 当前 | 目标改动 |
|---|---|---|
| Manifest | `ModuleManifest` 字符串数组 | 增加 `description`、`dependencies: { id, range }[]`、结构化 API/Tool/UI/Workflow 定义（保留字符串形式兼容） |
| Definition | `ModuleDefinition` + lifecycle 回调 | 增加 `manifest`、`register(context)`、`state` 生命周期操作 |
| Catalog | `moduleCatalog.ts` 硬编码 example | 由仓库根 `modules.catalog.ts` 静态清单提供，Core 只 import 该文件 |
| Layer 开关 | `nuxt.config.ts` 硬编码 `AVAILABLE_MODULE_IDS` | 从静态清单推导 |
| 运行时装配 | `moduleRuntime.ts` 判断 `'example'` | 遍历启用模块调用 `register(context)` |
| 注册表 | API/Tool/UI Registry 已存在 | 保留；Tool 增加 operation/timeout/output schema；UI 增加 version/protocol |
| 迁移 | `__module_migrations` + advisory lock | 增加 module_id 列与失败记录；保留旧表兼容 |
| 生命周期 | onRegister/onEnable/onDisable | 增加持久化状态机与 install/upgrade/uninstall |
| 审计 | 无 | 生命周期操作写入 audit_logs |

## 3. 静态模块清单

新增仓库根 `modules.catalog.ts`（不能放在 `modules/` 下，Nuxt 会把该目录顶层文件当作 Nuxt module 扫描）：

```ts
import type { ModuleDefinition } from './server/sdk'
import { exampleModule } from './example/module'
// 新增模块只在此处添加一行；Core 不需要修改。

export const MODULE_DEFINITIONS: readonly ModuleDefinition[] = [
  exampleModule
]

export const AVAILABLE_MODULE_IDS: readonly string[] =
  MODULE_DEFINITIONS.map(module => module.id)
```

- `moduleCatalog.ts` 只提供 `parseEnabledModuleIds` / 校验，不再 import 具体模块；`modules.catalog.ts` 是唯一模块清单。
- `nuxt.config.ts` 用 `AVAILABLE_MODULE_IDS` / `DEFAULT_ENABLED_MODULE_IDS` 校验并解析 `./modules/<id>` layer。
- 可选：`scripts/generate-module-catalog.mts` 扫描 `modules/*/module.ts` 生成上述文件，CI 校验生成结果与提交一致，避免手写遗漏。

不采用运行时 `readdir + import()` 动态加载：Nitro 无法可靠打包，且违反“不受控动态模块执行”约束。

## 4. Manifest v2

```ts
export interface ModuleDependency {
  id: string
  /** semver range，例如 "^1.2.0"；缺省表示任意版本 */
  range?: string
}

export interface ModuleManifest {
  id: string
  name: string
  version: string
  description?: string
  dependencies: ModuleDependency[]
  permissions: PermissionDefinition[]
  navigation: NavigationDefinition[]
  database: string[]
  api: ApiDefinition[]
  tools: ToolDefinition[]
  components: ComponentDefinition[]
  workflows: WorkflowDefinition[]
}
```

兼容策略：现有 manifest 的字符串数组先映射为最小定义对象；新增字段全部可选，避免一次性迁移所有模块。

## 5. 生命周期状态

### 5.1 状态机

```text
discovered → validated → installed → migrated → active
                    ↘ failed ←———————————————↗
active → deactivated → active
active → uninstalled（显式确认）
```

### 5.2 持久化

已实现：`module_states` 表（迁移 `0010_black_prowler.sql`），发布/开发启动与模块激活时写入状态并同事务写审计；状态机校验在 `server/core/moduleState.ts`。

```sql
CREATE TABLE module_states (
  module_id   varchar(80) PRIMARY KEY,
  version     varchar(40) NOT NULL,
  state       varchar(20) NOT NULL,
  last_error  text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

- 每次迁移/激活/停用更新状态。
- `failed` 记录错误摘要，修复后用显式 `retry` 恢复。
- 迁移仍由 `__module_migrations` 记录，避免与历史重复。

### 5.3 操作语义

| 操作 | 行为 | 审计 action |
|---|---|---|
| validate | 依赖存在、版本兼容、无循环、重复 ID | `module.validate` |
| install | 执行未应用迁移，写状态 | `module.install` |
| activate | 调用 `register(context)` 与 `onEnable` | `module.activate` |
| deactivate | 调用 `onDisable`，保留数据，注销运行期注册 | `module.deactivate` |
| upgrade | 版本变更 + 新增迁移 | `module.upgrade` |
| uninstall | 要求显式确认；默认仅解绑，不删表 | `module.uninstall` |

审计与状态更新同事务；迁移 DDL 与业务数据不要求与审计同事务（迁移本身已事务化），但成功/失败状态必须落库。

## 6. 模块入口与注册

```ts
export interface ModuleRegistrationContext {
  api: ModuleApiRouter<unknown>
  tools: ToolRegistry<unknown>
  ui: UiRegistry<unknown, unknown>
  services: ModuleServiceBus
}

export interface ModuleDefinition {
  id: string
  name: string
  version: string
  dependencies: readonly string[]
  permissions: readonly string[]
  navigation: readonly ModuleManifestItem[]
  database: readonly string[]
  api: readonly string[]
  tools: readonly string[]
  components: readonly string[]
  migrations?: readonly ModuleMigration[]
  register?: (context: ModuleRegistrationContext) => void | Promise<void>
  lifecycle?: ModuleLifecycle
}
```

- 删除 `moduleRuntime.ts` 中对具体模块的 import，改为遍历 `resolveModules(...).modules` 调用 `register`。
- 模块的 `register.ts` 保留现有写法（`registerExampleModule(registries)` → 改为模块内直接实现 `register`）。

## 7. 模块目录

```text
modules/example/
  module.ts              # manifest + register + lifecycle（单一入口）
  database/
    migrations.ts        # 模块迁移（当前位于 server/database/migrations.ts）
  server/
    services/            # 业务服务（对外公开）
    api/                 # 模块自有 HTTP 路由（可选）
  app/                   # 页面与组件（Nuxt layer）
  tools/                 # Tool 定义（可选拆分）
  components/            # UI 组件描述符
  tests/                 # 模块测试
```

现有 `server/context.ts`、`server/notes.ts`、`register.ts` 可逐步归位；不要求一次性搬迁。

## 8. 模块间契约

1. **Public Service Interface**：`modules/<id>/services/index.ts` 导出接口与工厂；跨模块只能 import 该入口。
2. **API Contract**：模块 API 统一经 `/api/modules/**`，输入输出必须有 schema。
3. **Tool Contract**：服务端 Tool 定义（见下），模块不得直接暴露 SQL 工具。
4. **Domain Event**：Core 提供轻量事件注册/分发（`server/core/events.ts`），模块按 `event.name` 订阅；不引入外部消息队列。

禁止：跨模块相对路径 import `server/repositories`、直接读写对方表。

## 9. Tool Contract（服务端）

```ts
interface ToolDefinition<Context> {
  id: string
  moduleId: string
  description: string
  inputSchema: Schema
  outputSchema: Schema
  permission: string
  operation: 'query' | 'command'
  timeoutMs?: number
  approval?: 'none' | 'confirm' | 'second-person'
  authorize: (context: Context, input: unknown) => boolean | Promise<boolean>
  execute: (context: Context, input: unknown) => Promise<unknown>
  outputComponent?: string
}
```

Registry 职责：唯一 ID、schema 校验、每次执行重新鉴权、超时、错误归一化、审计（成功/失败/耗时）。Tool 实现只能调用模块 Service，不得拼接任意 SQL。

## 10. UI Contract

- 注册项：`name`（稳定 ID）、`version`、`propsSchema`、`description`、可选 `componentKey`（客户端映射键）。
- 服务端不持有 Vue 组件实现，只保存描述符与校验；客户端按 `name@version` 映射到预注册组件。
- 模型输出协议：

```json
{
  "type": "ui.render",
  "component": "example.status",
  "version": "1.0",
  "presentation": { "mode": "inline" },
  "data": { "queryId": "q_123" }
}
```

- 服务端只允许注册表中存在且版本匹配的组件；`data.queryId` 由授权 API 生成，禁止模型直接注入数据库记录。

## 11. 迁移与兼容

1. 迁移表增加 `module_id`（`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`），保留既有 `id` 主键。
2. `ModuleMigration.id` 继续使用 `module:id` 命名，保持历史记录可识别。
3. 失败时状态置 `failed` 并保留已完成迁移；重试仅执行未记录项。
4. 生命周期回调与 `register` 分离：启用时先迁移成功，再注册服务，再置 `active`。

## 12. 测试矩阵

- Manifest：重复 ID、缺依赖、循环、版本不兼容、未知启用 ID。
- 生命周期：install → migrate → activate 顺序；迁移失败状态为 failed；禁用后再启用；卸载需显式确认。
- 注册表：API/Tool/UI 重复注册、schema 非法、超时、未授权、审计失败回滚。
- 目录解耦：Core 源码中不存在业务模块 ID 字面量（可用静态断言测试）。
- 构建期：`ENABLED_MODULES` 决定 layer 是否打包（已有构建验证）。
