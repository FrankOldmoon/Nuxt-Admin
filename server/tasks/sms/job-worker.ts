import { runBackgroundJobs } from '../../../modules/sms/server/jobQueue'

/** 每分钟消费导入/日报等后台任务。 */
export default defineTask({
  meta: {
    name: 'sms:job-worker',
    description: 'Process queued SMS background jobs with retry/backoff'
  },
  async run() {
    const result = await runBackgroundJobs()
    console.log('[sms:job-worker]', result)
    return { result }
  }
})
