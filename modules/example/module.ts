import type {
  ModuleApiRouter,
  ModuleDefinition,
  ToolRegistry,
  UiRegistry
} from '../../server/sdk'
import type { ModuleActor } from './server/context'
import { exampleMigrations } from './server/database/migrations'

export const exampleModule: ModuleDefinition = {
  id: 'example',
  name: 'Example Module',
  version: '1.0.0',
  apiVersion: '1',
  compatibility: { core: '^1.0.0' },
  migrationScope: 'global',
  dependencies: [],
  permissions: ['example:read', 'example:create'],
  navigation: [{ id: 'example', label: 'Example', to: '/example' }],
  database: ['example_notes'],
  api: ['GET /api/modules/example/notes', 'POST /api/modules/example/notes'],
  tools: ['example.notes.count'],
  components: ['example.status'],
  migrations: exampleMigrations,
  async register(context) {
    // Lazy import keeps this manifest DB-free so nuxt.config / migrations can
    // read the catalog without opening a database connection.
    const { registerExampleModule } = await import('./register')
    registerExampleModule({
      api: context.api as unknown as ModuleApiRouter<ModuleActor>,
      tools: context.tools as unknown as ToolRegistry<ModuleActor>,
      ui: context.ui as unknown as UiRegistry<unknown, unknown>
    })
  },
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
