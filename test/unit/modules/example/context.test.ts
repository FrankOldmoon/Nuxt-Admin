import { describe, expect, it } from 'vitest'
import { ModuleForbiddenError, resolveModules, ToolRegistry } from '../../../../server/core/moduleSdk'
import { MODULE_DEFINITIONS, parseEnabledModuleIds } from '../../../../server/core/moduleCatalog'
import { canUseExample, requireOrganization } from '../../../../modules/example/server/context'

describe('module catalog', () => {
  it('defaults to the example module and treats an empty value as disabled', () => {
    expect(parseEnabledModuleIds(undefined)).toEqual(['example'])
    expect(parseEnabledModuleIds('')).toEqual([])
    expect(parseEnabledModuleIds('example example')).toEqual(['example'])
  })

  it('resolves no modules when everything is disabled', () => {
    expect(resolveModules(MODULE_DEFINITIONS, parseEnabledModuleIds('')).modules).toEqual([])
  })

  it('keeps the example manifest and its migration in sync', () => {
    const [example] = resolveModules(MODULE_DEFINITIONS, ['example']).modules
    expect(example?.database).toContain('example_notes')
    expect(example?.migrations?.map(migration => migration.id)).toEqual(['example:001-create-notes'])
    expect(example?.api).toContain('GET /api/modules/example/notes')
    expect(example?.tools).toContain('example.notes.count')
    expect(example?.components).toContain('example.status')
  })

  it('makes disabled module tools unknown/un-callable', async () => {
    const tools = new ToolRegistry()
    const enabled = resolveModules(MODULE_DEFINITIONS, parseEnabledModuleIds(''))
    if (enabled.enabledIds.includes('example')) {
      tools.register({ id: 'example.notes.count', schema: {}, execute: () => 1 })
    }
    await expect(tools.run('example.notes.count', {}, {})).rejects.toThrow('Unknown module tool: example.notes.count')
  })
})

describe('example module authorization', () => {
  it('requires an active organization context', () => {
    expect(canUseExample({ userId: 1, roleName: 'admin' })).toBe(false)
    expect(() => requireOrganization({ userId: 1 })).toThrow(ModuleForbiddenError)
    expect(requireOrganization({ userId: 1, organizationId: 5, tenantId: 2 })).toEqual({ id: 5, tenantId: 2 })
  })

  it('enforces read vs create permissions, with admin override', () => {
    const reader = { userId: 1, roleName: 'author', permissions: ['example:read'], organizationId: 5 }
    expect(canUseExample(reader, 'read')).toBe(true)
    expect(canUseExample(reader, 'create')).toBe(false)
    expect(canUseExample({ ...reader, roleName: 'admin', permissions: [] }, 'create')).toBe(true)
  })
})
