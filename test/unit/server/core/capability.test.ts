import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildCapabilityResultTable,
  capabilityPermissionMatches,
  defineCapability,
  describeCapabilities,
  getCapability,
  mergeFormOptions,
  registerCapabilities,
  resetCapabilityCatalog,
  type CapabilityDefinition
} from '../../../../server/core/capability'
import { ToolRegistry } from '../../../../server/core/moduleSdk'

interface TestActor {
  userId: number
  permissions: string[]
}

function command(overrides: Partial<CapabilityDefinition<TestActor>> = {}): CapabilityDefinition<TestActor> {
  return {
    id: 'demo.students.create',
    moduleId: 'demo',
    title: 'Create student',
    description: 'Create one student',
    resource: 'students',
    operation: 'command',
    riskLevel: 'medium',
    permission: 'demo.students.create',
    schema: (input: unknown) => typeof input === 'object' && input !== null,
    execute: () => ({ ok: true }),
    preview: () => ({ summary: 'Will create one student' }),
    ...overrides
  }
}

describe('capability contract', () => {
  beforeEach(() => resetCapabilityCatalog())

  it('rejects commands without a preview', () => {
    expect(() => defineCapability(command({ preview: undefined })))
      .toThrow(/requires a preview/)
  })

  it('rejects namespace-less ids and query forms', () => {
    expect(() => defineCapability(command({ id: 'studentscreate' })))
      .toThrow(/namespaced/)
    expect(() => defineCapability(command({
      operation: 'query',
      form: { fields: [] }
    }))).toThrow(/Only command capabilities/)
  })

  it('registers capabilities as tools and keeps product metadata', () => {
    const registry = new ToolRegistry<TestActor>()
    registerCapabilities(registry, 'demo', [command()])

    const tool = registry.get('demo.students.create')
    expect(tool).toBeDefined()
    expect((tool as unknown as CapabilityDefinition).title).toBe('Create student')
    expect(getCapability('demo.students.create')?.preview).toBeTypeOf('function')
  })

  it('matches canonical and module-coarse permissions', () => {
    expect(capabilityPermissionMatches(['*'], 'demo.students.create')).toBe(true)
    expect(capabilityPermissionMatches(['demo.students.create'], 'demo.students.create')).toBe(true)
    expect(capabilityPermissionMatches(['demo:create'], 'demo.students.create')).toBe(true)
    expect(capabilityPermissionMatches(['demo'], 'demo.students.create')).toBe(true)
    expect(capabilityPermissionMatches(['demo.students'], 'demo.students.create')).toBe(true)
    expect(capabilityPermissionMatches(['demo:read'], 'demo.students.create')).toBe(false)
    expect(capabilityPermissionMatches([], 'demo.students.create')).toBe(false)
  })

  it('only describes capabilities the caller may use', () => {
    const registry = new ToolRegistry<TestActor>()
    registerCapabilities(registry, 'demo', [
      command(),
      {
        ...command(),
        id: 'demo.students.search',
        title: 'Search students',
        description: 'Search',
        operation: 'query',
        riskLevel: 'low',
        permission: 'demo.students.read',
        preview: undefined,
        execute: () => []
      }
    ])

    expect(describeCapabilities(['demo:read']).map(tool => tool.name))
      .toEqual(['demo.students.search'])
    expect(describeCapabilities(['*']).map(tool => tool.name).sort())
      .toEqual(['demo.students.create', 'demo.students.search'])
  })

  it('merges preview-provided options into the form', () => {
    const form = mergeFormOptions(
      { fields: [{ key: 'classId', label: 'Class', type: 'select' }] },
      { summary: 'ok', fieldOptions: { classId: [{ label: 'A', value: 1 }] } }
    )
    expect(form.fields[0]?.options).toEqual([{ label: 'A', value: 1 }])
  })

  it('rejects a resultView without columns', () => {
    expect(() => defineCapability(command({
      operation: 'query',
      form: undefined,
      preview: undefined,
      resultView: { kind: 'table', columns: [] }
    }))).toThrow(/at least one column/)
  })

  it('projects results onto declared columns only', () => {
    const table = buildCapabilityResultTable({
      resultView: {
        kind: 'table',
        columns: [
          { key: 'name', label: '姓名' },
          { key: 'studentNo', label: '学号' }
        ]
      }
    }, [
      { id: 1, name: '张三', studentNo: 'S1', organizationId: 99 },
      { id: 2, name: '李四', studentNo: 'S2' }
    ])

    expect(table?.total).toBe(2)
    expect(table?.columns).toHaveLength(2)
    expect(table?.rows[0]).toEqual({ name: '张三', studentNo: 'S1' })
  })

  it('caps table rows and wraps single objects', () => {
    const capability = {
      resultView: {
        kind: 'table' as const,
        columns: [{ key: 'name', label: '姓名' }],
        maxRows: 2
      }
    }
    const many = buildCapabilityResultTable(capability, [
      { name: 'a' }, { name: 'b' }, { name: 'c' }
    ])
    expect(many?.rows).toHaveLength(2)
    expect(many?.total).toBe(3)

    const single = buildCapabilityResultTable(capability, { name: '张三', extra: true })
    expect(single?.rows).toEqual([{ name: '张三' }])
  })

  it('returns no table when the capability declares no resultView', () => {
    expect(buildCapabilityResultTable(undefined, [{ name: 'a' }])).toBeUndefined()
    expect(buildCapabilityResultTable({}, [{ name: 'a' }])).toBeUndefined()
  })
})
