# Phase 7 — 测试、CI 与文档同步计划

## Context

Architecture Upgrade 的 Phase 0–6 已完成并通过本地验证，剩余 Phase 7（任务书 §9）：

1. 建立可依赖的 CI 流水线，并为 PR 提供检查。
2. 按任务书要求的目录维护架构、开发与 ADR 文档；README 必须与真实代码一致。
3. 不掩盖既有债务：`pnpm lint` / `pnpm typecheck` 存在大量 Phase 1–6 之前的历史错误，CI 不能把它们伪装成“已通过”，也不能让它们阻塞真实回归。

已确认基线（本地）：`pnpm test` 66 文件 / 632 用例通过，`pnpm build` 通过，`npx drizzle-kit check` 干净；typecheck 约 129 个历史错误、repo 级 lint 约 2546 个历史错误，均不在本轮新增文件中。

## 1. CI 流水线

新增 `.github/workflows/ci.yml`：

- 触发：`push` 到 `main` + 所有 `pull_request`（PR 检查）。
- 运行环境：`ubuntu-latest`、Node 22、`pnpm/action-setup@v4`（使用 `packageManager: pnpm@11.18.0`）。
- PostgreSQL 16 service（`postgres/postgres`，库 `nuxt_ai`，health check），`DATABASE_URL` 指向服务。
- 步骤顺序：
  1. `pnpm install --frozen-lockfile`
  2. `pnpm lint` — `continue-on-error: true`，注释说明“历史风格债务基线，不作为阻塞项”
  3. `pnpm typecheck` — `continue-on-error: true`，同上
  4. `pnpm exec drizzle-kit check` — 阻塞，校验迁移快照/序列一致性
  5. `pnpm db:migrate:release` — 阻塞，应用主库 + 模块 + Blog 迁移，保证真实 PostgreSQL 集成测试可运行
  6. `pnpm test` — 阻塞（单元 + 集成 + e2e 使用真实 PG）
  7. `pnpm build` — 阻塞
- 顶层 `env`：`DATABASE_URL`、`SESSION_SECRET`、`NUXT_PUBLIC_SITE_URL`、`BLOG_ENABLED`（按需）。
- `concurrency` 取消同分支重复运行；`permissions: contents: read`。
- 在文件头注释中明确：lint/typecheck 非阻塞是**已记录的债务**，不是通过证明。

不新增测试脚本拆分（现有测试按文件混合使用 DB，按文件名区分 unit/integration 会误分类）；CI 通过“迁移校验 → 全量测试”保证真实数据库覆盖。

## 2. 文档同步

### 2.1 `docs/architecture/`（9 篇）

| 文件 | 内容 | 状态 |
|---|---|---|
| `SYSTEM_ARCHITECTURE.md` | 分层/目录、启动与请求链路、模块边界、实时与 Agent 位置、文档索引 | 新建 |
| `IMPLEMENTATION_AUDIT.md` | 审计基线，更新已完成项为 Implemented，保留剩余差距 | 更新 |
| `CORE_SERVICES.md` | 权限/AuthContext、dataScope、fieldPolicy、audit、CRUD、files、模块 SDK/目录/状态/迁移、realtime、modelGateway、agent store 的职责与代码位置 | 新建 |
| `AUTHORIZATION.md` | 认证链路、组织上下文、`authorize()`、规范权限、`ADMIN_ONLY_TABLES`、路由守卫、文件授权、数据范围、字段策略、模块 API、Agent 工具复检、拒绝审计 | 新建 |
| `MULTI_TENANCY.md` | tenant/org 模型、`organizationScoped`/`tenantScoped`、`contextColumns`、关系跨域校验、作用域唯一索引、文件/SIS 实践、已知限制 | 新建 |
| `MODULE_ARCHITECTURE.md` | `server/sdk` 契约边界、catalog、manifest 校验、`resolveModuleCatalog` 单管线、注册表、构建期 layer vs 运行期状态、目录结构、解耦测试 | 新建 |
| `MODULE_LIFECYCLE.md` | 状态机、合法转换、`module_states` 持久化与审计、迁移 checksum/advisory lock、安装/升级/停用/卸载守卫、运行时门禁、API/UI | 新建 |
| `DATABASE_MIGRATIONS.md` | 主库 Drizzle 迁移、发布入口、模块迁移编排、失败重试/篡改拒绝、开发 vs 生产、新增迁移流程、测试库 | 新建 |
| `AGENT_ARCHITECTURE.md` | Model Gateway、Tool Registry 管道、Agent loop、审批哈希绑定、执行/工具/审批/Artifact 表、API/UI、安全边界、未实现项 | 新建 |

状态标注：每篇用 **Implemented / Partial / Planned / Deprecated** 表或标记。

### 2.2 `docs/development/`（5 篇）

`CREATE_MODULE.md`、`LOCAL_MODULE_DEVELOPMENT.md`、`INDEPENDENT_MODULE_REPOSITORY.md`、`MODULE_TESTING.md`、`DEPLOYMENT.md`，内容从现有 `MODULE_DEVELOPMENT.md` 与 `PRODUCTION.md` 拆分/补充，避免重复：

