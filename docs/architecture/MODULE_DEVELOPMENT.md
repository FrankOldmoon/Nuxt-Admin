# 模块开发与生命周期指南（索引）

> 状态：**Implemented**。
> 本页原为模块开发长文，Phase 7 已按任务书 `docs/architecture` 与 `docs/development` 结构拆分，避免重复维护。原内容已迁移到下列文档。

## 1. 架构与契约

| 主题 | 文档 |
|---|---|
| 模块 SDK、catalog、manifest 校验、构建期 layer 与运行期状态 | [MODULE_ARCHITECTURE.md](./MODULE_ARCHITECTURE.md) |
| 状态机、迁移、停用/卸载、运行时门禁 | [MODULE_LIFECYCLE.md](./MODULE_LIFECYCLE.md) |
| 数据库迁移通道 | [DATABASE_MIGRATIONS.md](./DATABASE_MIGRATIONS.md) |

## 2. 开发指南

| 主题 | 文档 |
|---|---|
| 从零创建模块（manifest、catalog、注册、迁移、页面） | [../development/CREATE_MODULE.md](../development/CREATE_MODULE.md) |
| 本地开发、`ENABLED_MODULES`、调试与重置数据库 | [../development/LOCAL_MODULE_DEVELOPMENT.md](../development/LOCAL_MODULE_DEVELOPMENT.md) |
| 独立 Git 仓库 / submodule、版本与发布 | [../development/INDEPENDENT_MODULE_REPOSITORY.md](../development/INDEPENDENT_MODULE_REPOSITORY.md) |
| 测试分层、真实 PostgreSQL、CI | [../development/MODULE_TESTING.md](../development/MODULE_TESTING.md) |
| 部署与生产 | [../development/DEPLOYMENT.md](../development/DEPLOYMENT.md) |

## 3. 快速入口

- 契约入口：`server/sdk/index.ts`
- 模块清单：`modules.catalog.ts`
- 内置模块：`modules/example`
- 外部模块：`Nuxt-Extend-SMS`（SMS，克隆到 `modules/sms`，注册 `smsModule`）
- 管理页面：`/dashboard/modules`

## 4. 提交前检查

- [ ] catalog 已登记，`ENABLED_MODULES` 可解析。
- [ ] manifest 通过 `validateModuleManifests`。
- [ ] 模块只从 `server/sdk` 导入 Core 契约。
- [ ] 权限为 `module.resource.action`，无通配符。
- [ ] 迁移 ID 唯一、只追加、checksum 已提升。
- [ ] 组织/租户由服务端注入。
- [ ] 模块测试覆盖跨组织拒绝与审计归属。
- [ ] `pnpm test`、`pnpm build` 通过。
