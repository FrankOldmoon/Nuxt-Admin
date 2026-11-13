import { describe, expect, it } from 'vitest'
import * as mainSchema from '../../../server/database/schema'
import {
  autoDiscoverTable,
  getExposedTable,
  getRegisteredTable,
  isTableExposed,
  registerDashboardTable,
  registerDrizzleSchema
} from '../../../server/utils/dashboard/tables'
import type { TableMeta } from '~/types/dashboard'

registerDrizzleSchema(mainSchema)

function testMeta(table: string): TableMeta {
  return {
    table,
    label: table,
    icon: 'i-lucide-table',
    fields: [],
    features: { softDelete: false, search: [] },
    custom: false
  }
}

describe('generic CRUD exposure allowlist', () => {
  it('never exposes internal tables, even if auto-discoverable', () => {
    expect(autoDiscoverTable('private_messages') ?? autoDiscoverTable('privateMessages')).not.toBeNull()
    expect(getExposedTable('private_messages')).toBeUndefined()
    expect(getExposedTable('privateMessages')).toBeUndefined()
    expect(getExposedTable('tokens')).toBeUndefined()
    expect(getExposedTable('auditLogs')).toBeUndefined()
    expect(getExposedTable('audit_logs')).toBeUndefined()
    expect(getExposedTable('organizations')).toBeUndefined()
    expect(getExposedTable('organization_memberships')).toBeUndefined()
  })

  it('keeps internal tables blocked even when registered as generic', () => {
    registerDashboardTable(
      { meta: testMeta('tokens'), getTable: () => mainSchema.tokens },
      { exposure: 'generic-crud' }
    )
    expect(getRegisteredTable('tokens')).toBeDefined()
    expect(isTableExposed(getRegisteredTable('tokens')!.meta)).toBe(false)
    expect(getExposedTable('tokens')).toBeUndefined()
  })

  it('serves explicitly exposed manual tables', () => {
    expect(getExposedTable('users')?.meta.exposure).toBe('generic-crud')
    expect(getExposedTable('roles')?.meta.exposure).toBe('generic-crud')
    expect(getExposedTable('configs')?.meta.exposure).toBe('custom')
  })

  it('defaults new registrations to internal and requires explicit exposure', () => {
    const name = `exposure_default_${Date.now()}`
    registerDashboardTable({ meta: testMeta(name), getTable: () => mainSchema.notifications })
    expect(getRegisteredTable(name)).toBeDefined()
    expect(getExposedTable(name)).toBeUndefined()
    expect(isTableExposed(getRegisteredTable(name)!.meta)).toBe(false)

    const exposedName = `exposure_generic_${Date.now()}`
    registerDashboardTable(
      { meta: testMeta(exposedName), getTable: () => mainSchema.notifications },
      { exposure: 'generic-crud' }
    )
    expect(getExposedTable(exposedName)?.meta.table).toBe(exposedName)
  })

  it('marks auto-discovered tables as internal', () => {
    const auto = autoDiscoverTable('private_messages') ?? autoDiscoverTable('privateMessages')
    expect(auto).not.toBeNull()
    expect(isTableExposed(auto!.meta)).toBe(false)
  })
})
