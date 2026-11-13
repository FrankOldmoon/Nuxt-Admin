# 架构升级建议计划（基于 Phase 0 审计）

> 本文是方案和建议，不代表已执行。目标约束来自用户提供的《Nuxt-Admin 架构升级与 SIS + AI Agent 模块开发实施方案》；当前事实以仓库源码为准。此阶段不修改应用代码。

## 原则

1. 保留 Nuxt 4、Vue 3、TypeScript、PostgreSQL、Drizzle 技术栈。
2. 保留并逐步抽象现有认证、CRUD、LLM、通知、文件和支付实现，不重写已有能力。
3. 先建立可测的 Core 契约与授权/审计底座，再并行建设 SIS 与通用 Agent。
4. SIS 与 Agent 独立：SIS 不依赖 Agent；Agent 不依赖某个业务模块。
5. schema 的自动发现不等于允许 API 访问；写操作必须服务端授权与审计。
6. 每个阶段先定义验收和迁移策略；破坏性变更单独记录。

## Phase 0：现有架构审计（本阶段）

**状态：已完成文档交付，未修改应用代码。**

输出文件：`CURRENT_ARCHITECTURE.md`、`CURRENT_FEATURES.md`、`MODULE_DEPENDENCY_MAP.md`、`TECHNICAL_DEBT.md`、`UPGRADE_PLAN.md`。审计发现当前是 Nuxt 全栈单体与 Blog layer 示例；已有 CRUD/基本 RBAC/LLM 聊天等，但没有完整 Module SDK、SIS、Agent Tool Registry、多租户和统一审计实现。

## Phase 1：Core 契约与基础能力

### 1.1 建立 Module SDK 最小垂直切片

- 先定义 manifest 类型：id/version/dependencies/permissions/navigation/schema/migrations/API。
- 实现确定性发现、依赖排序与缺依赖/循环依赖时报错；定义 setup/register/activate/deactivate 行为。
- 通过兼容适配逐步接入 `extends/blog`，用 Example Module 验证页面、API、schema、迁移、菜单/权限注册。
- 禁用模块不删除数据；卸载必须单独授权并规定备份/保留策略。
- 明确宿主与模块的迁移日志、执行顺序、失败恢复契约；不可直接混用两套隐式自动迁移。

**验收：** Example Module 可启用/禁用，依赖错误可诊断，迁移幂等且有恢复文档；未注册表不开放 CRUD。

### 1.2 权限与组织上下文

- 保留 `requireUser` / `requireAdmin` 作为过渡，定义唯一的服务端 `authorize` 与 query scope/field filter 接口。
- 先建 Tenant、Organization、Department、Membership 关系及可信组织上下文解析；确定单组织与多组织部署模式。
- 明确 RBAC 权限标识、属性来源、资源范围与字段读写策略；复杂 SIS 访问由关系查询/领域服务生成，不仅依赖角色字符串。
- 在服务层统一挂接检查，覆盖通用 CRUD、覆盖 API、文件、Agent tools；增加正向与越权集成测试。
- 若采用 PostgreSQL RLS，先证明事务/连接池上下文不会跨请求泄漏，再启用。

**验收：** 未授权 API 请求即使绕过前端仍拒绝；两个组织间查询/写入隔离；字段读取/写入按策略验证。

### 1.3 审计、版本与通用 CRUD

- 定义统一审计事件 schema/service，记录操作者、时间、组织、模块、action、资源、before/after、来源与结果。
- 统一 CRUD、定制服务、导入导出、授权变更、登录等事件入口；敏感字段脱敏和保留周期有明确策略。
- 将版本历史与操作审计区分，支持关键记录恢复/追溯。
- 逐步把“schema 自动发现”改为“显式发布/注册后可 CRUD”；保持只读、隐藏、计算字段和 relation 的服务端白名单。

**验收：** 所有写入路径有审计测试；未登记表无法通过通用 API 访问；行级/字段级测试覆盖。

### 1.4 Core 服务边界与基础设施

