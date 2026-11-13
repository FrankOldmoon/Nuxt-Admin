# SMS 聊天平台实施方案

> 目标：把 SMS 首页做成 ChatGPT 式工作台（Chat / Apps / Agents），聊天可完成基于权限的数据增删改查；复杂业务在聊天中渲染表单；Apps 保留传统表格/表单。
>
> 当前代码基础：`server/core/agent.ts`、`ToolRegistry`、`agentApprovals`、`agentStore`、`crudService`、`server/sdk`、`ChatUiBlock`。SMS 目前只有 `/sms` 简单列表页和一个只读工具 `sms.students.search`。

## 1. 核心设计原则

1. **Capability-first**：先定义业务能力，Chat / Apps / Agents 共用同一份能力定义。
2. **Chat 只编排，不直接访问数据库**：所有读写走服务端 Capability。
3. **服务端是权限唯一来源**：组织、角色、数据范围、字段策略、审批都由服务端判断。
4. **写入必须可预览、可确认、可审计**；高风险/批量操作二次确认。
5. **表单由服务端 Schema 驱动**：模型只填草稿，不能生成任意字段或绕过校验。
6. **不要在客户端执行业务写操作**：现有客户端 ` ```tool ` 协议继续只用于文件处理。
7. **统一协议**：SMS 聊天走服务端工具循环，不再让 WS 聊天直接做业务。

## 2. 复用与新增

### 2.1 复用

| 现有能力 | 用途 |
|---|---|
| `ToolRegistry` | Capability 执行、权限复检、限流、超时、输出上限 |
| `runAgentLoop` | 多轮工具调用、确认、用量统计 |
| `agentApprovals` / `agentStore` | 审批、执行记录、工具调用记录 |
| `crudService` | 通用表读写、数据范围、字段策略、审计 |
| `ChatUiBlock` / `useChatUi` | 聊天内渲染已注册 UI 卡 |
| `server/sdk` | 模块注册 Capability 的唯一契约入口 |

### 2.2 新增 Core（主仓库）

| 文件 | 内容 |
|---|---|
| `server/core/capability.ts` | `CapabilityDefinition`：在 `ToolRegistration` 上增加 `form`、`preview`、`resource`、`summarize`、`idempotencyKey` |
| `server/utils/dashboard/capabilityFactory.ts` | 从 `TableMeta` 生成通用 CRUD Capability（list/get/create/update/delete） |
| `server/core/conversation.ts` | 会话/消息/草稿类型与状态机 |
| `server/utils/agentStore.ts` | 增加 conversation/message/draft 读写 |
| `server/api/agent/conversations/*` | 会话列表、详情 |
| `server/api/agent/chat.post.ts` | 服务端聊天入口（工具循环 + 审批 + 草稿） |
| `server/api/agent/approvals/[batchId].post.ts` | 审批/拒绝 |
| `server/api/agent/drafts/[id]/submit.post.ts` | 提交聊天内表单草稿 |
| `server/database/migrations/0014_agent_conversations.sql` | 会话、消息、草稿表 |
| `app/components/chat/ChatFormCard.vue` | 通用 Schema 驱动表单卡 |
| `server/sdk/index.ts` | 导出 Capability 类型与注册辅助 |

### 2.3 新增 SMS（Nuxt-Extend-SMS 仓库）

| 文件 | 内容 |
|---|---|
| `app/layouts/sms.vue` | 左侧 Chat / Apps / Agents 导航 |
| `app/pages/sms/index.vue` | 重定向到 `/sms/chat` |
| `app/pages/sms/chat/index.vue`、`[id].vue` | 聊天页与会话页 |
| `app/pages/sms/apps/index.vue` | 应用入口，链接到传统 CRUD 表单 |
| `app/pages/sms/agents/index.vue` | Agent 模板列表 |
| `app/components/sms/chat/*` | 会话列表、消息、工具调用卡、审批卡、表单卡、上下文面板 |
| `app/composables/useSmsChat.ts` | 调用 `/api/agent/chat`、审批、草稿提交 |
| `server/capabilities.ts` | 注册 SMS 读写 Capability |
| `server/chatPrompt.ts` | 角色上下文、工具使用规则、表单策略 |
| `register.ts` | 调用 `registerSmsCapabilities(context.tools)` |

## 3. Capability 契约

```ts
interface CapabilityDefinition extends ToolRegistration {
  id: string                  // sms.students.create
  title: string
  description: string
  permission: string          // sms.students.create
  operation: 'query' | 'command'
  riskLevel: 'low' | 'medium' | 'high'
  requiresApproval?: boolean
  inputSchema: unknown        // JSON Schema
  form?: FormDescriptor       // 聊天内表单
  preview?: (input, ctx) => Promise<PreviewResult>
  execute: (input, ctx) => Promise<unknown>
  summarize?: (result) => string
}
```

`FormDescriptor`：

```ts
{
  fields: Array<{
    key, label, type, required, options?, readonly?,
    help?, validation?: { min?, max?, pattern?, message? }
  }>,
  submitLabel, cancelLabel,
  layout: 'single-column' | 'two-column'
}
```

### 3.1 写入流程

```text
模型选择 capability
  → 服务端校验权限/数据范围
  → preview 返回变更摘要/影响范围
  → 返回 pending_confirmation + form + draft
  → 用户修改并确认
  → 服务端重新校验
  → execute（复用 crudService / 模块 service）
  → 审计 + 返回结果卡
```

### 3.2 禁止项

- 禁止 `execute_sql`、`call_any_api`、通用 HTTP 工具。
- 禁止模型传 `organizationId` / `tenantId` / `roleName`。
- 禁止客户端直接提交业务写操作。
- 禁止模型生成未注册字段或任意 UI 组件。

## 4. 数据模型（migration 0014）

```text
agent_conversations
  id, user_id, organization_id, tenant_id, title, status,
  created_at, updated_at

agent_messages
  id, conversation_id, role, content,
  tool_calls jsonb, ui jsonb, execution_id,
  created_at

agent_drafts
  id, conversation_id, capability_id, payload jsonb,
  status: draft | submitted | cancelled,
  execution_id, created_at, updated_at
```

原则：

- 消息只存对话内容与 UI 描述，不存敏感凭据。
- 执行明细继续写 `agent_executions` / `agent_tool_calls`。
- 草稿可恢复；提交后不可重复执行（幂等键）。

## 5. API 契约

### 5.1 聊天

```http
POST /api/agent/chat
{
  "conversationId": 123,
  "message": "把张三加到七年级 A 班",
  "confirmations": { "approved": ["call_1"], "rejected": [] },
  "draftId": 45
}
```

返回：

```json
{
  "conversationId": 123,
  "status": "completed | pending_confirmation | pending_form | failed",
  "message": { "role": "assistant", "content": "..." },
  "toolCalls": [],
  "pendingApproval": { "batchId": "...", "calls": [] },
  "ui": { "kind": "form", "capabilityId": "sms.enrollments.create", "draftId": 45, "schema": {} }
}
```

### 5.2 会话与审批

- `GET /api/agent/conversations`
- `GET /api/agent/conversations/:id`
- `POST /api/agent/approvals/:batchId` `{ decision: 'approve' | 'reject' }`
- `POST /api/agent/drafts/:id/submit` `{ payload }`

所有接口都经 `requireUser` / `getAuthContext`，组织由服务端解析。

## 6. SMS Capability 清单

### 6.1 只读

- `sms.students.search`
- `sms.students.get`
- `sms.classes.list`
- `sms.teachers.list`
- `sms.enrollments.list`
- `sms.guardians.list`

### 6.2 写入

- `sms.students.create`
- `sms.students.update`
- `sms.students.delete`（软删除，高风险）
- `sms.enrollments.create`
- `sms.enrollments.withdraw`
- `sms.teachers.assign`
- `sms.guardians.link`

每个写入 Capability 必须：

- 声明 `permission`、`riskLevel`、`requiresApproval`；
- 提供 `preview`（影响对象、字段 diff、跨组织检查）；
- 调用现有 SMS service，不直接拼 SQL；
- 写 `audit_logs`（module_id=sms）。

## 7. 前端结构

```text
/sms
 ├─ 左侧栏：Chat / Apps / Agents
 │    └─ Chat 下会话列表（新建、重命名、删除）
 ├─ 主区：
 │    ├─ 消息列表
 │    ├─ 工具调用卡（只读结果、可折叠参数）
 │    ├─ 审批卡（Approve / Reject）
 │    ├─ 表单卡（Schema 驱动，提交/取消）
 │    └─ Composer（文本、附件、发送）
 └─ 右侧上下文面板（当前学生/班级/选课草稿）
```

交互规则：

- 读取类工具自动执行；
- 写入类先显示预览/表单；
- 批量删除显示影响条数；
- 失败时保留草稿，可重试；
- 不把原始 tool JSON 直接展示给用户。

## 8. 分阶段实施

### Phase 1：只读聊天 + Apps

- 新增会话/消息表与 API。
- 实现 SMS Chat Shell 与 Apps 入口。
- 注册 6 个只读 Capability。
- 传统表单仍走 `/dashboard/<table>`。
- 验收：管理员/教师/学生按权限看到不同数据；无写操作。

### Phase 2：单条写入 + 审批

- 实现 `preview`、表单卡、草稿提交。
- 先做 `sms.students.create/update`。
- 接入审批、审计、幂等。
- 验收：聊天创建学生 → 预览 → 确认 → 落库 + 审计；教师越权被拒绝。

### Phase 3：复杂业务表单

- `sms.enrollments.create/withdraw`、`teachers.assign`、`guardians.link`。
- 聊天内表单支持字段校验、跨字段校验、跨组织校验。
- 批量操作显示影响范围。
- 验收：一句话创建选课；跨组织班级被拒绝；退课保留历史。

### Phase 4：Agents

- Agent 模板：新生入学、班级学生查询、教师任课查询。
- 每个模板限定工具集与审批策略。
- 会话可保存、重命名、继续。
- 验收：模板可重复执行，失败可恢复。

### Phase 5：硬化

- Prompt injection 测试（业务数据不得变成指令）。
- 审批重放/参数篡改测试。
- 工具 Schema 体积与 token 预算优化。
- 执行记录保留策略、监控指标。

## 9. 测试矩阵

| 层级 | 用例 |
|---|---|
| 单元 | Capability Schema、权限、preview、草稿状态机 |
| 集成（真实 PG） | 跨组织拒绝、审批绑定、幂等提交、审计 |
| e2e | 登录 → 聊天查询 → 创建学生 → 确认表单 → 数据出现 |
| 安全 | 模型传 orgId、篡改参数、重放审批、注入指令 |
| 性能 | 工具集裁剪、Schema token、并发会话 |

## 10. 完成标准

- 所有 SMS 写操作只能通过 Capability 执行。
- 聊天内表单由服务端 Schema 驱动，客户端不能自造字段。
- 每次写操作有权限校验、预览、确认/审批、审计。
- 聊天/Apps/Agents 复用同一套 Capability。
- 无直接 SQL/任意 API 工具。
- 主仓库与 SMS 仓库各自有测试与文档。

## 11. 仓库分工

| 仓库 | 改动 |
|---|---|
| `Nuxt-Admin` | Capability 契约、会话/草稿表、Agent API、通用表单卡、SDK、迁移、文档 |
| `Nuxt-Extend-SMS` | SMS Chat Shell、Apps/Agents 页面、SMS Capability、表单卡、测试、README |

建议先合并 Core 的只读会话/聊天 API，再合并 SMS 的 Chat Shell；写入能力按 Phase 2/3 分批提交，避免一次改动过大。
