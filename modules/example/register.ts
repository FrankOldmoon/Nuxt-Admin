import {
  db,
  writeAudit,
  type ModuleApiDefinition,
  type ModuleApiRouter,
  type ToolDefinition,
  type ToolRegistry,
  type UiDefinition,
  type UiRegistry
} from '../../server/sdk'
import { canUseExample, requireOrganization, type ModuleActor } from './server/context'
import { countNotes, createNote, listNotes } from './server/notes'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const createNoteInput = (value: unknown): boolean =>
  isRecord(value) && typeof value.title === 'string' && value.title.trim().length > 0 && value.title.trim().length <= 160

/** Module APIs are served through the host's `/api/modules/**` dispatcher. */
export const exampleApis: ModuleApiDefinition<ModuleActor>[] = [
  {
    id: 'example.notes.list',
    moduleId: 'example',
    method: 'GET',
    path: 'example/notes',
    schema: isRecord,
    authorize: actor => canUseExample(actor, 'read'),
    handler: (_event, actor) => listNotes(actor)
  },
  {
    id: 'example.notes.create',
    moduleId: 'example',
    method: 'POST',
    path: 'example/notes',
    schema: createNoteInput,
    authorize: actor => canUseExample(actor, 'create'),
    handler: (_event, actor, input) => createNote(actor, input as { title: string, body?: string })
  }
]

/** Server-side tool: every run re-authorizes against the current org + role. */
export const exampleTools: ToolDefinition<ModuleActor>[] = [
  {
    id: 'example.notes.count',
    moduleId: 'example',
    description: 'Count the notes visible in the current organization',
    schema: isRecord,
    outputSchema: isRecord,
    operation: 'query',
    permission: 'example:read',
    approval: 'none',
    inputJsonSchema: { type: 'object', properties: {}, additionalProperties: false },
    authorize: actor => canUseExample(actor, 'read'),
    async execute(_input, actor) {
      const organization = requireOrganization(actor)
      const count = await countNotes(actor)
      await db.transaction(async (tx) => {
        await writeAudit(tx, {
          actorUserId: actor.userId,
          tenantId: organization.tenantId,
          organizationId: organization.id,
          moduleId: 'example',
          action: 'tool.execute',
          resource: 'example.notes.count',
          source: 'module-tool'
        })
      })
      return { count }
    }
  }
]

/** Fixed UI descriptor: the model may select an ID, never inject markup. */
export const exampleUi: UiDefinition<{ count: number }, { component: string, props: { count: number } }> = {
  id: 'example.status',
  moduleId: 'example',
  label: 'Example note count',
  version: '1.0',
  schema: value => isRecord(value) && typeof value.count === 'number',
  render: props => ({ component: 'example.status', props: { count: props.count } })
}

export interface ExampleRegistries {
  api: ModuleApiRouter<ModuleActor>
  tools: ToolRegistry<ModuleActor>
  ui: UiRegistry<unknown, unknown>
}

export function registerExampleModule(registries: ExampleRegistries): void {
  for (const api of exampleApis) registries.api.register(api)
  for (const tool of exampleTools) registries.tools.register(tool)
  registries.ui.register({
    id: exampleUi.id,
    version: exampleUi.version,
    label: exampleUi.label,
    schema: exampleUi.schema,
    render: props => exampleUi.render(props as { count: number })
  })
}
