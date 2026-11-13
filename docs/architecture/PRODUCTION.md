# 生产部署与实时架构（Production Guide）

> 状态：**Implemented**（PostgreSQL 实时总线）；Redis 适配器、对象存储、全局限流为 **Planned**。
> 部署步骤与安全清单见 [../development/DEPLOYMENT.md](../development/DEPLOYMENT.md)。

对应 Architecture Upgrade Phase 6。本文档只描述**已实现**的能力与经过验证的配置路径；未实现的部分会明确标注。

## 1. 实时架构

### 1.1 组成

```text
浏览器 ── WebSocket ──> /api/ws (crossws)
                          │
                          ├── wsRegistry：本实例 userId → peers
                          │
                          └── RealtimeBus
                                ├── memory   （默认，单实例/开发）
                                └── postgres （LISTEN/NOTIFY，多实例）
```

- 本实例发送永远先走本地注册表，再通过总线广播给其他实例（`server/utils/realtime.ts`）。
- 事件类型：
  - `user`：定向用户（私信、定向通知、联系人 presence）。
  - `all`：全站广播（公共通知）。
  - `presence`：仅用于跨实例在线状态簿记，不会发送给浏览器。
- 在线状态：本地 peers + 其他实例的 presence 记录（`isUserOnlineAnywhere`）；联系人收到 `presence:update`。
- 连接清理：`close` / `error` 都会注销 peer；每 30 秒本地 `ping`，客户端可据此判断断线并重连。
- 限流：私信 60 条/分钟（进程内），登录 5 次/15 分钟（进程内）。

### 1.2 配置

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `REALTIME_DRIVER` | `memory` | `memory` 或 `postgres` |
| `REALTIME_CHANNEL` | `app_realtime` | PostgreSQL NOTIFY 频道（小写标识符） |

多实例必须使用 `REALTIME_DRIVER=postgres`，否则不同实例上的用户收不到彼此的私信/通知。

PostgreSQL 总线的约束：

- 单条消息 ≤ 7000 字节（NOTIFY 上限 8000），超限会抛错；事件只传 ID/小数据。
- 每个实例占用一个专用数据库连接用于 LISTEN。
- 不需要 Redis；如需 Redis，可按 `RealtimeBus` 接口实现新的适配器，不改业务代码。

## 2. 生产基础设施检查清单

### 2.1 PostgreSQL

- 通过 `DATABASE_URL` 配置；连接池由 `server/database/index.ts` 创建。
- 迁移：生产只允许运行一次发布迁移入口：

  ```bash
  pnpm db:migrate:release
  ```

  应用启动时生产环境**不会**自动迁移（`NODE_ENV=production`）。
- 模块迁移记录在 `__module_migrations`（含 checksum/状态/耗时），修改历史迁移会被拒绝。
- 备份：至少每日 `pg_dump`，并定期做恢复演练；大库建议 WAL 归档 + PITR。
- 多实例：所有实例共用同一个数据库；迁移只能由一个发布任务执行。

### 2.2 文件存储

- 默认本地磁盘；数据库 `files` 表记录路径、visibility、owner、组织/租户。
- `public` 文件可直接访问，`private` 文件需要登录/owner/管理员/同组织或签名 URL。
- 签名 URL 使用 `FILE_SIGNING_SECRET`（缺省回退 `NUXT_SESSION_PASSWORD`），TTL 默认 300 秒。
- 对象存储尚未内置适配器；接入时保持 `files.storage` 字段与 File Service 契约不变。
- 文件保留策略（过期/软删除清理）尚未实现，生产需外部定时任务或后续迭代。

### 2.3 环境变量

必需/常用：

```text
DATABASE_URL
NUXT_SESSION_PASSWORD
FILE_SIGNING_SECRET            # 可选，建议独立于 session secret
ENABLED_MODULES                # 例如 example（SIS/SMS 需先克隆外部模块）
LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
LLM_TIMEOUT_MS / LLM_RETRIES
LLM_PRICE_PROMPT_PER_1K / LLM_PRICE_COMPLETION_PER_1K
REALTIME_DRIVER / REALTIME_CHANNEL
BLOG_ENABLED
```

密钥只放服务端环境变量或 `configs` 表，不进入前端构建产物。

### 2.4 日志与监控

- 应用日志输出到 stdout（PM2/Docker 收集）；未内置结构化日志聚合。
- 健康检查：`GET /api/health`
  - 200：数据库可用。
  - 503：数据库不可用（`status: degraded`）。
  - 返回实时驱动类型与延迟，不包含敏感信息。
- 建议监控：HTTP 5xx、`/api/health` 状态、数据库连接数、慢查询、WebSocket 连接数、LLM 调用失败率与 token 成本。

### 2.5 限流

- 当前为进程内限流（登录、私信、工具调用）。多实例部署时每个实例独立计数，总配额按实例数放大。
- 若需要全局限流，应把计数放到共享存储（如 PostgreSQL/Redis），属于后续工作。

### 2.6 Docker

项目未内置 Dockerfile；推荐多阶段构建（示例）：

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile && pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV NODE_ENV=production NITRO_PORT=3000 NITRO_HOST=0.0.0.0
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

- 发布流程：先运行一次 `pnpm db:migrate:release`（独立任务/Job），再滚动启动实例。
- 健康检查指向 `/api/health`。

### 2.7 PM2

仓库提供 `ecosystem.config.cjs`（单实例 fork）。多实例示例：

```js
module.exports = {
  apps: [{
    name: 'nuxt_AI',
    script: 'node',
    args: '.output/server/index.mjs',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      NITRO_PORT: 3000,
      NITRO_HOST: '0.0.0.0',
      REALTIME_DRIVER: 'postgres'
    }
  }]
}
```

- 多实例必须设置 `REALTIME_DRIVER=postgres`。
- 反向代理需支持 WebSocket Upgrade；通知/私信由总线跨实例分发，不要求粘性会话。

## 3. 多实例验收步骤

1. 两个实例连接同一 PostgreSQL，均设置 `REALTIME_DRIVER=postgres`。
2. 实例 A 登录用户甲，实例 B 登录用户乙（互为联系人）。
3. 甲向乙发送私信：乙在实例 B 实时收到 `message:new`。
4. 甲上线/下线：乙在实例 B 收到 `presence:update`。
5. 管理员在实例 A 发布全站通知：实例 B 的在线用户收到 `notification:new`。
6. 关闭实例 A：实例 B 的 `/api/health` 保持 200；A 上的连接断开后客户端重连。

## 4. 已知限制

- 进程内限流、进程内 pending 状态不再用于审批（审批已持久化）。
- Redis 适配器未实现（接口已预留）。
- 文件保留/对象存储、结构化日志、全局限流、备份自动化未内置。
