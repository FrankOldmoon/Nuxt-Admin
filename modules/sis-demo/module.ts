import type {
  ModuleApiRouter,
  ModuleDefinition,
  ToolRegistry,
  UiRegistry
} from '../../server/core/moduleSdk'
import type { SisActor } from './server/context'
import { sisMigrations } from './server/database/migrations'

export const sisDemoModule: ModuleDefinition = {
  id: 'sis-demo',
  name: 'SIS Demo',
  version: '1.0.0',
  dependencies: [],
  permissions: ['sis:read', 'sis:create', 'sis:update'],
  navigation: [{ id: 'sis', label: 'SIS', to: '/sis' }],
  database: ['sis_classes', 'sis_students', 'sis_teacher_assignments'],
  api: ['GET /api/modules/sis-demo/students'],
  tools: ['sis.students.search'],
  components: ['sis.student-table'],
  migrations: sisMigrations,
  async register(context) {
    const { registerSisModule } = await import('./register')
    registerSisModule({
      api: context.api as unknown as ModuleApiRouter<SisActor>,
      tools: context.tools as unknown as ToolRegistry<SisActor>,
      ui: context.ui as unknown as UiRegistry<unknown, unknown>
    })
  }
}
