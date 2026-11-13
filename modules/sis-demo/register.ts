import type {
  ModuleApiDefinition,
  ModuleApiRouter,
  ToolDefinition,
  ToolRegistry,
  UiDefinition,
  UiRegistry
} from '../../server/core/moduleSdk'
import type { FieldMeta, TableMeta } from '../../app/types/dashboard'
import { registerDashboardTable } from '../../server/utils/dashboard/tables'
import { registerDataScopeResolver } from '../../server/core/dataScope'
import { canUseSis, type SisActor } from './server/context'
import { assignedClassIds, searchStudents } from './server/students'
import { sisClasses, sisStudents } from './server/database/schema'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function field(partial: Partial<FieldMeta> & Pick<FieldMeta, 'key' | 'label' | 'type'>): FieldMeta {
  return {
    nullable: true,
    showInForm: true,
    showInTable: true,
    showInDetail: true,
    editable: true,
    ...partial
  }
}

const studentFields: FieldMeta[] = [
  field({ key: 'id', label: 'ID', type: 'number', nullable: false, editable: false, showInForm: false }),
  field({ key: 'name', label: 'Name', type: 'text', nullable: false, validation: { required: true } }),
  field({ key: 'studentNo', label: 'Student No', type: 'text', nullable: false, validation: { required: true } }),
  field({ key: 'classId', label: 'Class', type: 'relation', nullable: true, relation: { table: 'classes', labelKey: 'name', valueKey: 'id' } }),
  field({ key: 'organizationId', label: 'Organization', type: 'number', nullable: false, showInTable: false, showInDetail: false }),
  field({ key: 'createdAt', label: 'Created', type: 'datetime', nullable: false, editable: false, showInForm: false })
]

const classFields: FieldMeta[] = [
  field({ key: 'id', label: 'ID', type: 'number', nullable: false, editable: false, showInForm: false }),
  field({ key: 'name', label: 'Name', type: 'text', nullable: false, validation: { required: true } }),
  field({ key: 'grade', label: 'Grade', type: 'text', nullable: true }),
  field({ key: 'organizationId', label: 'Organization', type: 'number', nullable: false, showInTable: false, showInDetail: false }),
  field({ key: 'createdAt', label: 'Created', type: 'datetime', nullable: false, editable: false, showInForm: false })
]

const studentsMeta: TableMeta = {
  table: 'students',
  exposure: 'generic-crud',
  label: 'Students',
  icon: 'i-lucide-graduation-cap',
  fields: studentFields,
  features: {
    softDelete: false,
    search: ['name', 'studentNo'],
    defaultSort: { field: 'name', order: 'asc' },
    // TeacherAssignment decides which classes (and therefore students) are visible.
    dataScope: { resolver: 'sis.teacherAssignedClasses' }
  },
  custom: false
}

const classesMeta: TableMeta = {
  table: 'classes',
  exposure: 'generic-crud',
  label: 'Classes',
  icon: 'i-lucide-school',
  fields: classFields,
  features: {
    softDelete: false,
    search: ['name', 'grade'],
    defaultSort: { field: 'name', order: 'asc' },
    dataScope: { scope: 'organization', organizationColumn: 'organizationId' }
  },
  custom: false
}

let dashboardRegistered = false

/** Register the SIS tables into generic CRUD and install the data-scope resolver. */
export function registerSisDashboardTables(): void {
  if (dashboardRegistered) return
  dashboardRegistered = true

  registerDataScopeResolver('sis.teacherAssignedClasses', async ({ actor }) => {
    if (!actor.organizationId) return { allowed: false, reason: 'missing-context' }
    if (actor.roleName === 'admin' && actor.permissions?.includes('*')) {
      return { allowed: true, scope: 'global' }
    }
    const classIds = await assignedClassIds(actor as SisActor)
    return {
      allowed: true,
      scope: 'assigned',
      column: 'classId',
      value: classIds[0] ?? 0,
      values: classIds
    }
  })

  registerDashboardTable(
    { meta: studentsMeta, getTable: () => sisStudents },
    { menuOrder: 90, exposure: 'generic-crud' }
  )
  registerDashboardTable(
    { meta: classesMeta, getTable: () => sisClasses },
    { menuOrder: 91, exposure: 'generic-crud' }
  )
}

const sisApis: ModuleApiDefinition<SisActor>[] = [
  {
    id: 'sis.students.search',
    moduleId: 'sis-demo',
    method: 'GET',
    path: 'sis-demo/students',
    schema: isRecord,
    authorize: actor => canUseSis(actor, 'read'),
    handler: (_event, actor, input) => {
      const query = isRecord(input)
        ? (typeof input.q === 'string' ? input.q : typeof input.query === 'string' ? input.query : undefined)
        : undefined
      return searchStudents(actor, { query })
    }
  }
]

const sisTools: ToolDefinition<SisActor>[] = [
  {
    id: 'sis.students.search',
    moduleId: 'sis-demo',
    description: 'Search students visible to the current teacher or organization admin',
    schema: isRecord,
    inputJsonSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Name or student number fragment' } },
      additionalProperties: false
    },
    operation: 'query',
    permission: 'sis:read',
    approval: 'none',
    authorize: actor => canUseSis(actor, 'read'),
    execute: (input, actor) => searchStudents(actor, {
      query: isRecord(input) && typeof input.query === 'string' ? input.query : undefined
    })
  }
]

const sisUi: UiDefinition<{ rows?: unknown[], query?: string }, Record<string, unknown>> = {
  id: 'sis.student-table',
  moduleId: 'sis-demo',
  label: 'Student table',
  version: '1.0',
  schema: value => isRecord(value) && (Array.isArray(value.rows) || typeof value.query === 'string'),
  render: props => ({ component: 'sis.student-table', props })
}

export interface SisRegistries {
  api: ModuleApiRouter<SisActor>
  tools: ToolRegistry<SisActor>
  ui: UiRegistry<unknown, unknown>
}

export function registerSisModule(registries: SisRegistries): void {
  registerSisDashboardTables()
  for (const api of sisApis) registries.api.register(api)
  for (const tool of sisTools) registries.tools.register(tool)
  registries.ui.register({
    id: sisUi.id,
    version: sisUi.version,
    schema: sisUi.schema,
    render: props => sisUi.render(props as { rows?: unknown[], query?: string })
  })
}
