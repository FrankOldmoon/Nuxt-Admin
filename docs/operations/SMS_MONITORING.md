# SMS 监控与告警

## 1. 指标端点

`GET /api/modules/sms/metrics/prometheus` 输出 Prometheus exposition 文本（0.0.4），
按调用者的组织做聚合，不含学生姓名、通知正文等个人信息。

| 指标 | 含义 |
|---|---|
| `sms_notifications_total` / `sms_notifications_unread` | 站内信总量 / 未读数 |
| `sms_approvals_pending` / `sms_approvals_overdue` | 待审批 / 已超 SLA |
| `sms_import_batches_total` | 学生与成绩导入批次 |
| `sms_agent_tasks_failed` / `sms_agent_tasks_running` | Agent 任务失败 / 运行中 |
| `sms_knowledge_articles_published` | 已发布知识库文章 |
| `sms_notification_outbox_pending` / `_failed` | 外部通知积压 / 永久失败 |
| `sms_background_jobs_pending` / `_failed` | 后台任务积压 / 永久失败 |

所有指标带 `organization_id` 标签，可按学校拆分。

## 2. Prometheus 抓取配置

```yaml
scrape_configs:
  - job_name: sms
    metrics_path: /api/modules/sms/metrics/prometheus
    scheme: https
    bearer_token_file: /etc/prometheus/sms-token
    static_configs:
      - targets: ['sis.example.com']
```

端点复用模块 API 鉴权：需要 `sms.audit.read` 或管理员权限；建议为抓取创建只读服务账号。

## 3. Grafana 面板建议

| 面板 | PromQL |
|---|---|
| 待审批 | `sum by (organization_id) (sms_approvals_pending)` |
| 超时审批 | `sum by (organization_id) (sms_approvals_overdue)` |
| 通知积压 | `sum by (organization_id) (sms_notification_outbox_pending)` |
| 永久失败 | `sum by (organization_id) (sms_notification_outbox_failed + sms_background_jobs_failed)` |
| Agent 失败率 | `sum(rate(sms_agent_tasks_failed[1h]))` |
| 未读通知 | `sum by (organization_id) (sms_notifications_unread)` |

## 4. 告警规则

见 [`ops/prometheus/sms-alerts.yml`](../../ops/prometheus/sms-alerts.yml)：

1. **Outbox 积压**：pending > 50 持续 10 分钟，说明 Webhook 不可用或 worker 未运行。
2. **永久失败**：failed 行 > 0 持续 15 分钟，需要人工检查网关配置与载荷。
3. **审批超时**：overdue > 0 持续 30 分钟，提醒管理员处理 SLA。

## 5. 排障顺序

1. 看 `sms:notification-outbox` / `sms:job-worker` 任务日志（Nitro scheduled task）。
2. 查 `sms_notification_outbox` / `sms_background_jobs` 的 `last_error` 与 `attempts`。
3. 检查 `SMS_NOTIFICATION_WEBHOOK_URL`、`SMS_NOTIFICATION_WEBHOOK_SECRET`、`SMS_TIMEZONE`。
4. 恢复后用 `sms:retention` 清理已终结的 outbox 与历史数据。
