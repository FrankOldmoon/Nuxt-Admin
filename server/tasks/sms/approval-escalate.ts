import { escalateOverdueApprovals } from '../../../modules/sms/server/approvals'

export default defineTask({
  meta: {
    name: 'sms:approval-escalate',
    description: 'Escalate overdue leave/refund approval steps after the 48h SLA'
  },
  async run() {
    const result = await escalateOverdueApprovals()
    console.log('[sms:approval-escalate]', result)
    return { result }
  }
})
