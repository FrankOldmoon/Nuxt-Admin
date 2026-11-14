# SMS 智能化校园系统 16 项优化实施计划

## Context

`modules/sms` 已完成 P0/P1/P2 基础能力（通知中心、审批引擎、知识库、工作台、CSV 导入、日报、任务 Agent、教学域），但上一轮代码审查发现一批真实缺口：聊天提示词硬编码且已过期、教师可给非所授班级布置作业、工作台通知链接 404、定时考勤扫描不写通知、API 层无限流、日报逐行写入、知识库不可编辑/下架、导入逐行插入且无错误文件、审批收件箱不统一、通知无偏好/外发、教学域缺附件/评分标准/选课容量、移动端只有聊天入口、Agent 无事件日志/幂等/重试、评估集只有 12 条、审计不可查询、e2e 靠 skip。

本次在不破坏现有 76 能力/16 角色契约的前提下，按 P0→P1→P2 全部落地，保持最小可用、可测试、中文注释。**不提交、不推送**（用户未要求）。

## 现状关键事实

- 能力注册：`modules/sms/server/capabilities.ts`（76 个，44 写）；`modules/sms/register.ts` 注册 API/工具/UI；`modules/sms/module.ts` 清单需同步 permissions/database/api/tools。
- 迁移：`modules/sms/server/database/migrations.ts`，最新 `sms:018-teaching`；新迁移用 `sms:019-optimization`，DDL 必须 `IF NOT EXISTS`。
- 测试会断言能力 id 全列表、写能力数量（44）、能力总数（76）、16 角色矩阵、学生/家长写能力集合：`modules/sms/test/capabilities.test.ts`、`roles.test.ts`。
- 已有可复用：`approvals.ts`（SLA 升级）、`notifications.ts`（收件人解析/createNotifications）、`detectTimetableConflicts`、`imports.ts` 的 `parseCsv`、`reportDaily.aggregateAttendance`、`ToolRegistry` 的限流实现。
- 已确认缺陷：`chatPrompt.ts` 第 10 行“学生不能写”错误；`teaching.ts` 第 123 行仅 `assertClassInContext`；`workbench.ts` 第 87 行链接 `/sms/notifications`（实际页面为 `app/pages/notifications.vue` → `/notifications`）；`jobs.ts` 的 `runAttendanceAlertScan` 只写预警不写通知；`ModuleApiRouter.dispatch` 无限流。

## 实施步骤

### P0（5 项）

1. **聊天提示词动态化** — `modules/sms/server/chatPrompt.ts`
   - 引入 `smsCapabilities` + `canUseSms`，按 actor 过滤可用只读/写能力，按资源分组生成“可查/可写”清单；学生/家长提示改为可提交作业、选课、请假；补充知识库、通知、审批收件箱使用规则。提示词只列 id 与标题，不硬编码业务范围。

2. **教师布置作业校验班级** — `modules/sms/server/teaching.ts` 的 `createAssignment`
   - `assertClassInContext` 后，若非 `hasSchoolWide(actor)`，校验 `teachingClassIds(actor).includes(classId)`，否则 403。

3. **工作台通知链接** — `modules/sms/server/workbench.ts`
   - `/sms/notifications` → `/notifications`；审批/退款卡片统一指向新增 `/sms/approvals` 页面（见第 9 项）。

4. **定时考勤扫描写通知** — `modules/sms/server/jobs.ts`
   - `runAttendanceAlertScan` 在 `onConflictDoNothing().returning({id, organizationId, tenantId, studentId})` 后按学生聚合新增数，查 `smsStudents` 取姓名/班级，调用 `createNotifications`（复用 `studentNotificationRecipients`），并写一条 `sms_report_runs`（`kind='attendance_scan'`）记录扫描结果。
   - `server/tasks/sms/attendance-scan.ts` 返回值增加 `notified`。

5. **API 层限流与能力层一致** — `server/core/moduleSdk.ts`、`server/api/modules/[...path].ts`、`modules/sms/register.ts`
   - `ModuleApiDefinition` 增加可选 `rateLimit`；`ModuleApiRouter` 复用 `ToolRegistry` 同款桶算法（key=`apiId:userId`）。
   - 路由捕获 `Module API rate limit exceeded` → 429。
   - `registerSmsModule` 注册时给未声明的 API 补默认：读 120 次/分、写 30 次/分；在 `smsApis` 中为敏感写接口声明与能力一致的 `rateLimit`（如成绩发布 10/分、导入 5/分）。

### P1（7 项）

6. **日报批量 upsert + 工作台告警 SQL join** — `reportDaily.ts`、`workbench.ts`
   - 日报改为每 200 行一次 `insert(...).values(chunk).onConflictDoUpdate({ set: { present: sql`excluded.present`, ... } })`。
   - `openAlertCount` 改为 `smsAttendanceAlerts innerJoin smsStudents`，直接 `inArray(smsStudents.classId, classIds)`，不再先取学生 id 列表。

