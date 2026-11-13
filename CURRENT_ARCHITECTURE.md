# 当前架构审计

> 审计范围：当前工作区实际检出的 Nuxt-Admin 源码。只读检查，结论以代码为准；附件中的目标设计用于后续差距比较，不当作现状。

## 1. 系统形态

当前代码是 Nuxt 4 + Vue 3 + TypeScript 的全栈单体应用，Nitro 承载服务端 API、插件及 WebSocket，PostgreSQL 为数据库，Drizzle ORM 为数据访问/迁移工具。依赖、脚本以 `package.json` 为准；Nuxt 配置中挂载 `extends/blog` layer，并按环境配置追加 layer/扫描可选模块目录（`nuxt.config.ts`）。

核心技术依赖：Nuxt 4、Vue 3、Nuxt UI、PostgreSQL 驱动 `pg`、Drizzle ORM/Kit、Vitest。仓库未见单独前端/后端服务边界。

## 2. 运行与启动

- `pnpm dev`、`pnpm build`、`pnpm preview` 由 `package.json` 提供。
- Nuxt 配置设置 Nitro 插件目录为 `server/plugins`。数据库插件在服务启动时校验配置并连接 PostgreSQL；开发环境执行迁移，生产环境是否自动迁移受 `AUTO_MIGRATE` 控制，随后运行种子/初始化步骤。证据：[`nuxt.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/nuxt.config.ts)、[`package.json`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/package.json)、[`database.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/plugins/database.ts#L19-L54)。
- 主库迁移使用 Drizzle Kit 配置的主 schema 与 `server/database/migrations`。Blog layer 自己有数据库初始化和幂等 DDL 迁移；未发现与宿主迁移统一排序/版本协调的注册机制。证据：[`drizzle.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/drizzle.config.ts)、[`migrate.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/extends/blog/server/database/migrate.ts#L1-L18)。

## 3. 目录与分层

- `app/`：Nuxt 页面、布局、组件、composables 等 UI。
- `server/api/`：Nitro HTTP API；当前 git 跟踪 87 个 API 文件。
- `server/utils/`：认证、数据库服务、权限、通用 CRUD、支付、LLM、消息等服务逻辑。
- `server/database/`：主 Drizzle schema、种子、迁移。
- `extends/blog/`：一套 Nuxt layer 示例，含自己的页面、API、schema、迁移及 Nitro 插件。
- `test/`：Vitest 测试，当前 git 跟踪 55 个测试文件。

目录清单结论只覆盖当前 git 跟踪内容；构建产物、依赖目录不用于判断应用模块边界。

## 4. 数据层

主数据库 schema 定义 PostgreSQL 表，覆盖身份与权限、OAuth 登录关联、订阅/积分、系统配置与令牌、文件、通知/私信、模板/关联、微信用户与会话、微信/支付宝/Stripe 订单、OIDC 客户端/授权码/token 等领域。Blog schema 位于 layer 内独立维护。主迁移目录包含 0000–0008 九个 journal 记录（以 `_journal.json` 为准）。

主 schema 的用户/角色有外键与唯一索引；认证 token 以哈希保存；部分支付订单保存回调 payload。当前 schema 没有通用 Tenant/Organization/Membership 模型（在主 `schema.ts` 定义中未见），不可据此声称已有多租户数据隔离。

证据：[`schema.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/database/schema.ts#L18-L94)、[`schema.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/database/schema.ts#L101-L225)、[`schema.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/database/schema.ts#L247-L357)、[`schema.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/database/schema.ts#L432-L714)、[`_journal.json`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/database/migrations/meta/_journal.json#L1-L68)。

## 5. 认证与授权

登录会创建随机 session token，并以哈希存储；请求通过 session Cookie 解析用户、启用状态和角色。授权由 `requireUser`、`requireAdmin` 及 Dashboard 表/操作权限检查承担。角色数据含权限字符串数组与 `dataScope` 字段；当前通用权限模型不是附件目标中的统一 ABAC + resource/field-level Permission Engine。部分表使用手工覆盖处理器，需要自行完成授权。

证据：[`auth.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/auth.ts#L13-L125)、[`session.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/session.ts#L7-L27)、[`tableOverrides.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/tableOverrides.ts#L14-L63)。

## 6. 通用 CRUD 与扩展

Dashboard 层提供 Drizzle schema 注册/自动发现、表元数据生成、显式表注册、定制处理器覆盖、通用数据列表/增删改接口等能力。字段/关系推断和逐表配置共存；并非所有业务都适合通用 CRUD。

项目另有 Nuxt layer 扩展点：仓库内 `extends/blog` 是实际示例。`nuxt.config.ts` 读取可选扩展目录与开关；README 提及的独立 `modules/nav`、`modules/doc` 仓库在当前检出中不存在，不能把其功能视为现有代码。当前也未从源码发现具有 manifest、依赖解析、生命周期钩子、统一安装/卸载/版本管理的完整 Module SDK。

证据：[`tables.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/tables.ts#L887-L913)、[`tables.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/tables.ts#L939-L1029)、[`nuxt.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/nuxt.config.ts#L17-L40)、[`blog.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/extends/blog/server/plugins/blog.ts#L17-L76)。

## 7. 接口、测试与部署

API 由 Nitro 文件路由组织，计数为当前跟踪的 87 个 `server/api` 文件。测试由 Vitest 执行，配置包含 Node 与 Nuxt 测试环境，当前跟踪 55 个测试文件；测试数量不等于功能完整性，具体缺口见 `TECHNICAL_DEBT.md`。检查仓库根目录未发现 `.github` workflow、Docker/Compose 等常见 CI/容器部署定义；有 PM2 示例配置。此结论仅限本仓库文件。

证据：[`vitest.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/vitest.config.ts)、[`ecosystem.config.example.cjs`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/ecosystem.config.example.cjs)。

## 8. 架构边界总结

现状是“Nuxt 全栈宿主 + 通用 CRUD 与基础设施 + Blog layer 示例 + 可选 layer 加载入口”，并非已完成的 Core/独立业务模块/独立 AI Agent 架构。SIS、通用 Module SDK、权限引擎、多租户、审计中心、Agent Tool/UI Registry 均需按实际代码进一步建设；详见 `UPGRADE_PLAN.md`。