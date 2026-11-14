/**
 * ```component block protocol.
 *
 * The model may end a reply with one fenced `component` block naming a
 * component registered in the module UI registry:
 *
 * ```component
 * {"component": "sms.student-table", "props": {"query": "张三"}}
 * ```
 *
 * Only registered ids are accepted, versions must match, and props are
 * validated against the registration schema. Unknown/invalid blocks are
 * stripped and reported instead of being rendered, so the model can never
 * inject an arbitrary Vue component or arbitrary props.
 *
 * Read capabilities can also declare a default component (`resultView.component`);
 * it is attached automatically when the model omits the block, so the viewer
 * still gets a stable, interactive result table.
 */

import type { ResultViewDescriptor } from './capability'
import { recordComponentMetric } from './componentMetrics'

export interface ComponentBlockRegistry {
  get: (id: string) => { version?: string } | undefined
  /** Validates props against the registration schema (throws on failure). */
  validateProps?: (id: string, props: Record<string, unknown>, options?: { version?: string }) => void
}

export interface ComponentDirective {
  component: string
  version?: string
  props: Record<string, unknown>
}

export interface ComponentBlockExtraction {
  /** Reply text with every component block removed. */
  content: string
  directive?: ComponentDirective
  error?: string
}

const COMPONENT_BLOCK_RE = /```component\s*\n([\s\S]*?)```/gi

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function extractComponentBlock(
  content: string,
  registry: ComponentBlockRegistry
): ComponentBlockExtraction {
  const matches = [...content.matchAll(COMPONENT_BLOCK_RE)]
  if (matches.length === 0) return { content }
  if (matches.length > 1) recordComponentMetric('block_multiple', String(matches.length))

  let cleaned = content
  for (const match of matches) cleaned = cleaned.replace(match[0], '')
  cleaned = cleaned.trim()

  const last = matches[matches.length - 1]
  const raw = last?.[1]?.trim() ?? ''

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    recordComponentMetric('block_invalid_json')
    return { content: cleaned, error: 'Invalid component block JSON' }
  }
  if (!isPlainObject(parsed)) {
    recordComponentMetric('block_invalid_shape')
    return { content: cleaned, error: 'Component block must be a JSON object' }
  }

  const component = typeof parsed.component === 'string' ? parsed.component.trim() : ''
  if (!component) {
    recordComponentMetric('block_invalid_shape', 'missing id')
    return { content: cleaned, error: 'Missing component id' }
  }

  const registered = registry.get(component)
  if (!registered) {
    recordComponentMetric('block_unknown_component', component)
    return { content: cleaned, error: `Unknown component: ${component}` }
  }

  const version = typeof parsed.version === 'string' ? parsed.version : undefined
  if (registered.version && version && registered.version !== version) {
    recordComponentMetric('block_version_mismatch', component)
    return { content: cleaned, error: `Component version mismatch: ${component}` }
  }

  const props = parsed.props ?? {}
  if (!isPlainObject(props)) {
    recordComponentMetric('block_invalid_shape', `${component} props`)
    return { content: cleaned, error: 'Component props must be an object' }
  }

  try {
    registry.validateProps?.(component, props, { version })
  } catch (error) {
    recordComponentMetric('block_invalid_props', component)
    return {
      content: cleaned,
      error: error instanceof Error ? error.message : `Invalid props for component: ${component}`
    }
  }

  return { content: cleaned, directive: { component, version, props } }
}

/**
 * Default component declared by a read capability. Props are derived from the
 * tool input (query/limit only), then validated exactly like a model block —
 * invalid props mean no component rather than an unvalidated render.
 */
export function buildResultComponentDirective(
  capability: { resultView?: ResultViewDescriptor } | undefined,
  input: unknown,
  registry: ComponentBlockRegistry
): ComponentDirective | undefined {
  const descriptor = capability?.resultView?.component
  if (!descriptor) return undefined

  const registered = registry.get(descriptor.id)
  if (!registered) {
    recordComponentMetric('block_unknown_component', descriptor.id)
    return undefined
  }

  const props: Record<string, unknown> = {}
  if (isPlainObject(input)) {
    const query = input[descriptor.queryKey ?? 'query'] ?? input.q
    if (typeof query === 'string' && query.trim()) props.query = query.trim()
    if (typeof input.limit === 'number' && Number.isSafeInteger(input.limit)) props.limit = input.limit
  }

  try {
    registry.validateProps?.(descriptor.id, props, { version: registered.version })
  } catch {
    recordComponentMetric('block_invalid_props', descriptor.id)
    return undefined
  }

  recordComponentMetric('default_component_attached', descriptor.id)
  return { component: descriptor.id, version: registered.version, props }
}

/** Prompt section listing the components the model may reference. */
export function buildComponentPrompt(components: Array<{
  id: string
  label?: string
  description?: string
  propsHint?: string
}>): string {
  if (components.length === 0) return ''
  const lines = components.map((item) => {
    const details = [item.description, item.propsHint ? `props: ${item.propsHint}` : '']
      .filter(Boolean)
      .join('; ')
    return `- ${item.id} — ${item.label ?? item.id}${details ? ` (${details})` : ''}`
  })
  return [
    'Interactive component protocol (optional):',
    'When a registered component genuinely helps the user act on the result, end the',
    'reply with exactly one fenced block tagged "component" containing JSON:',
    '```component',
    '{"component": "<component id>", "props": {}}',
    '```',
    'Available components:',
    ...lines,
    'Components load data themselves under the viewer\'s permissions. Never put',
    'business rows or fabricated data into props, never invent component ids, and',
    'use at most one block per reply.'
  ].join('\n')
}
