// PUT /api/dashboard/templates/demo-switches
// Persist the personalization switches for the `templates` showcase table.
// Body: partial { switches } object — missing keys keep their current value.

import { createError } from 'h3'
import { requireDashboardAccess } from '~~/server/utils/auth'
import {
  getDemoSwitches,
  saveDemoSwitches
} from '~~/server/utils/templatesDemo'
import type { DemoSwitches } from '~~/server/utils/templatesDemo'

const KEYS: (keyof DemoSwitches)[] = [
  'customListApi',
  'cellOverrides',
  'detailOverrides',
  'formOverrides',
  'customToolbar',
  'fullCustomPage'
]

type PutBody = { key?: keyof DemoSwitches; value?: boolean; switches?: Partial<DemoSwitches> }

export default defineEventHandler(async (event) => {
  await requireDashboardAccess(event, 'templates', 'update')
  const body = (await readBody<PutBody>(event).catch(() => ({}))) as PutBody

  let patch: Partial<DemoSwitches>
  if (body?.switches && typeof body.switches === 'object') {
    patch = body.switches
  } else if (body?.key && KEYS.includes(body.key) && typeof body.value === 'boolean') {
    patch = { [body.key]: body.value }
  } else {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Expected a { switches } object (or { key, value } for a single flag)' })
  }

  const current = await getDemoSwitches()
  const next: DemoSwitches = { ...current }
  for (const key of KEYS) {
    if (key in patch && typeof patch[key] === 'boolean') {
      next[key] = patch[key]
    }
  }

  const saved = await saveDemoSwitches(next)
  return { switches: saved }
})