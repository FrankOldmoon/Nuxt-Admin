/**
 * Client-side chat component catalog.
 *
 * `GET /api/agent/components` is the authority for which ids exist and which
 * interactions the current actor may use. While the request is in flight (or
 * if it fails) `loaded` is false and the renderer falls back to the local map,
 * so chat never breaks because the catalog is temporarily unavailable.
 */
export interface AgentComponentEntry {
  id: string
  version?: string
  label: string
  description?: string
  propsHint?: string
  appsPath?: string
  interactions: {
    detail: boolean
    edit: boolean
  }
  editPermission?: string
}

export function useAgentComponents() {
  const { data, pending, error, refresh } = useAsyncData<{ components: AgentComponentEntry[] }>(
    'agent:components',
    () => $fetch<{ components: AgentComponentEntry[] }>('/api/agent/components'),
    { default: () => ({ components: [] }), server: false }
  )

  const components = computed(() => data.value?.components ?? [])
  const loaded = computed(() => !pending.value && !error.value && data.value !== undefined)
  const byId = computed<Record<string, AgentComponentEntry>>(() => {
    const map: Record<string, AgentComponentEntry> = {}
    for (const component of components.value) map[component.id] = component
    return map
  })

  function can(id: string, action: 'detail' | 'edit'): boolean {
    return byId.value[id]?.interactions?.[action] === true
  }

  return { components, byId, loaded, pending, error, can, refresh }
}
