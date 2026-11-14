import { runDailyReport } from '../../../modules/sms/server/reportDaily'

export default defineTask({
  meta: {
    name: 'sms:daily-report',
    description: 'Pre-aggregate yesterday\'s attendance into sms_report_daily'
  },
  async run() {
    const result = await runDailyReport()
    console.log('[sms:daily-report]', result)
    return { result }
  }
})