- `CREATE_MODULE.md`：manifest、catalog 注册、register、权限、迁移、页面、检查清单。
- `LOCAL_MODULE_DEVELOPMENT.md`：`ENABLED_MODULES`、`pnpm dev`、热更新边界、模块 API 调试、数据库重置。
- `INDEPENDENT_MODULE_REPOSITORY.md`：独立 Git 仓库/子模块、只依赖 `server/sdk`、版本与 `apiVersion`、CI、升级发布。
- `MODULE_TESTING.md`：测试分层（单元/集成/授权/SDK/生命周期/迁移/API/e2e）、真实 PG、现有测试文件示例、运行命令。
- `DEPLOYMENT.md`：构建、`db:migrate:release`、环境变量、PM2、多实例实时、健康检查、备份与回滚；实时细节链接 `architecture/PRODUCTION.md`。

### 2.3 `docs/decisions/ADRs/`

- `README.md`：索引 + ADR 模板与状态约定。
- `0001-single-module-catalog-pipeline.md`
- `0002-runtime-module-state-vs-build-time-layers.md`
- `0003-server-side-tenant-resolution.md`
- `0004-file-visibility-and-signed-urls.md`
- `0005-agent-approvals-hash-bound-and-persisted.md`
- `0006-postgres-listen-notify-realtime.md`

每篇含 Context / Decision / Consequences / Status。

### 2.4 既有文档处理

- `docs/architecture/MODULE_DEVELOPMENT.md`：改为**索引页**，指向拆分后的 `MODULE_ARCHITECTURE.md`、`MODULE_LIFECYCLE.md` 与 `development/*`，保留原有外部链接可用性，不复制正文。
- `docs/CURRENT_ARCHITECTURE.md`：顶部加 **Deprecated** 横幅，指向 `docs/architecture/SYSTEM_ARCHITECTURE.md`；保留历史审计内容。
- `docs/architecture/PRODUCTION.md`：保留为实时/生产专题，补充被 `DEPLOYMENT.md` 引用；状态标注。
- `docs/architecture/UPGRADE_PROGRESS.md`：新增 Phase 7 表格（CI、文档、验证证据、剩余债务）。
- `docs/IMPLEMENTATION_PLAN.md`、`docs/IMPROVEMENT_AUDIT.md`、`docs/SECURITY_GAP_ANALYSIS.md`、`docs/MODULE_SDK_DESIGN.md`：仅在文首标注当前定位（历史/已实现），避免与权威文档冲突。

### 2.5 README 与配置注释

`README.md` 按真实仓库更新：

- 模块章节：删除 `nav`/`doc`/`<NAME>_ENABLED` 旧描述，改为 `modules/example`、`modules/sis-demo`、`modules.catalog.ts`、`ENABLED_MODULES`、`/dashboard/modules` 生命周期管理、SDK 契约。
- 目录结构补充 `server/core/`、`server/sdk/`、`modules/sis-demo/`、`docs/`。
- 增加多租户、授权、SIS 领域、Agent 能力摘要（只写已实现）。
- 测试：更新为当前 66 文件 / 632 用例，说明真实 PG 集成测试与 CI。
- 命令：增加 `db:migrate:release`；修正 `AUTO_MIGRATE` 漂移（实际由 `NODE_ENV` 决定开发自动迁移）。
- 部署：链接 `docs/development/DEPLOYMENT.md` 与 `docs/architecture/PRODUCTION.md`。
- 文末增加文档索引。

配置同步：

- `.env.example`：用 `ENABLED_MODULES` 替换 `AIEXAM_ENABLED`；修正迁移开关说明；补充 `FILE_SIGNING_SECRET`、`REALTIME_DRIVER`、`REALTIME_CHANNEL`。
- `nuxt.config.ts`：仅修正过时注释（`DOC_ENABLED`/`NAV_ENABLED` → catalog + `ENABLED_MODULES`），不改逻辑。

## 3. 关键文件

新增：`.github/workflows/ci.yml`、`docs/architecture/*`（8 篇）、`docs/development/*`（5 篇）、`docs/decisions/ADRs/*`（7 篇）。
修改：`README.md`、`docs/architecture/{IMPLEMENTATION_AUDIT,UPGRADE_PROGRESS,MODULE_DEVELOPMENT}.md`、`docs/CURRENT_ARCHITECTURE.md`、`.env.example`、`nuxt.config.ts`（注释）。

## 4. 验证

在本地按 CI 顺序执行并记录真实结果：

1. `pnpm exec drizzle-kit check`
2. `pnpm test`（确认 66 文件 / 632 用例，真实 PG）
3. `pnpm build`
4. `pnpm exec eslint <本轮修改的 TS 文件>`（仅用于确认注释改动无新增 lint）
5. 人工核对 README / 文档链接与仓库目录一致

说明：GitHub Actions 无法在本地实际运行；交付时只声明“工作流已添加、命令已在本地成功执行”，不声称 CI 已通过。lint/typecheck 全量历史债务继续如实记录在 `UPGRADE_PROGRESS.md` 与 CI 注释中。
