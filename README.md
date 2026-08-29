# Nuxt Admin

一个基于 **Nuxt 4 + Nuxt UI** 的通用管理系统基座（Admin Framework）。核心亮点是**元数据驱动（metadata-driven）的通用 CRUD**：仅仅定义一张 Drizzle 表，即可自动获得列表、表单、详情、筛选、排序、导入导出、软删除等完整后台能力，无需为每张表编写页面与接口。同时预留了清晰的**模块化扩展点**，方便扩展出题库、教学等业务子模块。

> 仓库名含 "AI" 沿用历史命名，实际项目通用名称为「Nuxt Admin」。
> 当前仓库为**后台基座**；其它业务模块（如教学/题库）可通过本文档「模块化扩展」一节的接口接入。

---

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 前端框架 | Nuxt 4、Vue 3、TypeScript、Tailwind CSS 4 |
| UI 组件库 | Nuxt UI v4、Iconify（lucide / simple-icons） |
| SSR / 服务端 | Nitro（含 OpenAPI、WebSocket） |
| 数据库 | PostgreSQL、Drizzle ORM（`@nuxtjs/i18n` v10 国际化） |
| 富文本 / Markdown | markdown-it、KaTeX、highlight.js |
| 文件 / 图片 | sharp、browser-image-compression、vue-advanced-cropper |
| 邮件 | nodemailer |
| 测试 | Vitest、@nuxt/test-utils、happy-dom、@vitest/coverage-v8 |
| 工程化 | pnpm、ESLint v10、Drizzle Kit、PM2（生产部署） |

---

## 核心功能

### 认证与用户中心
- 注册 / 登录 / 登出 / 忘记密码 / 重置密码 / 邮箱验证，支持开关公开注册（`configs`）。
- **持久化、可撤销会话令牌**（`tokens` 表），`httpOnly` Cookie 会话。
- 基于**共享角色表**的 RBAC（`admin` / `user`），`requireUser` / `requireAdmin` 服务端守卫 + `auth` / `admin` 前端路由中间件。
- 个人中心：资料修改、头像上传（压缩 + 裁剪）、改密码；管理端可查看用户**最后登录时间与 IP**。

### 元数据驱动的通用 CRUD（核心）
- **Schema 自动发现**：注册 Drizzle schema 后，任何 `pgTable` 暴露的表都可经通用接口访问；字段类型、校验、关系、列宽等可按命名约定与列元数据自动推断（`inferFieldType` / `applyFieldNamingHints`）。
- **通用接口**：`/api/dashboard/data/:table/*`（列表 / 详情 / 新增 / 更新 / 批量 / 上传导入 / 导出）。
- **通用页面** `DashboardCrudPage`：列表表格、增改表单弹窗、详情弹窗、行操作、批量操作。
- **高级筛选**：动态添加筛选条件，每项含逻辑连接（AND/OR）、列、按字段类型动态切换的操作符与值输入。
- **列排序 + 列显示/隐藏**：列隐藏偏好持久化到 `localStorage`。
- **关系与多对多**：`*_id` 外键自动渲染为关联下拉框；双外键表（pivot）自动识别为多对多虚拟字段（如 `userIds`），读写自动同步 pivot。
- **导入导出**：Excel 导入 / 导出、JSON 导入 / 导出（遵循当前筛选条件）。
- **软删除 / 恢复 / 永久删除** 与回收站视图。
- **搜索性能**：`pg_trgm` GIN 三角索引覆盖常用搜索列（`ilike '%...%'`），索引缺失时自动回退顺序扫描。
- **大量自定义插槽 / 钩子**：`#toolbar`、`#form-content`、`#detail-content`、`#table-{field}`、`transformPayload`、`apiBase`（其它模块可复用通用 CRUD 渲染）。

### 系统配置（`/dashboard/configs`，自定义页面）
分 Tab 管理 `configs` 表（键值 + 类型）：
- **常规**：站点标题/描述、注册开关、安全 TTL、上传限制。
- **邮件**：SMTP 参数。
- **LLM**：OpenAI 兼容参数（`apiKey` / `baseUrl` / `model` / `temperature` / `maxTokens` / `systemPrompt`）。
- **菜单编辑**：卡片式编辑左侧默认菜单，支持增删、排序、改标签、选图标、绑定表、隐藏。

### 菜单编辑器
复用 `/api/dashboard/meta`，允许管理员直接在 UI 增删改排序左侧导航，保存后刷新全局菜单缓存。

