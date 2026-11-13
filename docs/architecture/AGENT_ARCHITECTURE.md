# Agent 架构（Agent Architecture）

> 状态：**Partial**。Model Gateway、工具管道、审批、执行记录已实现；Anthropic 原生适配器、保留清理、Agent 模块抽取为 **Planned**。

## 1. 组成

```text
/api/llm/chat
  └─ ModelGateway（provider 适配 / 超时 / 重试 / 回退 / 成本）
      └─ runAgentLoop（多轮工具调用 / 确认 / 上限）
          ├─ ToolRegistry.run（权限 / 限流 / 超时 / 取消 / 输出上限）
          ├─ agentStore（executions / tool_calls / approvals / artifacts）
          └─ agentApproval（状态机 / 参数哈希绑定）
```

- 代码位置：`server/core/modelGateway.ts`、`server/core/agent.ts`、`server/core/moduleSdk.ts`（ToolRegistry）、`server/core/agentApproval.ts`、`server/utils/agentStore.ts`、`server/api/llm/chat.post.ts`。
- 配置：LLM API Key / Base URL / Model 由服务端环境变量或 `configs` 提供，**永不返回浏览器**。

## 2. Model Gateway

`ModelGateway`（`server/core/modelGateway.ts`）：

| 能力 | 行为 |
|---|---|
| Provider 适配 | `ModelProvider.chat()`；内置 `createOpenAiCompatibleProvider()`，支持任何 OpenAI-compatible 网关 |
| 规范化 | 统一 `content` / `toolCalls` / `usage` / `model` / `provider` |
| 超时 | 每次尝试 `timeoutMs`；支持 `AbortSignal` |
| 重试 | 每个 provider `retries` 次（默认 1） |
| 回退 | 重试耗尽后尝试下一个 provider（默认开启） |
| 成本 | 按 `pricing`（`model` 或 `provider:model`）与 usage 估算 `costUsd` |
| 校验 | provider 列表非空、ID 唯一 |

未实现：Anthropic 原生协议适配器（可通过 OpenAI-compatible 代理使用）。

## 3. Tool Registry

`ToolRegistration` 关键字段（`server/core/moduleSdk.ts`）：

```ts
{
  id, schema, execute, authorize,
  operation: 'query' | 'command',
  permission,                 // Agent 权限网关复检
  approval: 'none' | 'confirm' | 'second-person',
  riskLevel: 'low' | 'medium' | 'high',
  requiresApproval,
  timeoutMs,
  outputLimitBytes,           // 默认 1 MiB
  rateLimit: { max, windowMs }
}
```

`ToolRegistry.run` 顺序：

```text
查找工具 → schema 校验 → 权限复检 → AbortSignal 取消检查
  → 限流（进程内，按 tool + caller）
  → 执行（带超时）
  → 序列化结果并检查 outputLimitBytes
```

- 中/高风险 command 默认需要人工审批。
- 未知工具、参数错误、权限拒绝、限流、超时都会转成工具错误消息返回模型，并写审计。

## 4. Agent Loop

`runAgentLoop`（`server/core/agent.ts`）：

- 默认 `maxRounds = 4`，`maxToolCalls = 8`。
- 模型返回 tool calls 后：
  - 需要确认且未决策的调用 → 返回 `pending_confirmation`，不执行。
  - 已拒绝的调用 → 返回拒绝消息并审计。
  - 其余调用逐个执行。
- 累计 usage 与 cost，最终返回 `completed` / `pending_confirmation` / `failed`。
- `extractUiDirective` 解析模型输出中的 UI 指令，并用 `UiRegistry` 校验组件 ID/版本。

## 5. 审批

`server/core/agentApproval.ts`：

```
pending → approved
pending → rejected
pending → expired
```

- `approvalArgumentsHash(calls)` 对调用批次做稳定哈希。
- `approvalBindingMatches()` 校验审批与当前执行/参数一致；浏览器不能复用旧审批。
- 审批记录持久化在 `agent_approvals`，由 `/api/llm/chat` 读取并恢复执行。
- 过期审批由 `expireStaleApprovals()` 处理。

## 6. 持久化

迁移 `0013_orange_gorgon.sql`：

