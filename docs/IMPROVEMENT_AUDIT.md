# 改进审计：任务书 vs 真实代码

> Phase 0 产出。逐条核对《Nuxt-Admin vNext》任务书，结论以当前 `main` 代码为准。
> 状态：✅ 已具备 / 🟡 部分具备 / ❌ 缺失。

## 1. 任务书 1.1 列出的既有能力

| 能力 | 状态 | 证据 |
|---|---|---|
| Nuxt 4 / Vue 3 / TS / PG / Drizzle | ✅ | `package.json` |
| 认证、OAuth、Session | ✅ | `server/api/auth/**`、`server/utils/{session,tokens,oauth}.ts` |
| 用户/角色/权限管理 | ✅ | `server/database/schema.ts`、`server/utils/auth.ts` |
| Generic CRUD + Schema 自动发现 | ✅（也是安全缺口） | `server/utils/dashboard/tables.ts` |
| 动态表格/表单/详情、CRUD 定制 L0–L4 | ✅ | `app/components/dashboard/**`、`server/utils/dashboard/tableOverrides/**` |
| 关联识别、筛选、分页、排序 | ✅ | `tables.ts`、`crudService.ts` |
| Excel/JSON 导入导出 | ✅（导出已写审计） | `server/api/dashboard/data/[table]/{import,export}.*` |
| 文件、通知、实时通信 | ✅ | `server/api/files/**`、WebSocket 路由 |
| LLM Chat | 🟡 仅同步问答，无服务端工具链 | `server/api/llm/chat.post.ts`、`server/utils/llm.ts` |
| OIDC Provider、支付、会员、配置 | ✅ | `server/api/oidc/**`、`server/api/{alipay,wxpay,stripe}/**` |
| Module SDK / API/Tool/UI Registry | 🟡 契约与注册表存在，模块硬编码 | `server/core/moduleSdk.ts` |
| Organization / Tenant 基础模型 | 🟡 表与上下文存在，未参与大多数查询授权 | `schema.ts`、`server/utils/auth.ts` |
| Field Policy | 🟡 已实现，按角色名、未配置默认值 | `server/core/fieldPolicy.ts` |
| Audit Log | 🟡 主链路覆盖，事件不完整 | `server/core/audit.ts` |
| Module Migration | ✅（有追踪表、锁、统一入口） | `server/database/moduleMigrations.ts` |

## 2. P0 Permission Engine（任务书第二章）

| 要求 | 现状 | 差距 |
|---|---|---|
| 统一 `AuthContext`（tenant/org/membership/role/department） | 🟡 现有 `AuthContext = { user, role, organization? }` | 缺 `tenantId/membershipId/roleId/departmentId/roles/permissions/attributes`；角色来自 `users.roleId` |
| 服务端创建上下文，校验 Membership 有效 | 🟡 `getOrganizationContext()` 查询 active membership | 只在请求显式携带组织时解析；无默认/当前组织概念；未返回 membershipId/roleId |
| 切换组织后重新解析角色权限 | ❌ | 角色始终取全局 `users.roleId`，与组织无关 |
| 同一用户多组织不同角色 | ❌ | `organization_memberships.roleId` 未被读取 |
| Membership 禁用立即失效 | 🟡 | 查询条件有 `status='active'`，但没有“未提供组织即拒绝”的统一策略 |
| DataScope 六种取值 | ❌ 仅 `all` / `self` | `buildDataScopeWhere()` 遇到不支持的 scope 直接 403，但没有 assigned/department/organization/tenant/global |
| 查询/更新/删除统一应用范围 | 🟡 | CRUD 主路径应用；`tableOverrides` 自行实现，未强制经过 `resolveDataScope` |
| 关系表查询授权 | ❌ | `loadRelationOptions()` 直接读取关联表，无独立授权 |
| 业务模块自定义 Resolver | ❌ | 无扩展点 |
| global 不能仅凭 admin 自动获得 | ❌ | 当前 admin 直接绕过所有行级限制 |
| 无 organizationId/tenantId 的表必须有明确关联或 Resolver | ❌ | 无此机制，只能靠 `features.dataScope` 手工配置 |

## 3. P0 Generic CRUD 安全边界（任务书第三章）

| 要求 | 现状 | 差距 |
|---|---|---|
| 显式 CRUD 白名单 | ❌ | `getRegisteredTable()` 在无显式条目时调用 `autoDiscoverTable()`，任何注册进 schema 的表都可访问 |
| 未注册表默认拒绝 | ❌ | 同上，自动发现即为“隐式注册” |
| 内部表默认排除 | 🟡 仅 `ADMIN_ONLY_TABLES = roles/users/files/configs` | `tokens/sessions/oauthAccounts/auditLogs/tenants/organizations/organizationMemberships/departments` 等未在黑名单 |
| 敏感表不能被普通通配符授权 | 🟡 | admin 的 `*` 可访问全部；非 admin 需显式 `table` 权限，但 `*` 角色无差别放行 |
| API 表级 + 字段级权限 | 🟡 | 表级 `authorize()` + 可选 `fieldPolicy`；字段策略未绑定权限字符串，只有角色名 |
| 关系字段关联授权 | ❌ | 见上 |
| 更新只能改允许字段 | ✅ | `assertWritableFields()` 对不可写字段 403 |
| 不能靠前端隐藏绕过 | ✅ | 服务端强制；但字段策略未配置时等于不限制 |
| FieldPolicy 安全默认值（readable/writable/permission/mask） | 🟡 | 只有 read/write 角色名单；无 permission 字符串、无 mask、无“密码/Token 永不返回”的全局规则 |

