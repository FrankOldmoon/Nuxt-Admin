// Phase 5 acceptance: SIS is an independent module that uses Core permission,
// data scope, Generic CRUD, Tool Registry and UI Registry without Core changes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '../../../../server/database'
import { applyModuleMigrations } from '../../../../server/database/moduleMigrations'
import { MODULE_DEFINITIONS } from '../../../../modules.catalog'
import { getRegisteredTable } from '../../../../server/utils/dashboard/tables'
import { listTableData, type DataScopeActor } from '../../../../server/utils/dashboard/crudService'
import { ModuleApiRouter, ToolRegistry, UiRegistry } from '../../../../server/core/moduleSdk'
import { describeAgentTools, extractUiDirective, runAgentLoop } from '../../../../server/core/agent'
import { registerSisModule } from '../../../../modules/sis-demo/register'
import { searchStudents } from '../../../../modules/sis-demo/server/students'
import type { SisActor } from '../../../../modules/sis-demo/server/context'

describe('SIS demo module (database)', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let tenantId = 0
  let organizationId = 0
  let classA = 0
  let classB = 0

  const teacher: SisActor = {
    userId: 1001,
    roleName: 'teacher',
    permissions: ['sis:read'],
    organizationId: 0,
    tenantId: 0
  }
  const admin: SisActor = {
    userId: 1,
    roleName: 'admin',
    permissions: ['*'],
    organizationId: 0,
    tenantId: 0
  }
  const api = new ModuleApiRouter<SisActor>()
  const tools = new ToolRegistry<SisActor>()
  const ui = new UiRegistry<unknown, unknown>()

  beforeAll(async () => {
    await applyModuleMigrations(pool, MODULE_DEFINITIONS)
    registerSisModule({ api, tools, ui })

    const tenant = await pool.query(
      `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id`,
      ['sis-itest', `sis-${suffix}`]
    )
    tenantId = tenant.rows[0].id
    const org = await pool.query(
      `INSERT INTO organizations (tenant_id, name, slug) VALUES ($1, 'SIS Org', $2) RETURNING id`,
      [tenantId, `sis-org-${suffix}`]
    )
    organizationId = org.rows[0].id
    teacher.organizationId = organizationId
    teacher.tenantId = tenantId
    admin.organizationId = organizationId
    admin.tenantId = tenantId

    const classes = await pool.query(
      `INSERT INTO sis_classes (organization_id, name, grade) VALUES ($1, 'Class A', '1'), ($1, 'Class B', '1') RETURNING id`,
      [organizationId]
    )
    classA = classes.rows[0].id
    classB = classes.rows[1].id

    await pool.query(
      `INSERT INTO sis_students (organization_id, class_id, name, student_no) VALUES
        ($1, $2, 'Alice', 'S001'),
        ($1, $3, 'Bob', 'S002')`,
      [organizationId, classA, classB]
    )
    await pool.query(
      `INSERT INTO sis_teacher_assignments (organization_id, teacher_user_id, class_id) VALUES ($1, $2, $3)`,
      [organizationId, teacher.userId, classA]
    )
  }, 60000)

  afterAll(async () => {
    if (organizationId) {
      await pool.query('DELETE FROM sis_students WHERE organization_id = $1', [organizationId])
      await pool.query('DELETE FROM sis_teacher_assignments WHERE organization_id = $1', [organizationId])
      await pool.query('DELETE FROM sis_classes WHERE organization_id = $1', [organizationId])
      await pool.query('DELETE FROM organizations WHERE id = $1', [organizationId])
    }
    if (tenantId) await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId])
    await pool.end()
  })

  it('shares one search service between the module API and the agent tool', async () => {
    expect((await searchStudents(teacher)).map(student => student.name)).toEqual(['Alice'])
    expect((await searchStudents(admin)).map(student => student.name)).toEqual(['Alice', 'Bob'])

    const viaApi = await api.dispatch('GET', 'sis-demo/students', {}, teacher, { q: '' })
    expect((viaApi as Array<{ name: string }>).map(student => student.name)).toEqual(['Alice'])
  })

  it('applies TeacherAssignment scope to Generic CRUD lists', async () => {
    const meta = getRegisteredTable('students')?.meta
    expect(meta?.exposure).toBe('generic-crud')
    expect(meta?.features.dataScope?.resolver).toBe('sis.teacherAssignedClasses')

    const actor: DataScopeActor = {
      userId: teacher.userId,
      roleName: 'teacher',
      dataScope: 'all',
      permissions: ['sis:read'],
      organizationId,
      tenantId
    }
    const result = await listTableData(meta!, { offset: 0, limit: 50, trashed: false } as never, actor)
    expect((result.rows as Array<{ name: string }>).map(row => row.name)).toEqual(['Alice'])
  })

  it('lets the agent call the student search tool with the same scope', async () => {
    const descriptors = describeAgentTools(tools as never, teacher.permissions)
    expect(descriptors.map(tool => tool.name)).toContain('sis.students.search')

    const result = await runAgentLoop({
      model: async messages => messages.some(message => message.role === 'tool')
        ? { content: 'Found your students.' }
        : {
            content: '',
            toolCalls: [{
              id: 'call-1',
              type: 'function',
              function: { name: 'sis.students.search', arguments: '{"query":""}' }
            }]
          },
      registry: tools as never,
      context: teacher,
      messages: [{ role: 'user', content: 'show my students' }],
      tools: descriptors
    })

    expect(result.status).toBe('completed')
    const toolMessage = result.messages.find(message => message.role === 'tool')
    expect(toolMessage?.content).toContain('Alice')
    expect(toolMessage?.content).not.toContain('Bob')
  })

  it('registers the fixed student table UI component', () => {
    const component = ui.get('sis.student-table')
    expect(component?.version).toBe('1.0')
    const extraction = extractUiDirective(
      '```ui\n{"ui":"sis.student-table","version":"1.0","presentation":{"mode":"inline"}}\n```',
      ui
    )
    expect(extraction.ui?.component).toBe('sis.student-table')
    expect(extraction.error).toBeUndefined()
  })

  it('does not require the agent module to use SIS services', async () => {
    // Searching directly (traditional page path) works without Tool Registry.
    expect((await searchStudents(teacher)).length).toBe(1)
  })
})