7. **知识库索引与编辑/下架** — `knowledge.ts`、`migrations.ts`、`schema.ts`、`capabilities.ts`、`register.ts`、`module.ts`
   - 迁移 `sms:019`：`CREATE EXTENSION IF NOT EXISTS pg_trgm`（异常吞掉），存在时对 title/content 建 GIN trgm 索引。
   - 新增 `updateKnowledgeArticle(actor, { id, title?, content?, tags?, audience?, status?, action? })`：`action='archive'` 时置 `status='archived'`；状态枚举扩展 `archived`。
   - 检索结果附 `citation`（`{id,title,updatedAt}`）并排除 archived（沿用 published 过滤即可）。
   - 新增能力 `sms.knowledge.update`（command，permission `sms.knowledge.create`），API `POST /api/modules/sms/knowledge/update`。

8. **CSV 导入批量化/幂等/错误文件/成绩导入** — `imports.ts`、`capabilities.ts`、`register.ts`、`module.ts`
   - 学生导入：先一次性查出 actor 可见班级集合，校验后单条 `insert(...).values(validRows).onConflictDoNothing()`（学生表已有 `(organization_id, student_no)` 唯一索引），返回 `imported/skipped`；`batchId = input.batchId || crypto.randomUUID()`，写审计 `student.import` 携带 batchId。
   - 结果新增 `errorsCsv`（`line,studentNo,name,message`）。
   - 新增 `importScoresCsv(actor, { csv, examId, dryRun })`：表头 `studentNo,score`，校验考试属于本人范围且为 draft，复用 `saveScore` 逐行保存并返回同一报告结构/errorsCsv。
   - 新增能力 `sms.scores.import`（command，permission `sms.scores.update`），API `POST /api/modules/sms/scores/import`。

9. **统一审批收件箱 + 转交/撤回/超时提醒** — `approvals.ts`、`capabilities.ts`、`register.ts`、`module.ts`
   - 新增 `listApprovalInbox(actor, { status?, limit? })`：合并 `smsApprovalTasks`（按 assignee/权限 + 数据范围）、待审批请假、待审批退费，输出统一字段 `{kind, id, title, subjectId, step, dueAt, overdue, link}`；无新能力，扩展 `sms.approvals.list` 的 execute/summarize。
   - 新增 API `GET /api/modules/sms/approvals`（复用能力权限）。
   - 撤回：`cancelPendingApprovalTasks` 已存在，在请假取消/退费驳回路径调用；转交：新增 `reassignApprovalTask(actor, { taskId, assigneeUserId })`（仅审批权限，写审计+通知），暴露 `POST /api/modules/sms/approvals/reassign`。
   - 超时提醒：`escalateOverdueApprovals` 增加通知（已有）并在工作台卡片返回 `overdue` 数量。
   - 新增轻量页面 `modules/sms/app/pages/sms/approvals.vue`，展示收件箱与转交按钮。

10. **通知偏好/免打扰/外发适配器** — `notifications.ts`、`schema.ts`、`migrations.ts`、`register.ts`、`module.ts`
    - 新表 `sms_notification_preferences (organization_id, user_id, category, muted, unique)`。
    - `createNotifications` 写入前用同一 tx 查前收件人的 muted 分类并过滤；默认全部开启。
    - `getNotificationPreferences` / `updateNotificationPreferences`（仅本人），API `GET/PUT /api/modules/sms/notifications/preferences`（不加能力，避免角色矩阵扩散）。
    - `dispatchExternalNotification`：仅当 `process.env.SMS_NOTIFICATION_WEBHOOK_URL` 存在时 `fetch` POST；邮件适配预留 `SMS_NOTIFICATION_EMAIL_MODE=log` 时 `console.info`，失败只记录审计，不影响主事务。

11. **教学域附件/rubric/选课容量** — `teaching.ts`、`schema.ts`、`migrations.ts`、`register.ts`、`module.ts`
    - 作业新增 `rubric`（jsonb，`{criteria:[{name,weight}]}`）；提交新增 `attachmentUrl`（仅 http(s) 或站内路径，长度 500）。
    - `smsSubjects` 增 `capacity`（integer, nullable）；`setCourseElection` 选课时若 `capacity` 有值，统计同组织/学期/科目 `selected` 人数，达到上限抛 409；drop 不受限。
    - 课表冲突已由 `detectTimetableConflicts` 覆盖，不重复实现。

12. **移动端原生表单 + PWA** — `modules/sms/app/pages/sms/mobile.vue`、`public/manifest.webmanifest`、`public/sw.js`、`modules/sms/app/plugins/pwa.client.ts`、`nuxt.config.ts`（如需要）
    - 移动端新增原生“请假申请”表单（学生/日期/类型/事由）与“通知列表/已读”区块，提交走 `/api/modules/sms/leave`、`/api/modules/sms/notifications/read`。
    - 新增 manifest（name/start_url `/sms/mobile`/display standalone/theme/icons 192+512）与极简 Service Worker（静态缓存 + 离线页），仅在 `mobile.vue` 注册，避免影响主站。

