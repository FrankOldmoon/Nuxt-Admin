# 独立模块仓库（Independent Module Repository）

> 模块可以放在独立 Git 仓库中开发、评审和发布，宿主只通过 `modules.catalog.ts` 与 `server/sdk` 契约接入。

## 1. 仓库结构

```text
my-module-repo/
├── module.ts
├── register.ts
├── nuxt/
├── server/
│   ├── context.ts
│   ├── services/
│   └── database/{schema.ts,migrations.ts}
├── test/
├── package.json          # 可选：仅用于模块自身测试/类型检查
├── tsconfig.json
└── README.md
```

要求：

- `module.ts` 导出的 `ModuleDefinition` 是唯一入口。
- 模块只从宿主 `server/sdk` 导入契约；不得 import `server/core/**` 或 `server/utils/**`。
- 模块的 `test/` 可在宿主仓库中运行（`vitest.config.ts` 已包含 `modules/*/test/**`）。
- 若模块自带 `package.json`，不要引入第二套运行时依赖；模块运行在宿主进程内。

## 2. 接入宿主

### 2.1 Clone

```bash
git clone <module-repo> modules/my-module
```

### 2.2 Git submodule（可选）

```bash
git submodule add <module-repo> modules/my-module
git submodule update --init --recursive
```

### 2.3 注册与启用

```ts
// modules.catalog.ts
import { myModule } from './modules/my-module/module'
export const MODULE_DEFINITIONS = [exampleModule, myModule]
```

```bash
ENABLED_MODULES=example,my-module pnpm build
```

宿主 `nuxt.config.ts` 会从 catalog 派生 layer；无需修改宿主源码。

## 3. 版本与兼容

| 字段 | 规则 |
|---|---|
| `version` | 模块自身 semver；发布后只增不改 |
| `apiVersion` | 必须等于宿主 `MODULE_API_VERSION`；不兼容变更时同时提升 |
| `compatibility.core` | 声明可接受的 Core 版本范围，如 `^1.0.0` |
| `dependencies` / `dependencyRanges` | 其它模块 ID 与版本范围；循环或缺失会启动失败 |

升级策略：

1. 新功能优先新增迁移与权限，不修改历史迁移。
2. 不兼容契约变更：提升 `apiVersion`，更新 `compatibility.core`，在 README 写迁移说明。
3. 需要数据清理时提供独立脚本/迁移，不要依赖卸载自动删数据。

## 4. 模块 CI

独立仓库建议至少执行：

```bash
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit        # 或模块自身 typecheck
pnpm vitest run test          # 模块测试
```

并在宿主仓库的 CI 中跑一次集成验证（模块已 clone 到 `modules/<id>` 时）：

```bash
pnpm test
pnpm build
```

## 5. 发布流程

```text
模块仓库：提交 → 测试 → 打 tag（v1.2.0）
宿主仓库：更新 submodule / clone 版本
        → 更新 catalog（如首次接入）
        → pnpm db:migrate:release（预发库）
        → pnpm test
        → 发布宿主
```

注意：

- 模块迁移在宿主发布入口执行，不在模块仓库内执行。
- 模块停用/卸载不会删除数据；数据保留策略由业务决定。
- 宿主升级 Core 前，先确认所有模块的 `apiVersion` / `compatibility.core`。

## 6. 参考

- 契约：[../architecture/MODULE_ARCHITECTURE.md](../architecture/MODULE_ARCHITECTURE.md)
- 生命周期：[../architecture/MODULE_LIFECYCLE.md](../architecture/MODULE_LIFECYCLE.md)
- 创建模块：[CREATE_MODULE.md](./CREATE_MODULE.md)
- 测试：[MODULE_TESTING.md](./MODULE_TESTING.md)
