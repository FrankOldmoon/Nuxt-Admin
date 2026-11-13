# Phase 1：Core 架构升级实施计划

## Context

Phase 0 审计确认：当前 Nuxt-Admin 有基础 RBAC（角色权限字符串与 `all/self`）、Dashboard CRUD/表注册、Nuxt layer 装载、Blog layer 示例、有限的版本快照及聊天专用客户端扩展注册表；但没有统一的多租户/组织成员模型、完整服务端 Permission Engine、统一 Audit Service、Module SDK/Lifecycle，也没有平台级 API/Tool/UI Component Registry。主库用 Drizzle Kit 管理迁移，Blog 使用独立 DDL。Phase 1 依附件包含这些 Core 能力，但不实现 SIS 领域和完整 Agent Runtime。

现状代码参考：`server/utils/auth.ts`、`server/utils/dashboard/crudService.ts`、`server/utils/dashboard/tables.ts`、`server/database/schema.ts`、`extends/blog/server/plugins/blog.ts`、`extends/blog/server/database/migrate.ts`、`app/composables/useChatExtensions.ts`。

## 已确认决策

- 现有数据组织归属采用**显式映射**；无法确认归属的数据不得猜测或静默归到默认组织。
- Module 启停语义采用**构建期启停**；Nuxt layer 的页面/API 由构建配置决定，运行期禁用不能宣称卸载路由。
- 生产迁移由**发布前统一迁移入口**执行；应用实例不各自并行迁移。开发环境可保留便捷迁移流程，但调用同一编排契约。
- 重要写操作与审计记录采用**同事务阻断**；审计写入失败则相关重要变更整体回滚。

## 推荐实现阶段

### 1. Core 公共契约与迁移方案

- 定义并文档化核心类型：PermissionContext、Resource/Action、组织上下文、资源/字段权限结果、ModuleManifest、模块生命周期状态、迁移定义、API/Tool/UI Component Registry 项。
- 组织上下文必须由服务端身份与有效 Membership 解析；客户端提交的组织 ID 不能直接作为授权依据。
- 明确唯一 ID、重复注册、未知资源、无效策略、依赖错误的默认拒绝与诊断行为。
- 设计 Tenant、Organization、Department、Membership 最小模型与现存用户/数据的显式映射流程；不得引入未审核的默认租户归属。
- 定义模块迁移追踪表、稳定迁移 ID、模块依赖顺序、并发锁、失败状态与恢复策略。保留既有 Drizzle 历史迁移，不重写历史 SQL。

**验收：**契约有类型与文档；权限默认行为及组织映射规则有测试案例；空库和现存库迁移路径经过评审。

### 2. Permission Engine 与 CRUD/API 接入

- 在 `server/utils/auth.ts` 建立统一服务端 `authorize` 与组织上下文解析接口；兼容现有角色权限 `* / table / table:action`，逐步适配 `requireDashboardAccess`。
- 扩展 `server/utils/dashboard/tables.ts` 的显式表注册，加入资源动作、行范围、自定义查询条件、字段读写策略；schema 自动发现不自动授权开放 CRUD。
- 在 `server/utils/dashboard/crudService.ts` 集中应用行级条件与字段过滤。scope 缺失、owner 配置无效或资源无注册时默认拒绝/报错，不得静默放宽为全表访问。
- 逐一核查通用 CRUD 路由及 `tableOverrides`：列表、详情、增改删、批量、导入导出、恢复等；确保 override 及自定义 API 自己经过统一授权。
- 先实现应用层租户隔离。PostgreSQL RLS 不纳入此垂直切片，除非后续单独验证连接池与事务上下文安全。

**验收：**API 直连越权拒绝；两个组织的测试数据相互隔离；列表/详情/更新/批量/导入导出一致应用范围；字段读写限制在服务端生效。

### 3. Module SDK、Lifecycle 与统一迁移编排

- 新增最小 Module SDK：manifest（id/name/version/dependencies/permissions/navigation/database/api/tools/components）、确定性依赖排序、缺依赖/循环/重复 ID 校验、setup/register 生命周期及清理。
- 启停采用构建期语义；显式区分构建期 Nuxt layer 路由、运行期服务注册、模块数据保留。禁用不删表/数据；卸载是单独授权并审计的操作，带备份/保留策略。
- 建立一个发布前迁移命令作为生产唯一编排入口；主库适配器调用 Drizzle migrator，模块适配器执行模块迁移，Blog 暂作为兼容适配，不在此阶段重写其 DDL。
- 让 Blog 或独立 `example-core` 示例通过 SDK 注册 schema/table、权限、菜单/API、Tool/UI Component。由于当前 Blog 关插件仍有 Nuxt layer 路由，构建期开关需同步控制是否挂载 layer。

**验收：**重复运行迁移安全；缺依赖、循环、重复注册和迁移失败给出诊断；示例模块能启用/构建关闭且不删数据；未注册表无法经通用 CRUD 访问。

### 4. Audit & Versioning

