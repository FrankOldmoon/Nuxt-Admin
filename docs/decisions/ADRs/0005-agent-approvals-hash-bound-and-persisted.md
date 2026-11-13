# ADR 0005 — Agent 审批持久化并绑定参数哈希

- Status: Accepted
- Date: 2026-06-30

## Context

高风险工具需要人工确认。早期确认状态保存在内存中，重启丢失，且审批可能被复用到不同参数/不同执行。

## Decision

- 审批批次持久化到 `agent_approvals`。
- 审批记录包含 execution ID、调用顺序、参数哈希（SHA-256）、状态、决策人、过期时间。
- 审批只能作用于同一执行批次与同一参数哈希（`approvalBindingMatches`）。
- 状态机：`pending → approved | rejected | expired`。
- `/api/llm/chat` 从数据库读取审批并恢复执行，不使用浏览器传来的“已批准”布尔值。
- 中/高风险 command 默认需要审批；工具权限在每次调用时复检。

## Consequences

正面：

- 重启/多实例下审批不丢失。
- 不能通过替换参数复用审批。
- 审批决策可审计。

负面：

- 审批会产生额外数据库写入。
- 过期审批需要清理任务（当前仅有 `expireStaleApprovals`，无定时调度）。

## 相关实现

- `server/core/agentApproval.ts`
- `server/utils/agentStore.ts`
- `server/api/llm/chat.post.ts`
- 迁移 `0013_orange_gorgon.sql`
