# SMS 数据模型审计

审计范围：`modules/sms/server/database/schema.ts` 与 `migrations.ts`（`sms:001`–`sms:020`）。

## 1. 软删除约定

| 类别 | 表 | 删除策略 |
|---|---|---|
| 主数据 | `sms_academic_years`、`sms_grades`、`sms_subjects`、`sms_teachers`、`sms_classes`、`sms_students`、`sms_teacher_assignments`、`sms_guardians` | `deleted_at` 软删除；查询统一带 `is null` |
| 事务/流水 | 考勤、请假、审批、考试、成绩、财务、资产、借阅、录取 | 不软删除；用 `status` 表达生命周期（如 `cancelled`/`rejected`），保留历史 |
| 引用/留存 | `sms_notifications`、`sms_agent_task_events`、`sms_evaluation_metrics`、`sms_report_runs` | 不逐行删除；由 `sms:retention` 按时间窗口批量清理 |
| 附件 | 核心 `files` 表 | `deleted_at` 软删除；SMS 只引用 file id，并校验 `organization_id` |

**为什么事务表不做 `deleted_at`：** 考勤/成绩/财务属于审计对象，物理保留行比“删除标记”更利于对账；撤销通过状态迁移和审计日志表达。

## 2. 唯一键与幂等

| 表 | 唯一键 | 用途 |
|---|---|---|
| `sms_students` | `(organization_id, student_no)` | 学号导入幂等 |
| `sms_classes` | `(organization_id, name)` | 班级重名保护 |
| `sms_attendance_records` | `(organization_id, student_id, attendance_date, session, COALESCE(period_no,0))` | 考勤 upsert |
| `sms_leave_requests` + `sms_approval_tasks` | 审批任务 `(org, subject_type, subject_id, step)` | 防重复审批步骤 |
| `sms_exam_scores` | `(organization_id, exam_id, student_id)` | 成绩 upsert |
| `sms_assignment_submissions` | `(organization_id, assignment_id, student_id)` | 提交幂等 |
| `sms_agent_tasks` | `(organization_id, idempotency_key)` | Agent 重试幂等 |
| `sms_notification_preferences` | `(organization_id, user_id, category)` | 静音偏好唯一 |

## 3. 索引覆盖

- **组织 + 时间**：通知、审计、评估指标、报表运行、导入批次均有 `(organization_id, created_at/recorded_at)` 类索引。
- **数据范围**：考勤、请假、成绩、审批任务按 `class_id`/`assignee_user_id`/`student_id` 建了复合索引，教师数据范围查询可走索引。
- **本轮补充**：
  - `sms_assignment_submissions (organization_id, student_id)`：学生“我的作业”列表。
  - `sms_background_jobs (organization_id, status)`：按组织排查排队任务。
- **可选扩展**：`pg_trgm` 仅在数据库允许 `CREATE EXTENSION` 时创建；否则知识库回退 `ILIKE`。

## 4. 已识别缺口（未在本轮改动）

1. `sms_leave_requests` 的 `attachment_file_id` 与 `files` 表没有外键约束；跨模块 schema 不便建 FK，已在提交路径校验组织归属。
2. `sms_knowledge_articles.embedding` 为 `jsonb`，无法走索引；文章量大时应迁移 pgvector 并建 HNSW。
3. `sms_background_jobs` / `sms_notification_outbox` 已使用 `FOR UPDATE SKIP LOCKED` + 短租约；若单任务执行超过租约（5 分钟），仍可能被第二个副本领取，超长任务建议拆分。
4. 财务表（`sms_invoices`/`sms_payments`）金额使用 `numeric`，与应用层 `number` 转换存在精度边界；导出/对账已按 2 位小数处理，后续可引入 decimal 库。

## 5. 迁移与回滚

- 模块迁移由宿主 `applyModuleMigrations` 统一记录在 `__module_migrations`，按 ID + checksum 幂等。
- 新增迁移 `sms:020-reliability` 全部使用 `IF NOT EXISTS`，可重复执行。
- `down` 未自动执行；如需回滚，按迁移注释手工删除新增表/列/索引（先备份 outbox 与 job 队列）。
