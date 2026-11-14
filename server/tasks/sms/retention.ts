import { runRetentionCleanup } from '../../../modules/sms/server/retention'

/** 每日清理过期站内信 / Agent 事件 / 指标 / 报表运行记录。 */
export default defineTask({
  meta: {
    name: 'sms:retention',
    description: 'Delete SMS rows older than the configured retention windows'
  },
  async run() {
    const result = await runRetentionCleanup()
    console.log('[sms:retention]', result)
    return { result }
  }
})
