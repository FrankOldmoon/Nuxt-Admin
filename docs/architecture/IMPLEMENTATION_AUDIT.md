# Implementation Audit (Architecture Upgrade)

> 状态：**Implemented**（Phase 0–7 完成后复核）。
> 本文是架构升级的审计基线；阶段证据见 [UPGRADE_PROGRESS.md](./UPGRADE_PROGRESS.md)。
> 状态图例：**Implemented**、**Partial**、**Missing**、**Risky**。

## 1. 现有功能

- 认证：cookie session、OAuth/WX 登录、登录锁定、CAPTCHA。
- RBAC：角色权限（`table`、`table:action`、`*`）+ 规范资源权限（`module.resource.action`）、`ADMIN_ONLY_TABLES`。
- 多租户：`tenants`、`organizations`、`departments`、`organization_memberships`（服务端解析）。
- 通用 CRUD：元数据驱动的 list/detail/create/update/delete/restore/import/export、字段策略、数据范围、关系、many-to-many。
- 审计：事务内写入、脱敏、模块归属（`moduleId` / `resource`）。
- 文件：本地上传/预览/下载、public/private、owner/admin/org 授权、HMAC 签名 URL。
- 模块 SDK：catalog、manifest 校验、依赖排序、生命周期状态机、模块迁移、API/Tool/UI 注册表、管理 API/UI。
- AI：服务端工具循环、Model Gateway、执行记录、审批、Artifact 表。
- SIS/SMS：已迁移到独立仓库 `Nuxt-Extend-SMS`（学年/学期/年级/科目/教师/班级/学生/选课/监护人 + 角色数据范围），主仓库不再内置。
- 实时：WS 通知/私信/presence/LLM 流式；PostgreSQL LISTEN/NOTIFY 多实例总线。

## 2. 架构抽象

| 领域 | 位置 |
|---|---|
| 授权决策 | `server/core/permissions.ts`、`server/utils/auth.ts` |
| AuthContext / 组织上下文 | `server/core/authContext.ts`、`server/utils/auth.ts` |
| 数据范围 | `server/core/dataScope.ts` |
| 字段策略 | `server/core/fieldPolicy.ts` |
| 审计 | `server/core/audit.ts` |
| 模块 SDK / 清单 | `server/core/moduleSdk.ts`、`server/core/moduleManifest.ts`、`server/core/moduleCatalog.ts`、`modules.catalog.ts` |
| 模块生命周期 / 迁移 | `server/core/moduleState.ts`、`server/database/moduleStates.ts`、`server/database/moduleMigrations.ts` |
| CRUD 管线 | `server/utils/dashboard/crudService.ts` |
| 文件授权 | `server/core/fileAccess.ts`、`server/utils/fileRequest.ts` |
| Agent | `server/core/agent.ts`、`server/core/modelGateway.ts`、`server/core/agentApproval.ts`、`server/utils/agentStore.ts` |
| 实时 | `server/core/realtimeBus.ts`、`server/utils/realtime.ts` |

## 3. 仍不完整的实现

| 项 | 状态 | 说明 |
|---|---|---|
| SIS 课表 / 考勤 / 评估 / 报表 | External | 由 `Nuxt-Extend-SMS` 仓库跟踪 |
| SIS 新实体专用 UI | External | 由 `Nuxt-Extend-SMS` 仓库跟踪 |
| Agent 原生 Anthropic 适配器 | Missing | 可用 OpenAI-compatible 网关替代 |
| Agent 抽取为独立模块 | Partial | 仍在 Core |
| Agent 执行记录保留/清理 | Missing | 表会持续增长 |
| WS 路径服务端工具调用 | Partial | 仅 HTTP chat 走工具管道 |
| Redis 实时适配器 / 对象存储 / 全局限流 | Missing | 当前 PostgreSQL 总线 + 本地存储 + 进程内限流 |
| 数据库 RLS | Missing | 应用层隔离 |
| 组织级管理员语义 | Missing | admin 仍为全局角色 |

## 4. 安全审计

| ID | 问题 | 状态 |
|---|---|---|
| S-01 | Schema 自动发现暴露内部表 | Fixed（显式暴露 + 自动发现保护） |
| S-02 | token/oauth/audit 表无硬拒绝 | Fixed（`ADMIN_ONLY_TABLES`） |
| F-01 | 文件 serve/download 公开 | Fixed（visibility + 授权/签名） |
| F-02 | 无签名 URL | Fixed（`createSignedFileUrl`） |
| A-01 | SIS 创建信任浏览器归属列 | Fixed（服务端注入 + validator） |
| A-02 | 审计全部归到 core | Fixed（`moduleId` / `resource`） |
| P-01 | 模块级权限绕过资源检查 | Partial（规范权限已支持；旧表仍用 table/action） |
| M-01 | Manifest 兼容性未校验 | Fixed（apiVersion/core/权限/迁移 checksum） |
| T-01 | 跨组织关系引用 | Fixed（`assertRelationScope`） |
| T-02 | 跨组织唯一冲突 | Fixed（作用域唯一索引） |
| AG-01 | 模型/工具越权 | Fixed（每次调用权限复检 + 审批 + 输出上限） |
| AG-02 | 审批伪造/复用 | Fixed（持久化 + 参数哈希绑定） |

## 5. 重复/并存抽象

- 旧 `dataScope` 角色值与表级 `features.dataScope` 并存，表级优先（已文档化）。
- 两个 LLM 入口（WS 流式 / HTTP 工具循环）共享配置但不共享工具管道。
- Dashboard 默认菜单与注册表存在展示层重叠（菜单仅展示）。

## 6. 自动化测试

已覆盖：

- 文件：访问单元测试、e2e 可见性/授权/目录穿越。
- 模块：manifest 兼容性/权限、生命周期、迁移 checksum/重试、解耦、卸载守卫、模块目录 API。
- SIS/SMS：领域关系、跨组织拒绝、选课历史、审计归属、角色范围、通用 CRUD 集成（测试随模块位于 `Nuxt-Extend-SMS`）。
- Agent：Gateway、工具管道、审批状态机/哈希绑定、执行存储。
- 通用 CRUD：上下文列解析、分页/范围、导入导出限制。

未覆盖：

- 查询次数/性能回归断言。
- 多实例实时总线的端到端集成（有单元测试）。
- Agent WS 工具路径（功能未实现）。

## 7. 文档状态

- Phase 7 已补齐 `docs/architecture/**`、`docs/development/**`、`docs/decisions/ADRs/**`。
- `docs/CURRENT_ARCHITECTURE.md` 标记为 **Deprecated**。
- README 已按真实仓库更新（模块 catalog、SIS、模块管理、CI）。
- `docs/MODULE_SDK_DESIGN.md` 指向公开 `server/sdk` 与 `modules.catalog.ts`。

## 8. 优先级任务

1. **P0 文件安全** — 已完成。
2. **P0 授权/审计统一** — 已完成（规范权限 + 归属注入）。
3. **P1 模块校验 / 生命周期 / 管理 UI** — 已完成。
4. **P1 CRUD 租户隔离与性能** — 已完成；查询次数测试仍缺。
5. **P1 SIS 领域扩展** — 已迁移到 `Nuxt-Extend-SMS`；主仓库不再维护该领域代码。
6. **P2 Agent 模块化 / 原生适配器 / 保留策略** — 部分完成。
7. **P2/P3 多实例实时与生产文档** — 已完成 PostgreSQL 总线与生产文档。
8. **持续** — 测试、CI、文档（Phase 7 已完成基线）。
