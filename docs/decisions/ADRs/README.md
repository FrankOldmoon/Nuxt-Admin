# 架构决策记录（ADRs）

本目录记录影响架构边界、数据隔离、安全与运行方式的决策。

## 索引

| ADR | 决策 | 状态 |
|---|---|---|
| [0001](./0001-single-module-catalog-pipeline.md) | 模块发现使用单一 catalog 管线 | Accepted |
| [0002](./0002-runtime-module-state-vs-build-time-layers.md) | 运行期模块状态不动态卸载构建期 layer | Accepted |
| [0003](./0003-server-side-tenant-resolution.md) | 租户/组织上下文只由服务端成员关系解析 | Accepted |
| [0004](./0004-file-visibility-and-signed-urls.md) | 文件可见性 + HMAC 签名 URL | Accepted |
| [0005](./0005-agent-approvals-hash-bound-and-persisted.md) | Agent 审批持久化并绑定参数哈希 | Accepted |
| [0006](./0006-postgres-listen-notify-realtime.md) | 多实例实时使用 PostgreSQL LISTEN/NOTIFY | Accepted |

## 模板

```markdown
# ADR NNNN — 标题

- Status: Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- Date: YYYY-MM-DD
- Deciders: ...

## Context

问题、约束、相关实现。

## Decision

选择的方案与边界。

## Consequences

正面/负面影响、迁移成本、后续事项。
```

约定：

- 一个 ADR 只记录一个决策。
- 已接受的决策不直接改写结论；变更时新增 ADR 并标记 `Superseded`。
- 文档使用 **Implemented / Partial / Planned / Deprecated** 描述实现状态。