- 增加统一审计 schema 与服务，记录 actor、时间、组织、模块、action、resource/record、变更前后、安全来源、结果；按字段脱敏密码/token/密钥。
- 将审计事件写入与重要业务数据写入纳入同一数据库事务；审计失败时整体回滚。
- 首批接入通用 CRUD 和 Example Module 的 create/update/delete/restore/import 等变更；随后覆盖权限变更、登录、失败访问及 export 等方案列明事件。
- 版本历史与审计分离：沿用现有 `features.versions`/Blog 快照作为兼容能力，不冒充全局审计，不强行重写所有旧数据。

**验收：**审计与业务变更同成同败；操作者/组织/模块可追溯；敏感字段脱敏；快照恢复受服务端权限控制。

### 5. Module/API/Tool/UI Registries 与 Example Module

- 平台级 API Registry 仅管理模块 API 声明/元信息与冲突校验，Nitro 文件路由可保持现有路由机制；不为了统一而重写全部 API。
- 服务端 Tool Registry 校验唯一名称、输入/输出 schema、权限声明、超时/错误边界；每次执行重新鉴权，工具不得直接访问任意 SQL。
- UI Component Registry 使用固定组件 ID 与 props schema 校验；模型输出不能注入任意组件代码。现有 `useChatExtensions.ts` 仅作为客户端聊天扩展参考，不直接视为服务端 Registry。
- 建立轻量 Example Module（建议 `example-notes`），不包含 SIS 领域：一个组织归属表、一条迁移、一个权限资源、一条 API/受控 CRUD、一个工具定义、一个固定 UI 组件及导航项。
- 提供 SDK 类型文档和单元/集成测试。

**验收：**Example Module 无 SIS 或 Agent Runtime 依赖即可启用；Registry 冲突与参数错误会拒绝；停用工具不可调用；所有执行在服务端重新授权并写审计。

## 关键文件边界

- 修改/扩展：`server/database/schema.ts`、`server/database/migrations/**`、`server/plugins/database.ts`、`package.json`（迁移脚本）。
- 授权与 CRUD：`server/utils/auth.ts`、`server/utils/dashboard/tables.ts`、`server/utils/dashboard/crudService.ts`、`server/utils/dashboard/tableOverrides.ts`、`server/api/dashboard/data/**`。
- 模块接入：`nuxt.config.ts`、`extends/blog/nuxt.config.ts`、`extends/blog/server/plugins/blog.ts`、Blog migration adapter；新增 Core SDK 和 Example Module 对应目录/测试。
- Registry/UI/Tools：新建平台级服务与类型；对照 `app/composables/useChatExtensions.ts`，但保持客户端代码与服务端执行隔离。
- 审计：新增 Audit schema/service，接入 CRUD 事务与重要变更入口。
- 测试：`test/unit/**`、`test/e2e/**`、`extends/blog/test/**`；使用独立临时数据库，不依赖共享开发库。

## 数据迁移、兼容与风险控制

- 先新增组织/成员/审计/模块迁移元数据，再逐步接入旧数据。通过显式映射清单把现存用户与可确认业务数据归属到组织；不能确认的数据列为阻塞项，不做默认归属。
- 不重写主库既有 Drizzle 迁移历史；新增 forward migration，并提供恢复/回滚或明确前向修复方案。
- 生产唯一迁移入口在发布前执行，保证应用实例不会启动时各自竞争跑迁移。
- 先用兼容 adapter 保留旧 RBAC 配置及 `requireDashboardAccess` 调用，再逐路由迁移；每类路由都须有授权测试。
- Blog 保留旧 DDL 适配至验证完成；构建期禁用需要避免挂载 Blog layer，而不是只跳过 Nitro 插件。
- 审计同事务阻断会降低可用性但保证重要操作可追溯；事务边界需覆盖业务写入与审计写入，禁止仅在响应后异步补写。

## 明确不纳入 Phase 1

- SIS 领域模型、学生/教师/成绩/课表等业务实现。
- 完整 Agent Runtime、对话编排、Prompt 流程、持久化工作流与 AI 评估。
- 不经专项设计启用 PostgreSQL RLS、微服务拆分、通用 CLI 发布产品化及全量旧接口一次性重构。

## 验证计划

- 单元测试：授权规则、默认拒绝、组织上下文、行/字段过滤、依赖排序、manifest 校验、注册冲突、迁移计划和审计脱敏。
- 集成测试：两组织隔离、CRUD/override/API 覆盖、未授权读写拒绝、审计同事务回滚、文件与工具调用授权。
- 迁移测试：空库迁移、现存数据库显式映射、重复迁移、故障恢复、Blog DDL 兼容与 Example Module migration。
- 生命周期测试：构建期启用/关闭、路由是否挂载、禁用保留数据、模块注册清理和依赖错误。
- Registry 测试：API/Tool/UI ID 冲突、schema 校验、停用后不可执行、未知 UI 组件拒绝。
- 完成时运行项目 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`；生产迁移在隔离数据库验证。
