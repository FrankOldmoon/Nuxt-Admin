/**
 * Lightweight counters for the ```component protocol.
 *
 * They make model drift observable without adding a metrics dependency:
 * failures are counted in-process and logged as a single structured line, so
 * the values can be scraped or inspected in tests. Swap `getComponentMetrics`
 * for a real metrics backend when one is introduced.
 */
export type ComponentMetricKind
  = | 'block_invalid_json'
    | 'block_invalid_shape'
    | 'block_unknown_component'
    | 'block_version_mismatch'
    | 'block_invalid_props'
    | 'block_multiple'
    | 'default_component_attached'

const counters = new Map<ComponentMetricKind, number>()

export function recordComponentMetric(kind: ComponentMetricKind, detail?: string): void {
  counters.set(kind, (counters.get(kind) ?? 0) + 1)
  if (process.env.NODE_ENV === 'development' || process.env.COMPONENT_METRICS_LOG === '1') {
    console.warn('[chat-component]', kind, detail ?? '')
  }
}

export function getComponentMetrics(): Record<string, number> {
  return Object.fromEntries(counters)
}

/** Test helper: reset all counters. */
export function resetComponentMetrics(): void {
  counters.clear()
}
