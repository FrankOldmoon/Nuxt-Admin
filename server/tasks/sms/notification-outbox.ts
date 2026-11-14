import { deliverNotificationOutboxBatch } from '../../../modules/sms/server/notifications'

/**
 * 外部通知重试任务：每分钟投递到期的 outbox 行。
 * 失败按指数退避重排，达到 max_attempts 后标记 failed 供人工排查。
 */
export default defineTask({
  meta: {
    name: 'sms:notification-outbox',
    description: 'Deliver pending SMS notification outbox entries with retry/backoff'
  },
  async run() {
    const result = await deliverNotificationOutboxBatch()
    console.log('[sms:notification-outbox]', result)
    return { result }
  }
})
