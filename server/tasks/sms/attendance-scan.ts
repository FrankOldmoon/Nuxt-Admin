import { runAttendanceAlertScan } from '../../../modules/sms/server/jobs'

export default defineTask({
  meta: {
    name: 'sms:attendance-scan',
    description: 'Scan recent full-day attendance and raise consecutive-absence / monthly-rate alerts'
  },
  async run() {
    const result = await runAttendanceAlertScan()
    console.log('[sms:attendance-scan]', result)
    return { result }
  }
})
