# 本地模块开发（Local Module Development）

> 适用于在仓库 `modules/<id>/` 内开发模块。独立仓库流程见 [INDEPENDENT_MODULE_REPOSITORY.md](./INDEPENDENT_MODULE_REPOSITORY.md)。

## 1. 环境

```bash
pnpm install
cp .env.example .env
# 至少设置 DATABASE_URL / SESSION_SECRET
```

开发模式启动：

```bash
pnpm dev
```

`NODE_ENV !== 'production'` 时启动插件会：

1. 创建数据库（如不存在）。
2. 执行主库迁移。
3. 校验模块 catalog、执行生命周期与模块迁移。
4. seed 管理员、角色与默认配置。

## 2. 启用模块

```bash
# 只启用需要的模块
ENABLED_MODULES=example pnpm dev

# 或写入 .env（外部 SMS 模块需先克隆到 modules/sms 并在 catalog 注册 smsModule）
ENABLED_MODULES=example,my-module
```

- `ENABLED_MODULES` 决定**构建期**加载哪些 Nuxt layer。
- `DEFAULT_ENABLED_MODULE_IDS` 是未设置时的默认值（`example`）。
- 未知 ID 会直接启动失败。
- 运行时启用/停用只改变生命周期状态与模块 API 可用性，不会卸载已编译页面；移除 layer 需改 `ENABLED_MODULES` 后重启/重新构建。

## 3. 页面与热更新边界

- `modules/<id>/nuxt/pages|components|composables` 会作为 Nuxt layer 参与构建。
- 开发时修改这些文件通常可热更新。
- 修改 `module.ts` / `register.ts` / 迁移文件后，建议重启开发服务器，确保注册表与生命周期重新装配。

## 4. 模块 API 调试

模块 API 统一挂载：

```text
/api/modules/<id>/**
```

调试步骤：

1. 确认模块状态为 `active`（`GET /api/dashboard/modules`，管理员）。
2. 确认当前用户权限包含模块声明的权限。
3. 若返回 403，先检查生命周期门禁（`deactivated` / `uninstalling` / `uninstalled` 一律 403）。
4. 查看 `audit_logs` 中的拒绝记录。

## 5. 数据库操作

```bash
pnpm db:generate        # 主库 schema 变更生成迁移
pnpm db:migrate         # 应用主库迁移
pnpm db:migrate:release # 发布入口：主库 + 模块 + Blog
pnpm db:studio          # Drizzle Studio
```

模块表不需要 `db:generate`：它们由模块迁移（`modules/<id>/server/database/migrations.ts`）创建。

重置本地数据库：

```bash
dropdb nuxt_ai && createdb nuxt_ai
pnpm db:migrate:release
```

## 6. 测试

```bash
pnpm vitest run test/unit/modules/<id>   # 模块自身测试
pnpm test                                # 全量（需要本地 PostgreSQL）
pnpm typecheck
```

集成测试使用真实 PostgreSQL；不要用 mock 替代租户隔离、事务或迁移行为。

## 7. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `Unknown enabled module` | `ENABLED_MODULES` 含未在 catalog 声明的 ID | 在 `modules.catalog.ts` 添加定义 |
| 模块 API 403 | 模块未 active / 无权限 / 无组织上下文 | 检查状态、权限、`x-organization-id` 是否有有效成员关系 |
| checksum mismatch | 修改了已应用迁移但未提升 `checksum` | 新增迁移或提升 revision（仅限未发布环境） |
| 模块表不存在 | 模块迁移未执行 | 运行 `pnpm db:migrate:release` 或重启开发服务器 |
| 页面 404 | layer 未启用 | 将模块 ID 加入 `ENABLED_MODULES` 并重启 |
