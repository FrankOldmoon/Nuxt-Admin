import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearDataScopeResolvers,
  dataScopeDenialMessage,
  filterAccessibleRecords,
  recordMatchesScope,
  registerDataScopeResolver,
  resolveDataScope,
  resolveTableDataScope
} from '../../../../server/core/dataScope'

const base = {
  userId: 7,
  roleName: 'teacher',
  dataScope: 'self',
  permissions: ['students:read'],
  organizationId: 3,
  tenantId: 2,
  departmentId: 5
}

describe('resolveDataScope', () => {
  it('maps legacy self to own with an owner column', () => {
    expect(resolveDataScope({ ownerColumn: 'teacherId' }, base))
      .toEqual({ allowed: true, scope: 'own', column: 'teacherId', value: 7 })
  })

  it('maps legacy self on the users table to id', () => {
    expect(resolveDataScope({ userTable: true }, base))
      .toEqual({ allowed: true, scope: 'own', column: 'id', value: 7 })
  })

  it('denies own scope without an owner column', () => {
    expect(resolveDataScope(undefined, base)).toEqual({ allowed: false, reason: 'missing-column' })
  })

  it('requires an explicit global permission for global/all', () => {
    const all = { ...base, dataScope: 'all' }
    expect(resolveDataScope(undefined, all)).toEqual({ allowed: false, reason: 'global-permission' })
    expect(resolveDataScope(undefined, { ...all, permissions: ['*'] })).toEqual({ allowed: true, scope: 'global' })
    expect(resolveDataScope({ scope: 'global' }, { ...all, permissions: ['global'] })).toEqual({ allowed: true, scope: 'global' })
  })

  it('resolves organization, tenant, department and assigned scopes', () => {
    expect(resolveDataScope({ scope: 'organization', organizationColumn: 'organizationId' }, base))
      .toEqual({ allowed: true, scope: 'organization', column: 'organizationId', value: 3 })
    expect(resolveDataScope({ scope: 'tenant', tenantColumn: 'tenantId' }, base))
      .toEqual({ allowed: true, scope: 'tenant', column: 'tenantId', value: 2 })
    expect(resolveDataScope({ scope: 'department', departmentColumn: 'departmentId' }, base))
      .toEqual({ allowed: true, scope: 'department', column: 'departmentId', value: 5 })
    expect(resolveDataScope({ scope: 'assigned', assigneeColumn: 'assignedTo' }, base))
      .toEqual({ allowed: true, scope: 'assigned', column: 'assignedTo', value: 7 })
  })

  it('denies when the required context is missing', () => {
    expect(resolveDataScope({ scope: 'organization', organizationColumn: 'organizationId' }, { ...base, organizationId: null }))
      .toEqual({ allowed: false, reason: 'missing-context' })
    expect(resolveDataScope({ scope: 'tenant', tenantColumn: 'tenantId' }, { ...base, tenantId: null }))
      .toEqual({ allowed: false, reason: 'missing-context' })
    expect(resolveDataScope({ scope: 'department', departmentColumn: 'departmentId' }, { ...base, departmentId: null }))
      .toEqual({ allowed: false, reason: 'missing-context' })
  })

  it('denies unspecified scopes instead of skipping isolation', () => {
    expect(resolveDataScope(undefined, { ...base, dataScope: 'everything' }))
      .toEqual({ allowed: false, reason: 'unsupported-scope' })
  })

  it('checks and filters loaded records against the resolved scope', () => {
    const resolution = resolveDataScope({ scope: 'organization', organizationColumn: 'organizationId' }, base)
    expect(recordMatchesScope(resolution, { id: 1, organizationId: 3 })).toBe(true)
    expect(recordMatchesScope(resolution, { id: 2, organizationId: 4 })).toBe(false)
    expect(filterAccessibleRecords([
      { id: 1, organizationId: 3 },
      { id: 2, organizationId: 4 }
    ], resolution)).toEqual([{ id: 1, organizationId: 3 }])

    const denied = resolveDataScope(undefined, { ...base, dataScope: 'everything' })
    expect(recordMatchesScope(denied, { id: 1 })).toBe(false)
    expect(filterAccessibleRecords([{ id: 1 }], denied)).toEqual([])

    const global = resolveDataScope(undefined, { ...base, dataScope: 'all', permissions: ['*'] })
    expect(recordMatchesScope(global, { id: 1 })).toBe(true)
  })

  it('provides actionable denial messages', () => {
    expect(dataScopeDenialMessage('global-permission')).toContain('global permission')
    expect(dataScopeDenialMessage('missing-column')).toContain('column mapping')
    expect(dataScopeDenialMessage('missing-context')).toContain('organization/tenant/department')
    expect(dataScopeDenialMessage('unsupported-scope')).toContain('Unsupported')
  })
})

describe('module data scope resolvers', () => {
  beforeEach(() => {
    clearDataScopeResolvers()
  })

  it('denies unknown resolver names instead of skipping isolation', () => {
    expect(resolveTableDataScope({ resolver: 'sis.teacherStudents' }, base, { table: 'students', action: 'read' }))
      .toEqual({ allowed: false, reason: 'unknown-resolver' })
  })

  it('uses a registered resolver and passes resource context', () => {
    const seen: string[] = []
    registerDataScopeResolver('sis.teacherStudents', ({ resource, actor }) => {
      seen.push(`${resource.table}:${resource.action}:${actor.userId}`)
      return { allowed: true, scope: 'assigned', column: 'teacherId', value: actor.userId }
    })

    expect(resolveTableDataScope({ resolver: 'sis.teacherStudents' }, base, { table: 'students', action: 'list' }))
      .toEqual({ allowed: true, scope: 'assigned', column: 'teacherId', value: 7 })
    expect(seen).toEqual(['students:list:7'])
  })

  it('rejects duplicate and empty resolver names', () => {
    registerDataScopeResolver('a', () => ({ allowed: true, scope: 'global' }))
    expect(() => registerDataScopeResolver('a', () => ({ allowed: true, scope: 'global' })))
      .toThrow('Duplicate data scope resolver: a')
    expect(() => registerDataScopeResolver('  ', () => ({ allowed: true, scope: 'global' })))
      .toThrow('must not be empty')
  })
})
