# 安全审计报告（2026-11）

> 范围：`Nuxt-Admin` 主仓库 + `modules/sms` 模块（本地挂载）。
> 方法：静态审计（认证、授权、Agent、文件、限流、迁移）+ 依赖审计 + 真实数据库集成测试。
> 结论：**核心边界成立**（服务端权限、组织隔离、审批哈希绑定）；本次修复了 5 处可验证风险，并补充了自动化安全测试。依赖层仍有需跟进的 transitive 漏洞。

## 1. 风险摘要

| ID | 风险 | 等级 | 状态 |
|---|---|---|---|
| S1 | 生产环境种子数据包含固定管理员 `admin@example.com / Admin@123` 与 30 个固定密码测试账号 | 高 | 已修复 |
| S2 | 上传文件预览允许 `text/html`、`image/svg+xml`、JS/XML 内联返回，可造成同源存储型 XSS | 高 | 已修复 |
| S3 | Agent 草稿无过期时间，旧确认表单可被无限期重放 | 中 | 已修复 |
| S4 | `/api/agent/chat`、草稿提交、审批、文件上传缺少用户级限流 | 中 | 已修复 |
| S5 | 仅依赖 `SameSite=Lax`，缺少显式 Origin 校验 | 低 | 已修复（纵深防御） |
| S6 | 缺少针对注入、跨组织、跨角色、审批重放、过期草稿的自动化测试 | 中 | 已补充 |
| S7 | 生产依赖存在 6 critical / 67 high 的传递漏洞 | 中 | 部分缓解 / 待上游 |
| S8 | 模块直接 `import server/database`，未完全经由 SDK 隔离 | 低 | 记录为技术债 |

## 2. 已修复项

### S1 生产默认凭据

- 证据：`server/database/seed.ts`（原 L386-L410）在任意环境创建固定管理员与 30 个 `Test@123` 账号。
- 修复：生产环境（`NODE_ENV=production`）仅在提供 `SEED_ADMIN_PASSWORD` 时创建管理员；演示账号只在开发环境创建。缺失配置时打印明确警告。
- 配置：`.env.example` 新增 `SEED_ADMIN_EMAIL` / `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`。
- 注意：已有数据库不受影响；新生产部署必须显式提供密码。

### S2 上传文件内联执行

- 证据：`server/utils/fileStorage.ts` `isPreviewable()` 原先把 `text/`、`image/svg+xml`、`application/javascript` 等视为可内联；`/api/files/serve/**` 直接以该 MIME 返回。
- 修复：仅允许安全的图片/音视频/PDF/`text/plain` 内联；其余强制 `attachment`。文件响应新增 `X-Content-Type-Options: nosniff`、`Content-Security-Policy: sandbox; default-src 'none'`、`Cross-Origin-Resource-Policy: same-origin`。
- 测试：`test/unit/server/fileStorage.test.ts` 增加 SVG/HTML/JS/XML/JSON 必须不可预览的用例。

### S3 草稿过期与重放

- 证据：`agent_drafts` 无过期字段；`submitAgentDraft` 只校验状态与幂等。
- 修复：迁移 `0015_agent_draft_expiry.sql` 增加 `expires_at` + 索引；新草稿 TTL 30 分钟（`AGENT_DRAFT_TTL_MS`）；提交时过期返回 `410` 并把草稿置为 `cancelled`；原子领取同时检查未过期。
- 测试：`modules/sms/test/chat-flow.test.ts` 覆盖过期拒绝与状态关闭。

### S4 限流

- 证据：原有限流只在登录/注册/找回密码。
- 修复：
  - `/api/agent/chat`：30 次/分钟/用户
  - `/api/agent/drafts/:id/submit`：20 次/分钟/用户
  - `/api/agent/approvals/:batchId`：20 次/分钟/用户
  - `/api/files/upload`：30 次/分钟/用户
- 说明：当前限流为进程内，多实例部署需改用共享存储（已记录为技术债）。

### S5 Origin 校验

- 新增 `server/middleware/csrf.ts` + `server/utils/originPolicy.ts`：对非 GET/HEAD/OPTIONS 请求，若携带 `Origin` 则必须与请求 Host 或 `NUXT_PUBLIC_SITE_URL` 同源，否则 403；无 `Origin` 的 CLI/回调请求放行。
- 测试：`test/unit/server/originPolicy.test.ts`。

### S6 安全测试

| 用例 | 位置 |
|---|---|
| 跨组织班级 ID 被拒绝且草稿可重试 | `modules/sms/test/chat-flow.test.ts` |
| 草稿 payload 伪造 `organizationId/tenantId/roleName` 被忽略 | 同上 |
| 只读角色提交写能力 → 403 | 同上 |
| 重复提交同一草稿 → 409 | 同上 |
| 过期草稿 → 410 且关闭 | 同上 |
| 审批重复决策 → 409；参数篡改 → 409（哈希失配） | 同上 |
| 文件活动内容不可内联 | `test/unit/server/fileStorage.test.ts` |
| Origin 白名单 | `test/unit/server/originPolicy.test.ts` |
| 工具调用瞬时 400001 重试 / 非瞬时错误不重试 | `test/unit/server/core/modelGateway.test.ts` |

## 3. 已确认的安全基线

- 会话 Cookie：`httpOnly` + `sameSite=lax` + HTTPS 时 `secure`（`server/utils/session.ts`）。
- 登录：scrypt 哈希、固定 dummy hash 防时序枚举、5 次/15 分钟锁定、IP+标识限流。
- RBAC：`requireUser` / `requireDashboardAccess` 每次请求解析角色、组织、权限；敏感表 admin-only。
- 组织隔离：组织/租户由服务端上下文注入，模型与浏览器无法指定。
- Agent：能力按权限过滤；写操作必须表单/审批；执行走 `ToolRegistry`（schema、鉴权、限流、超时、输出上限）；审批与参数哈希绑定。
- 数据访问：无通用 SQL/HTTP 工具；业务写入只经模块 service。

## 4. 依赖审计

命令（生产依赖）：

```bash
pnpm audit --prod --registry=https://registry.npmjs.org --audit-level=high
```

结果：`6 critical / 67 high / 63 moderate / 30 low`，绝大多数为 Nuxt/Nitro/CLI 工具链的传递依赖：

- `node-forge <=1.4.0`（high）：经 `nuxt > @nuxt/cli > listhen`
- `tar`、`shell-quote`、`brace-expansion`、`nanoid`、`js-yaml`（critical/high）：构建与工具链传递依赖
- 直接依赖建议升级：`sharp >=0.35.4`、`nodemailer >=9.1.0`、`@tiptap/core >=3.30.5`、`@tiptap/markdown >=3.30.5`
- `xlsx`：npm 上无 patched 版本（SheetJS 建议官方 CDN 版本），当前通过 KaTeX/上传导入路径使用；建议限制导入文件大小并仅在服务端解析

CI 已增加 report-only 依赖审计步骤；修复上游传递依赖前不阻塞合并。

## 5. 剩余风险与技术债

1. 限流为进程内实现，多实例需外部存储（Redis/Postgres）。
2. 模块仍可直接 `import server/database`；SDK 未提供隔离的数据库访问契约。
3. `ModuleMigration.down` 仅作为契约声明，尚无自动回滚执行器。
4. 全仓 ESLint/TypeScript 仍有历史债务（本次对平台核心与 SMS 模块启用阻塞式 lint）。
5. 文件仍与主站同源提供；高安全场景建议独立文件域名。
6. LLM 网关（腾讯 MaaS）工具调用偶发 `400001`，已通过重试缓解，仍依赖上游稳定性。