## 4. P1 Module SDK（任务书第四章）

| 要求 | 现状 | 差距 |
|---|---|---|
| 消除对 Example 的硬编码 | ❌ | `moduleCatalog.ts`、`nuxt.config.ts`、`moduleRuntime.ts` 均显式引用 `example` |
| Manifest 完整字段（description/worked 定义对象） | 🟡 | 现有字段为字符串数组，无 workflow、无版本描述 |
| 模块入口 setup/install/activate/deactivate/uninstall | 🟡 仅 lifecycle 回调 | 无持久化状态、无 uninstall、无 upgrade |
| 依赖/版本/循环校验 | 🟡 | 依赖存在性、循环、重复 ID 已校验；无版本兼容校验 |
| 构建期静态模块清单 | 🟡 | `ENABLED_MODULES` + 目录扫描，但可用模块列表硬编码 |
| Discovery/Install/Activate 分阶段管理 | ❌ | 只有构建期启用与启动回调 |
| Migration 状态记录、失败不假成功 | ✅ | `__module_migrations` + 事务；失败回滚 |
| 禁用不删数据、卸载需确认 | 🟡 | 禁用不删数据；无卸载能力 |
| 生命周期操作审计 | ❌ | 无 |
| 模块目录结构规范 | 🟡 | 示例模块结构简单，无 manifest.ts/manifest 分层 |
| 模块间 API/Event 契约 | ❌ | 无 Service/Event 总线，模块可任意相对路径 import |

## 5. P1 Tool Registry 与 Agent（任务书第五章）

| 要求 | 现状 | 差距 |
|---|---|---|
| Tool 定义（name/moduleId/input/output schema/permission/operation） | 🟡 | 有 id/moduleId/schema/execute/authorize；无 output schema、permission、operation、timeout、approval |
| 每次执行重新鉴权 | ✅ | `ToolRegistry.run()` 每次都调用 authorize |
| Tool 不直接访问任意 DB / SQL | 🟡 | 契约层无法限制；示例工具直接使用 `db.execute` 原始 SQL |
| Tool 执行审计 | 🟡 | 示例工具写审计；Registry 本身不强制 |
| LLM 多轮 Tool Calling | ❌ | 服务端 LLM 只返回文本；工具块由**客户端**解析执行 |
| Tool Call ID / 状态 / 超时 / 最大次数 | ❌ | 无 |
| Query / Command 分离与确认 | ❌ | 无 |
| 会话记录与中断恢复 | ❌ | 无 |

## 6. P1 UI Component Registry（任务书第六章）

| 要求 | 现状 | 差距 |
|---|---|---|
| 固定组件 + 版本 + props schema | 🟡 | 服务端注册表只有 id/schema/render 描述符；客户端另有一套 `useChatUi` |
| UI Render Protocol（type/component/version/presentation/data） | ❌ | 客户端只解析 `{"ui": "<id>"}` |
| 组件版本匹配 | ❌ | 无 |
| 数据必须来自授权 API | ❌ | 协议未定义 |
| AI 与传统页面共享组件 | 🟡 | 客户端卡片已共享 Vue 组件，但仅限已接入的卡片 |

## 7. P1 Audit / Versioning（任务书第七章）

| 事件 | 现状 |
|---|---|
| 登录成功/失败 | ✅（best-effort） |
| 失败访问 | ❌（仅抛出 401/403，无审计） |
| 角色/权限修改 | 🟡（roles 表经 CRUD 更新时记录，但无专门事件） |
| CRUD 写、批量、导入 | ✅（同事务） |
| 导出 | ✅ |
| 模块 API Command | 🟡（示例 create 有审计） |
| Tool 执行 | 🟡（示例工具；Registry 未强制） |
| Module Lifecycle | ❌ |
| Approval | ❌ |
| 数据恢复（restore） | ✅ |
| 重要数据版本历史 | 🟡 仅 `features.versions` 显式开启的表 |

## 8. 测试现状（任务书第八章）

- 当前：`pnpm test` 52 文件 / 507 用例通过；`pnpm build` 通过。
- 已有相关覆盖：模块依赖排序/重复/循环、Tool 授权拒绝、API 路由冲突、字段策略纯函数、组织上下文解析、双组织 notes 隔离、审计失败回滚、登录/导出。
- 缺口：权限矩阵（Teacher/其他教师、Tenant 隔离、组织切换、Membership 禁用）、未注册表拒绝、敏感字段不返回、模块版本升级、Tool Calling/超时/确认、Prompt Injection、UI 组件版本校验。

## 9. 与任务书描述不一致之处（需以代码为准）

1. 任务书称“Part 1 已有 Module API Registry/Tool Registry/UI Registry”，实际三者只完成注册与元数据校验，未进入 LLM 调用链。
2. 任务书称“Organization/Tenant 基础模型”，实际组织上下文默认不解析，且不参与绝大多数查询。
3. 任务书要求“所有 API 明确输入输出 Schema”，当前多数 Nitro 路由使用 `readBody<T>()` 断言，无运行时校验。
4. 任务书 Phase 0 要求输出到 `docs/`，仓库此前无 `docs/` 目录（根目录存在上一轮审计文档，保留作历史）。
