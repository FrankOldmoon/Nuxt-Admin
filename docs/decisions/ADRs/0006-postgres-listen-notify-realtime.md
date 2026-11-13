# ADR 0006 — 多实例实时使用 PostgreSQL LISTEN/NOTIFY

- Status: Accepted
- Date: 2026-06-30

## Context

WebSocket 连接只在单个进程内可见。多实例部署时，私信、通知、presence 需要跨实例广播。引入 Redis 会增加部署与运维依赖。

## Decision

- 抽象 `RealtimeBus` 接口，提供：
  - `InMemoryRealtimeBus`（默认，单实例/开发）
  - `PostgresRealtimeBus`（LISTEN/NOTIFY，多实例）
- 本实例先服务本地 peers，再通过总线广播给其他实例。
- 事件类型：`user`（定向）、`all`（广播）、`presence`（仅跨实例在线簿记，不发给浏览器）。
- 单条消息限制在 NOTIFY 上限内（约 7KB），事件只传 ID/小数据。
- 多实例必须设置 `REALTIME_DRIVER=postgres`。

## Consequences

正面：

- 不新增基础设施，复用现有 PostgreSQL。
- 接口保留，未来可增加 Redis 适配器。

负面：

- 每个实例占用一个专用数据库连接用于 LISTEN。
- NOTIFY 有消息大小限制，不适合传大对象。
- 全局限流仍需网关层实现。

## 相关实现

- `server/core/realtimeBus.ts`
- `server/utils/realtime.ts`
- `server/utils/wsRegistry.ts`
- `docs/architecture/PRODUCTION.md`