- 规范 Notification、File Storage、Email、Payment、Job、Logging 等服务接口，模块只依赖接口，不直接访问其它模块内部表。
- 文件授权/公开策略先与现有消费者核实；为本地存储定义 provider 契约，之后再按需求添加对象存储。
- 若目标多实例，替换/扩展 WebSocket 进程内注册和限流为共享适配，但先为单实例保持兼容。

## Phase 2：独立 SIS Module

1. 在 Core 组织/权限契约通过验收后，定义 SIS manifest、模块 schema/migrations、permissions/navigation/API。
2. 按顺序实现 Identity & Organization、School/Campus、Academic Year/Term、Grade/Class、Student/Teacher/Subject/Assignment。
3. 学生/教师业务档案与系统 User 分离；用有效时间/历史关系保存班级、学期、任教变化。
4. 用领域服务实现学生档案、成绩、课表、考勤、请假/审批、食堂等；复杂命令不经通用 CRUD 直接写入。
5. 建立固定传统页面及共享服务 API；单元/集成/权限/历史数据迁移测试同步交付。

**验收：** 教师按有效任教关系取数，学生只能访问自身范围；年级/班级/任教历史可追溯；不启用 Agent 时 SIS 完整运行。

## Phase 3：独立 AI Agent Module

1. 在现有 LLM provider/流式能力上实现独立 Agent Runtime，不另起不必要微服务。
2. 实现 Tool Registry：唯一名称、输入/输出 schema、权限声明、超时/错误处理、执行日志；每次调用重新鉴权，工具不直接任意 SQL。
3. Query/Command 分离；Command 采用 validate → authorize → preview → user confirmation → execute → audit。
4. 实现服务端持久化 Conversation/Context 与 Tool Execution History；上下文只帮助解析，不作为授权凭证。
5. 实现固定 UI Component Registry 与参数 schema 验证；数据通过授权 API/Data Reference 展示，不让模型输出任意 HTML/组件代码。
6. Agent 通过 Core 工具契约接入 SIS，SIS 不依赖 Agent。

**验收：** 无 SIS 时 Agent Runtime 可启动；无 Agent 时 SIS 可运行；工具越权/提示注入不能绕过服务端授权；敏感命令需用户确认且有审计。

## Phase 4：集成验收

覆盖附件中 Teacher、Principal、Student、Registrar 角色场景；验证传统 UI 与 Agent 使用同一领域服务。重点安全场景包括跨教师、跨组织、学生间、字段越权、未授权写入、Agent 越权和审计完整性。为每个失败用例验证 API 响应和数据库状态，而非只验证界面。

## Phase 5：生产准备

- CI：安装、类型检查、lint、单元/集成测试、构建；为迁移和回滚建立验证流水线。
- 部署：容器/托管配置、环境变量清单、健康检查、数据库备份与恢复演练。
- 运维：结构化日志、错误监控、速率限制、密钥与敏感数据加密策略。
- AI：工具评估集、提示注入/越权测试、成本与超时监测。
- 发布策略：模块版本兼容矩阵、迁移窗口、回滚/前向修复策略。

## 建议优先级

1. 先做权限现状盘点与统一授权接口设计，同时明确组织/租户模型。
2. 再做审计与迁移编排契约，避免 SIS 数据建成后补救。
3. 以 Blog/Example Module 验证 Module SDK。
4. SDK 与 Core 验收后开发 SIS 领域模块。
5. 在通用权限与工具协议稳定后开发 AI Agent；以既有 LLM 流式实现复用，而不是重写。

## 范围与不确定项

- 当前工作区没有 SIS、AI Agent、`modules/nav`、`modules/doc` 的源代码，不能评价其实现质量。
- CI/CD 缺失仅指本仓库未检出常见 workflow/container 配置，不排除仓库外部流水线。
- 当前功能存在不等同于已通过生产环境完整验收；Phase 1 开始前应补充真实数据库、provider 和部署环境的集成证据。