### 通知系统
- 管理端可创建通知：**广播给所有人**或**定向发送给指定用户 ID 列表**。
- 用户端收件箱 + 未读数 + 已读状态（`notification_reads` + WebSocket 实时推送）。

### 私信系统
- 用户对用户实时消息、会话列表、未读数、已读回执、在线状态（WebSocket）。

### LLM 集成
- 统一前端调用 `useLlmChat`：优先 **WebSocket 流式**（`/api/llm/ws`），失败自动回退 **HTTP**（`/api/llm/chat`），错误信息带人话提示。
- 服务端：LLM 上游调用、流式增量推送；参数全部由「系统配置 - LLM」驱动。
- 「系统配置 - LLM」提供**测试连接**按钮，基于配置实时校验上游连通与鉴权（不消耗生成配额）。

### WebSocket 实时能力
同源 `/api/ws` 复用一条连接，支持：通知推送、私信收发与已读、在线状态、LLM 流式输出；自动断线重连（指数退避）、登录后自动连接 / 登出断开。

### 文件管理
上传（大小 / MIME 白名单可配）、本地存储、下载 / serve、按用户维度记录、软删除。

### 国际化
`i18n/locales/en.json`、`zh.json` 双语，`no_prefix` 策略 + 浏览器语言检测 + Cookie 持久化；后端标签以中文为主，前端经 `t('dashboard.fields.${key}')` 补充。

---

## 目录结构

```
├── app/                    # 前端
│   ├── components/
│   │   ├── base/           # markdown/textarea、viewer、iconPicker、imagePreview、avatarUploader、fileUploader …
│   │   ├── auth/           # form、modal
│   │   └── dashboard/
│   │       ├── crud/       # 通用 CRUD 原子组件（page/table/tableBase/form/detail/formModal/detailModal/
│   │       │               #   filters/header/rowActions/excelImportModal/fieldRenderer/cellRenderer）
│   │       ├── shell.vue / sidebar.vue / menuEditor.vue / configsPage.vue / notificationsPage.vue …
│   │   └── app/            # header / footer / logo
│   ├── composables/        # useAuth、useDashboardMeta、usePagedResource、useExcelExport、useFilterOperators、
│   │                       # useWebSocket、useLlmChat、useUniverSheet、usePublicConfig …
│   ├── layouts/            # dashboard、default
│   ├── middleware/         # auth、guest、admin
│   ├── pages/              # login/register/forgot|reset-password/profile/messages/notifications；
│   │                       # dashboard/index、dashboard/[table]、users、files
│   ├── types/  utils/  app.config.ts  app.vue
│
├── server/                 # 服务端（Nitro + Drizzle）
│   ├── api/
│   │   ├── auth/           # 登录/注册/登出/me/改密/改资料/邮箱验证/重置密码
│   │   ├── config/         # 系统配置（index/public/put）
│   │   ├── dashboard/
│   │   │   ├── meta/       # 表元数据（列表 / 单表，含自定义标记、菜单）
│   │   │   └── data/       # 通用 CRUD / files / users 的逻辑
│   │   ├── files/          # 上传 / 下载 / serve
│   │   ├── llm/            # chat（Post）、ws（流式）
│   │   ├── notifications/  # 收件箱、未读数、标已读、创建
│   │   ├── messages/       # 联系人、历史、未读数、搜索
│   │   └── ws.ts           # WebSocket 网关（通知/私信/在线/LLM）
│   ├── database/           # schema / migrate / seed / ensure（自动建库）
│   ├── utils/              # auth、session、tokens、users、files、mail、notifications、messages、llm、
│   │                       # rateLimit、password(Reset)、email-verification、fileStorage、configs、pagination；
│   │                       # dashboard/ 下的 crudService、tables（自动发现 + 注册表）
│   └── plugins/  database.ts
│
├── modules/<your-module>/      # （可选）业务模块，经 registerDashboardTable / registerDrizzleSchema 接入
├── i18n/locales/           # en.json / zh.json
├── test/                   # e2e（API）、unit（app/server）、nuxt（组件/composable/页面）、helpers
├── drizzle.config.ts  nuxt.config.ts  vitest.config.ts  ecosystem.config.cjs  .env.example
```

---

## 快速开始

前置要求：Node.js 18+、pnpm、PostgreSQL。

