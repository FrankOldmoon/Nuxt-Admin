import type { ModuleDefinition } from '../../server/core/moduleSdk'
import { exampleMigrations } from './server/database/migrations'

export const exampleModule: ModuleDefinition = {
  id: 'example',
  name: 'Example Module',
  version: '1.0.0',
  dependencies: [],
  permissions: ['example:read', 'example:create'],
  navigation: [{ id: 'example', label: 'Example', to: '/example' }],
  database: ['example_notes'],
  api: ['GET /api/modules/example/notes', 'POST /api/modules/example/notes'],
  tools: ['example.notes.count'],
  components: ['example.status'],
  migrations: exampleMigrations,
  lifecycle: {
    onRegister(context) {
      if (!context.enabledModuleIds.includes('example')) throw new Error('Example module is not enabled')
    },
    onEnable(context) {
      if (!context.migrations.some(migration => migration.id === 'example:001-create-notes')) {
        throw new Error('Example module migration is missing')
      }
    }
  }
}