### P2（4 项）

13. **Agent 执行器增强** — `agentTasks.ts`、`schema.ts`、`migrations.ts`、`capabilities.ts`、`register.ts`、`module.ts`
    - 新表 `sms_agent_task_events (task_id, event, from_status, to_status, note, actor_user_id, created_at)`。
    - `smsAgentTasks` 增 `idempotencyKey` + `(organization_id, idempotency_key)` 唯一索引；`createAgentTask` 支持幂等键，重复返回既有任务。
    - 状态机增 `retry`（failed → pending）；`advanceAgentTask` 每次写入事件行；`cancel` 时把未完成子步骤标记取消（payload 中的 `steps` 置 `cancelled`）。
    - 新增 `listAgentTaskEvents(actor, { taskId })` + 能力 `sms.agent-tasks.events`（query，permission `sms.agent-tasks.read`），API `GET /api/modules/sms/agent-tasks/events`。

14. **评估集扩充 + 在线指标** — `evaluation.ts`、`schema.ts`、`migrations.ts`、`capabilities.ts`、`register.ts`、`module.ts`
    - golden set 扩到 30 条（覆盖审批、导入、知识库编辑、审计、Agent、移动端场景）。
    - 新表 `sms_evaluation_metrics (organization_id, metric, value, labels jsonb, recorded_at)`；`recordEvaluationMetric` / `listEvaluationMetrics`。
    - 新增能力 `sms.evaluation.metrics`（query，permission `sms.reports.read`），API `GET/POST /api/modules/sms/evaluation/metrics`。

15. **可观测性查询** — `server/sdk` 审计表、`modules/sms/server/observability.ts`、`capabilities.ts`、`register.ts`、`module.ts`
    - 新增 `queryAuditLogs(actor, { action?, resource?, from?, to?, limit? })`：仅 `sms.audit.read`（admin 默认），按组织过滤，只读。
    - 新增 `buildSmsMetrics(actor)`：通知投递数/未读数、审批 SLA 超期数、导入失败数（审计 action）、Agent 失败数，一次返回。
    - 新增能力 `sms.audit.query`（query，permission `sms.audit.read`），API `GET /api/modules/sms/audit`、`GET /api/modules/sms/metrics`。
    - `module.ts` permissions 增 `sms.audit.read`，并加入 `roles.ts` 的 `ALL_READ` 使校长可访问。

16. **Playwright 角色账号** — `test/browser/sms-roles.pw.ts`
    - 由 admin 登录后调用现有用户/角色 API 创建 `e2e.teacher/guardian/finance` 三个账号并绑定 SMS 角色；创建失败时 `test.skip` 仅在“无 admin 凭据”时保留。
    - 三个用例改为读取种子账号，删除无条件 skip。

## 测试与同步更新

- `modules/sms/test/capabilities.test.ts`：能力总数 76→81，写能力 44→46，id 列表新增 5 项（按字母序）。
- `modules/sms/test/roles.test.ts`：`16 * 76` → `16 * 81`；学生/家长写能力集合不变（新写能力权限均为 staff-only）。
- 新增/补充单测：`chatPrompt.test.ts`（学生提示包含 assignments.submit）、`imports.test.ts`（批量幂等/errorsCsv）、`knowledge.test.ts`（archive）、`teaching.test.ts`（非所授班级 403、容量 409）、`agentTasks.test.ts`（retry/幂等/事件）、`evaluation.test.ts`（30 条 + 指标）。
- `modules/sms/module.ts`：同步 `permissions`（`sms.audit.read`）、`database`、`api`、`tools`。
- `docs/architecture/SCHOOL_MANAGEMENT_PHASE0.md`：追加“16 项优化落地”章节（能力数、迁移 id、运维开关）。

## 验证

```bash
pnpm exec vitest run modules/sms/test
pnpm test
pnpm exec eslint --no-ignore modules/sms server/core/moduleSdk.ts 'server/api/modules/[...path].ts'
ENABLED_MODULES=example,sms pnpm exec nuxt typecheck   # 仅关注本次改动文件
pnpm build
```

数据库相关验证（若本地有 PG）：执行迁移 `sms:019-optimization` 后手工调用 `runAttendanceAlertScan`、`runDailyReport`、`importStudentsCsv(dryRun)`、`listApprovalInbox`，确认通知/日报/导入结果。e2e 需 admin 凭据，非必需。

## 约束

- 全部中文注释；不新增无关依赖；所有新表/列 DDL `IF NOT EXISTS`。
- 不改动无头浏览器依赖；不提交、不推送。
