import { runWeeklyReport } from '../../../modules/sms/server/jobs'

export default defineTask({
  meta: {
    name: 'sms:weekly-report',
    description: 'Generate last week\'s attendance / leave / exam / finance report for every organization'
  },
  async run() {
    const result = await runWeeklyReport()
    console.log('[sms:weekly-report]', result)
    return { result }
  }
})