```bash
# 1. 安装依赖
pnpm install

# 2. 准备环境变量
cp .env.example .env
#    编辑 .env，至少设置 DATABASE_URL 与 SESSION_SECRET
#    SESSION_SECRET 建议：openssl rand -hex 32

# 3. 准备数据库
pnpm db:generate   # 由 schema 生成迁移（已有迁移时可跳过）
pnpm db:migrate    # 应用迁移，自动建表

# 4. （可选）填充种子数据：admin/admin@example.com 用户、角色、默认配置、测试用户
node -e "import('./server/database/index.ts')"  # 或运行应用首次启动自动 ensure+seed
#    更简单：开发模式下启动后，应用会自动确保数据库存在并尝试迁移/种子
pnpm dev

# 5. 构建 / 预览
pnpm build
pnpm preview
```

> 说明：`server/database/ensure.ts` 能自动创建目标数据库；是否在启动时自动执行迁移由 `AUTO_MIGRATE=true` 控制。生产环境更推荐在发布流水线中显式执行 `pnpm db:migrate`。

**默认管理员账号**（由种子脚本创建）：用户名 `admin`，密码 `Admin@123`，邮箱 `admin@example.com`。

---

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器（`--host`） |
| `pnpm build` / `preview` | 构建 / 预览生产产物 |
| `pnpm lint` / `typecheck` | 代码检查 / 类型检查 |
| `pnpm db:generate / migrate / push / studio` | Drizzle Kit 迁移与数据库管理 |
| `pnpm test` / `test:watch` / `test:coverage` | 运行测试套件 |
| `pnpm server` | 运行构建产物（配合 `--env-file`） |
| `pnpm pm` | 用 PM2 启动生产（见 `ecosystem.config.cjs`） |

---

## 部署

- 单实例亦可跑在 PM2 上，配置见 `ecosystem.config.cjs`（默认监听 0.0.0.0:80，可通过 `nitro_port` 调整）。
- 生产环境设置 `AUTO_MIGRATE` 由部署策略决定；务必设置强随机的 `SESSION_SECRET`。
- npm 脚本 `server` 使用 `--env-file-if-exists=.env` 读取环境变量，方便 PM2 注入。

---

## 模块化扩展

通过 `server/utils/dashboard/tables.ts` 暴露的一组注册函数，业务模块可在 Nitro 启动时把**自己的表和服务**接入通用系统：

- `registerDrizzleSchema(schema)`：将模块的 Drizzle schema 注册进自动发现池，任意 `pgTable` 立即可用。
- `registerDashboardTable(reg, { menuOrder })`：显式注册表的 `TableMeta`（可覆盖字段顺序 / 标签 / 类型 / 校验 / 关系）；传 `menuOrder` 则同时加入默认侧边菜单，不传则可保持模块内部表不出现在主菜单。
- `registerDrizzleSchema` + Drizzle pivot 约定：自动识别**多对多**并注入虚拟字段。
- 自定义整页逻辑：标记 `custom: true` + 在 `[table].vue` 的 `CUSTOM_PAGE_MAP` 映射组件（如 `configs` → `configsPage.vue`）。
- 复用通用页面（`custom: false`）时，可用 `#toolbar` / `#form-content` / `#detail-content` 插槽与 `transformPayload` 钩子做轻定制，或用 `apiBase` 指向模块自己的通用 CRUD 命名空间。

模块 API 仅需 `requireUser` / `requireAdmin`，即可复用主项目的 session 会话、RBAC、公告/私信/WebSocket 等基础设施。

---

## 测试

```bash
pnpm test            # 全量测试
pnpm test:coverage   # 覆盖率
```

测试覆盖：服务端（auth、session、tokens、users、files、notifications、messages、mail、rateLimit、pagination、密码与重置、WS 与 WS 注册表、dashboard 自动发现与通用 CRUD、文件存储、LLM WS）、前端（composable、工具、组件、page）、API 端到端。

---

## 环境变量参考（`.env.example`）

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串（如 `postgres://user:pass@host:5432/db`） |
| `AUTO_MIGRATE` | 启动时是否自动执行迁移（默认不开启） |
| `SESSION_SECRET` | 会话签名密钥，必填，建议随机长串 |
| `NUXT_PUBLIC_SITE_URL` | 站点公开 URL |
| `DB_POOL_MAX` / `DB_POOL_IDLE_TIMEOUT` / `DB_POOL_CONNECT_TIMEOUT` | 连接池调优（可选） |

> 站点标题、邮件 SMTP、上传限制、安全 TTL、LLM 参数均在后台「系统配置」中管理，无需改动代码。

---

## 项目状态与扩展点建议

当前基座功能完整、测试充分。已内置：操作审计日志、LLM 连通性测试、动态概览统计、pg_trgm 全文索引、用户最后登录信息展示。后续可增强方向：字段/角色级权限、仪表盘统计图表、深色模式、数据备份恢复等。