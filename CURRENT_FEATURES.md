# 当前功能清单

> 仅列当前检出代码能证实的功能。README 可以辅助定位，但不把未检出的外部模块描述计作现成功能。

## 1. Web 应用与界面

- Nuxt 4 / Vue 3 全栈应用，使用 Nuxt UI；页面、布局、组件、composables 位于 `app/`。
- Dashboard 管理界面含动态数据页，并为部分配置、用户、文件等功能提供定制页面/处理器。
- Blog Nuxt layer 在本仓库实际存在，包含文章相关页面、API、schema、迁移和初始化逻辑。
- 国际化依赖 `@nuxtjs/i18n` 已在项目依赖中；具体页面覆盖按各路由实现为准。

## 2. 认证、身份与权限

- 本地用户登录/session Cookie、登出、用户启用/软删除检查；session token 哈希存储。
- 角色管理与基于权限字符串的 Dashboard 访问检查，管理员检查使用 admin 角色。
- 第三方 OAuth 登录关联；源码还实现 GitHub、Google、Microsoft 等 OAuth provider 流程。
- OIDC Provider：发现文档、JWKS、授权码/PKCE、token、userinfo、撤销/introspection 等端点。
- 未见完整 ABAC、组织成员关系、多租户上下文/隔离、字段级授权引擎。

证据：[`auth.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/auth.ts#L13-L125)、[`oauth.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/oauth.ts#L34-L86)、[`oauthServer.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/oauthServer.ts#L89-L123)、[`token.post.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/oauth/token.post.ts#L20-L148)。

## 3. Dashboard / CRUD 引擎

- Drizzle schema 表发现与注册，表字段/关系元信息生成；支持自定义注册配置、菜单注册、定制 CRUD override。
- 通用查询支持分页、排序、搜索/过滤等（按 `server/utils/dashboard` 服务实现）；项目提供数据导入导出相关功能。
- 注册 schema 不等同于统一模块注册；自动发现与显式可访问表元数据并存。复杂领域写入应由专用业务服务承担。

证据：[`tables.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/tables.ts#L887-L913)、[`tables.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/tables.ts#L939-L1029)、[`crudService.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/crudService.ts#L392-L444)。

## 4. 数据管理与通用基础能力

- PostgreSQL/Drizzle schema、数据库迁移与启动初始化/种子。
- 用户与角色、系统配置、token、文件元数据、通知及私信、模板关联等基础数据模型。
- 文件上传到本地 `storage/`，支持哈希去重、下载/预览流、软删除/回收站相关接口；路径解析防目录穿越。
- 通知包含广播或定向目标、读取状态；私信有联系人/历史/读状态接口和 WebSocket 实时通信。
- 邮件、速率限制、分页、密码重置等服务或接口在 `server/` 中有实现及部分测试。

证据：[`fileStorage.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/fileStorage.ts#L6-L63)、[`upload.post.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/files/upload.post.ts#L8-L75)、[`notifications.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/notifications.ts#L8-L45)、[`messages.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/messages.ts#L29-L69)。

## 5. AI / 实时能力

- LLM 接入兼容 OpenAI Chat Completions API，支持流式输出和配置 endpoint/model/key 等；前端聊天 composable 使用 WebSocket 并提供 HTTP 回退。
- 当前未见通用 Agent Orchestrator、Tool Registry、业务工具权限网关、固定 AI UI 组件注册表、命令预览/确认协议、持久化多步 Workflow。
- 私信 WebSocket 是实时消息通道，不等同于 Agent Runtime。

证据：[`llm.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/llm.ts#L34-L105)、[`llm/ws.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/llm/ws.ts#L42-L59)、[`useLlmChat.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/app/composables/useLlmChat.ts#L58-L101)、[`ws.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/ws.ts#L52-L90)。

## 6. 支付与会员

- 会员计划/订阅与积分相关模型及服务。
- 微信支付、支付宝、Stripe 订单与回调实现；回调代码包含签名/订单状态等校验逻辑。
- 不能将“存在支付代码”解释为已完成生产环境支付验收；具体 provider 覆盖与测试缺口见 `TECHNICAL_DEBT.md`。

证据：[`membership.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/membership.ts#L12-L73)、[`stripe.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/stripe.ts#L62-L149)、[`wxPay.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/wxPay.ts#L91-L173)、[`stripe notify`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/stripe/pay/notify.post.ts#L19-L93)。

## 7. Blog 与模块机制

- Blog 是仓库内可验证的 Nuxt layer，插件初始化时注册 schema、迁移、CRUD/菜单及种子。
- Dashboard schema/table 注册机制允许扩展表；Nuxt 配置有 layer 与可选目录加载逻辑。
- 当前检出没有 `modules/nav`、`modules/doc`。README 称其为独立仓库的可选模块，但不能审计未检出的实现。
- 当前未发现可管理模块 manifest、版本、依赖、生命周期、启停和卸载的统一 Module SDK。

证据：[`blog.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/extends/blog/server/plugins/blog.ts#L33-L76)、[`nuxt.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/nuxt.config.ts#L17-L40)。

## 8. 测试与交付

- Vitest 测试配置存在；git 跟踪 55 个测试文件，涵盖 server、app 及 API E2E 等部分路径。
- `pnpm test`、`pnpm test:coverage` 脚本在 package scripts 中定义。
- 当前仓库检查未发现 CI Workflow、Docker/Compose 等容器交付文件；存在 PM2 示例配置。功能级测试覆盖清单见 `TECHNICAL_DEBT.md`。

证据：[`package.json`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/package.json#L5-L20)、[`vitest.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/vitest.config.ts)、[`ecosystem.config.example.cjs`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/ecosystem.config.example.cjs#L1-L13)。
