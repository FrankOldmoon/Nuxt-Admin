# 模块与依赖关系图

> 反映当前检出源码中的实际依赖，不把升级方案的目标模块写成已存在实现。代码路径相对仓库根目录。

## 1. 当前可核实的结构图

```text
Nuxt 4 / Nitro 宿主
├── app/ 前端 UI ───────────────┐
├── server/api/ HTTP + WS 路由  │
├── server/utils/ 服务/CRUD/RBAC│
├── server/plugins/database.ts │
│       └── PostgreSQL + Drizzle
├── server/database/ 主 schema、主迁移、seed
└── extends/blog/ Nuxt layer
        ├── blog 页面/API
        ├── 自有 schema 与幂等 DDL 迁移
        └── 直接依赖宿主 DB、用户 schema、CRUD/menu 注册器
```

依赖主链：

```text
页面/Composable → Nitro API → server/utils 服务 → Drizzle schema → PostgreSQL
                                  ↑                    ↑
                           requireUser/RBAC      数据库插件

Blog Layer → 宿主数据库/用户/注册器
           → Blog schema + layer 自有 migrate
           → Blog API 与页面
```

## 2. 当前依赖边界

| 部分 | 依赖对象 | 证据/边界 |
|---|---|---|
| Nuxt 宿主 | Nuxt/Nitro、Vue、Nuxt UI、PostgreSQL/Drizzle | [`package.json`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/package.json)、[`nuxt.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/nuxt.config.ts) |
| 数据库初始化 | 主 schema、主迁移、seed、数据库连接 | [`database.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/plugins/database.ts#L19-L54) |
| 通用 CRUD | schema 注册池、表元数据、操作权限及 CRUD 服务 | [`tables.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/tables.ts#L887-L913)、[`crudService.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/dashboard/crudService.ts#L392-L444) |
| Auth/RBAC | session token、users/roles、权限辅助函数 | [`auth.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/auth.ts#L13-L125) |
| Blog layer | 宿主 DB、用户 schema、Dashboard CRUD/menu 注册能力；自己的 schema/migrate | [`blog.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/extends/blog/server/plugins/blog.ts#L17-L76)、[`schema.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/extends/blog/server/database/schema.ts#L4-L58) |
| LLM 聊天 | 前端 composable、LLM server API/util、会话身份 | [`llm/ws.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/llm/ws.ts#L42-L59)、[`llm.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/llm.ts#L34-L105) |
| 通知/私信 | users、消息/通知 schema、API/service、WebSocket | [`messages.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/utils/messages.ts#L29-L69)、[`ws.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/server/api/ws.ts#L52-L90) |

## 3. Layer 与模块发现

Nuxt 配置挂载 `extends/blog`，并读取 `EXTENDS_MODULES` 与可选 `modules/` 扫描/开关。当前工作区的跟踪文件中有 26 个 `extends/blog` 文件，没有 `modules/**` 文件。因此：

- 可审计的业务扩展示例是 Blog layer。
- README 提及的 nav/doc 模块在另一个独立仓库/目录，当前不可审计。
- 当前没有从源码找到标准 manifest、模块依赖图求解、安装/启停/卸载生命周期及统一迁移注册表。

相关证据：[`nuxt.config.ts`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/nuxt.config.ts#L17-L40)、[`blog plugin`](file:///Users/oldmoon/Documents/github/Nuxt-Admin-SIS/extends/blog/server/plugins/blog.ts#L33-L76)。

## 4. 目标 SIS 与 Agent 边界（尚未实现）

升级附件要求 SIS 是业务模块，Agent 是可复用能力模块，两者通过稳定 API/Tool Registry 组合；它们都依赖 Core，而不能直接依赖彼此内部实现。当前代码中没有 `modules/sis`、`modules/ai-agent` 的检出源码，也没有 Tool Registry、UI Component Registry 或统一 Module SDK；因此下图是目标依赖方向，不代表现状：

```text
                 Nuxt-Admin Core（待明确/抽离稳定接口）
                    /                       \
             SIS Module                  AI Agent Module
       学校领域服务/API/UI             Runtime/Tools/UI Registry
                    \                       /
                   Core API / 权限 / 工具契约
```

依赖规则建议据附件保持：SIS 调 Core 的用户、权限、文件、通知、审计服务；Agent 只调用经注册且独立鉴权的业务工具；SIS 可在没有 Agent 时工作，Agent 可在没有 SIS 时启动。

## 5. 当前高耦合/风险边界

1. Blog 插件直接引用宿主内部文件路径中的数据库、用户 schema 与 Dashboard 注册器，扩展接口不是独立包级 API。
2. 宿主迁移与 Blog 自有 DDL 两套机制，没有可见的统一版本/顺序契约。
3. 共享 PostgreSQL 不代表已有租户/组织隔离；主 schema 中未见通用 tenant/organization membership 模型。
4. WebSocket 在线连接和私信限流状态放在进程内 Map，多实例部署无法共享状态。
5. 通用 CRUD 表自动发现与 API 注册需要明确区分；schema 可发现性不可当作业务模块许可。