| 表 | 内容 |
|---|---|
| `agent_executions` | 一次对话执行：actor、状态、模型、usage、cost、错误、时间 |
| `agent_tool_calls` | 每次工具调用：execution_id、tool、参数、结果/错误、耗时、风险 |
| `agent_approvals` | 审批批次：execution_id、状态、参数哈希、决策人、过期时间 |
| `agent_artifacts` | 产物元数据：execution_id、类型、路径/URI、大小 |

`server/utils/agentStore.ts` 提供：

- `startAgentExecution` / `finishAgentExecution` / `findAgentExecution`
- `recordAgentToolCall`
- `createAgentApproval` / `findAgentApproval` / `listAgentApprovals` / `decideAgentApproval` / `markAgentApprovalStatus` / `expireStaleApprovals`
- `attachAgentArtifact` / `listAgentArtifacts`

Artifact 服务已存在，但**尚无内置文件生成工具**（Planned）。

## 7. API 与 UI

| 入口 | 说明 |
|---|---|
| `POST /api/llm/chat` | 服务端工具循环；注入持久化执行与审批 |
| `/api/llm/ws` | 流式输出；**不走**服务端工具管道（前端 LLM 聊天可回退到 HTTP） |
| `app/composables/useLlmChat.ts` | 优先 WS，失败回退 HTTP |
| UI Registry | 服务端保存描述符；`extractUiDirective` 校验后渲染 |

## 8. 安全边界

- 模型永远拿不到平台 API Key、数据库连接或未授权工具。
- 工具权限在**每次调用**时复检，而不是只在注册时。
- 高风险操作必须人工审批；审批与参数哈希绑定。
- 输出有字节上限，防止超大结果拖垮进程/前端。
- 所有工具调用与审批决策写审计。
- Prompt injection 不能直接提权：模型只能调用已注册且当前 actor 有权限的工具。

## 9. 已知限制

| 项 | 状态 | 说明 |
|---|---|---|
| Anthropic 原生适配器 | Planned | 可用 OpenAI-compatible 网关替代 |
| Agent 抽取为 `modules/agent` | Planned | 当前仍在 Core |
| 执行记录保留/清理策略 | Planned | 表会持续增长，尚无定时清理 |
| WS 路径工具调用 | Planned | 仅 HTTP chat 走工具管道 |
| 文件生成工具 | Planned | Artifact 服务已就绪 |
| 多实例工具限流 | Partial | 当前限流为进程内 |

## 10. Capability Chat（SMS 工作台）

在工具管道之上增加一层 **Capability** 契约，让 Chat / Apps / Agents 共用同一份业务能力定义。

| 运行时组件 | 实现位置 |
|---|---|
| Capability Registry | `server/core/capability.ts`（能力目录 + `describeCapabilities`） |
| Permission Resolver | `capabilityPermissionMatches` + `ToolRegistry.authorize`（每次执行复检） |
| Tool Executor | `ToolRegistry.run`（schema/限流/超时/输出上限） |
| Draft Manager | `server/utils/agentDraftService.ts` + `agentStore` 的 draft 函数 |
| Approval Manager | `server/core/agentApproval.ts` + `agentStore` 的 approval 函数 + `/api/agent/approvals` |
| Conversation Manager | `agentStore` 的 conversation/message 函数 + `/api/agent/conversations` |
| Audit Logger | `server/core/audit.ts` + `createAgentAudit`（`agent_tool_calls` + `audit_logs`） |

