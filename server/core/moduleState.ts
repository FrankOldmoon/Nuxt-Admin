/** Lifecycle states persisted in `module_states`. */
export type ModuleLifecycleState = 'discovered' | 'validated' | 'installed' | 'migrated' | 'active' | 'deactivated' | 'failed'

const TRANSITIONS: Record<ModuleLifecycleState, readonly ModuleLifecycleState[]> = {
  discovered: ['validated', 'failed'],
  validated: ['installed', 'failed'],
  installed: ['migrated', 'failed'],
  migrated: ['active', 'failed'],
  active: ['deactivated', 'failed'],
  deactivated: ['active', 'failed'],
  failed: ['validated']
}

export function canTransition(from: ModuleLifecycleState, to: ModuleLifecycleState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function assertTransition(from: ModuleLifecycleState, to: ModuleLifecycleState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid module lifecycle transition: ${from} -> ${to}`)
  }
}
