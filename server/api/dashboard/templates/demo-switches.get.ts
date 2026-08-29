// GET /api/dashboard/templates/demo-switches
// Read the personalization-ladder switch set for the `templates` showcase table.

import { getDemoSwitches } from '~~/server/utils/templatesDemo'
import { requireDashboardAccess } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireDashboardAccess(event, 'templates', 'read')
  return { switches: await getDemoSwitches() }
})