| 文件 | 作用 |
|---|---|
| `server/core/capability.ts` | `CapabilityDefinition`（Tool + `title`/`resource`/`form`/`preview`/`summarize`）、能力目录、权限过滤、模块聊天提示词注册 |
| `server/core/conversation.ts` | 会话/消息/草稿类型、草稿状态机、聊天 UI 描述与响应 DTO |
| `server/utils/agentChatRuntime.ts` | 权限过滤工具集、模型适配、`pending_confirmation → form/approval` 物化、消息落库 |
| `server/utils/agentDraftService.ts` | 草稿提交：重校验权限/预览 → 原子领取草稿 → 调用 `ToolRegistry.run` → 审计 |
| `server/api/agent/*` | `chat`、`conversations`、`approvals/:batchId`、`drafts/:id/submit` |
| `server/database/migrations/0014_agent_conversations.sql` | `agent_conversations` / `agent_messages` / `agent_drafts` |
| `server/database/migrations/0015_agent_draft_expiry.sql` | `agent_drafts.expires_at` + 索引（草稿 TTL） |
| `app/components/chat/ChatFormCard.vue` | Schema 驱动的通用表单卡（客户端不能自造字段） |
| `app/components/chat/ChatMarkdown.vue` + `app/utils/markdown.ts` | 助手消息 Markdown 渲染（`html:false` 转义原始 HTML，链接 `noopener`） |
| `CapabilityDefinition.resultView` | 只读能力的固定结果表格列定义；服务端投影，模型无法生成列 |
| `server/core/componentBlock.ts` | ` ```component ` 块解析：仅接受已注册 ID/版本，props 过 `UiRegistry` schema |
| `app/components/chat/ChatComponentBlock.vue` | 按注册表 ID 渲染模块组件；模块通过 props 传入 id → 组件映射 |
| `modules/sms/app/components/sms/StudentTable.vue` | `sms.student-table`：模型只传 `query`/`limit`，数据由 API 按权限加载 |

流程：

```text
POST /api/agent/chat
  → 权限过滤 capability → runAgentLoop
  → 只读 capability 直接执行并返回结果卡
  → 写 capability（有 form）→ preview + 创建 draft → pending_form
  → 高风险 command（无 form）→ agent_approvals + suspend → pending_confirmation

POST /api/agent/drafts/:id/submit
  → 复核 capability 可见性 + schema + preview（跨组织校验）
  → draft: draft → submitted（原子，保证幂等）
  → ToolRegistry.run（再次鉴权/限流/超时/输出上限）
  → 业务 service 写库 + audit_logs，返回结果卡
```

安全边界：

- 模型只能看到当前 actor 有权限的 capability；`organizationId` / `tenantId` / `roleName` 由服务端注入。
- 写入从不在 chat 请求内直接执行；必须经过表单提交或审批恢复。
- 草稿只能提交一次；执行失败会恢复为 `draft` 以便重试。
- 审批恢复时重新走 `ToolRegistry.run`，角色/组织变化会使旧审批失效。
- 草稿 TTL 为 30 分钟（`AGENT_DRAFT_TTL_MS`）；过期提交返回 `410` 并关闭草稿。
- `/api/agent/chat`、草稿提交、审批、文件上传均有用户级限流（进程内，多实例需共享存储）。
- 模型网关对超时、429、5xx 与部分 MaaS `400001` 做有限重试（`LLM_RETRIES`，默认 7），真实参数错误立即失败。

## 11. 组件块协议（```component）

助手消息的渲染顺序是：Markdown 正文 → 工具调用卡（含固定 `resultView` 表格）→ 一个可选的组件块。

模型可以在回复末尾输出一个围栏块：

````text
```component
{"component": "sms.student-table", "props": {"query": "张三"}}
```
````

服务端处理（`server/core/componentBlock.ts` + `agentChatRuntime`）：

1. 解析最后一个 `component` 块，并从正文中剥离**所有** `component` 块（块不会作为原始文本展示）。
2. `component` 必须是 `UiRegistry` 中已注册、且随模块启用的 ID；版本不一致直接拒绝。
3. `props` 必须通过注册时的 schema。SMS 的 `sms.student-table` 只接受 `query`（字符串）与 `limit`（1–200 的整数），显式拒绝 `rows`/`students` 等数据字段。
4. 校验失败时丢弃该块（保留正文），绝不回显任意组件名/JSON。
5. 通过后落库为消息 `ui: { kind: 'component', component, version?, props }`。

客户端（`ChatComponentBlock.vue`）只从**构建期固定映射**取组件，不做按名字的动态 import；模块在自己的渲染层传入 `id → 组件` 映射（SMS：`MessageList.vue` → `StudentTable.vue`）。未注册/模块已禁用时显示 fail-closed 提示。

安全边界：

- 组件 ID 是闭集，模型不能凭空创建组件或标签。
- 模型只能传交互参数（查询词、分页），不能传业务行；组件自己按当前用户权限调用模块 API 取数。
- 组件的写操作仍必须走既有的表单草稿/审批链路，组件块本身不具备写权限。
- 这与 `resultView` 互补：`resultView` 固定“查询结果长什么样”，组件块固定“用户可以接着操作什么”。
