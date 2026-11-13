import { createHash } from 'node:crypto'

/** Human-approval lifecycle for a sensitive agent operation. */
export type ApprovalStatus
  = | 'pending'
    | 'approved'
    | 'rejected'
    | 'executing'
    | 'completed'
    | 'failed'
    | 'expired'
    | 'cancelled'

const TRANSITIONS: Record<ApprovalStatus, readonly ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'expired', 'cancelled'],
  approved: ['executing', 'cancelled', 'expired'],
  executing: ['completed', 'failed'],
  completed: [],
  rejected: [],
  expired: [],
  failed: [],
  cancelled: []
}

export function canTransitionApproval(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function assertApprovalTransition(from: ApprovalStatus, to: ApprovalStatus): void {
  if (!canTransitionApproval(from, to)) {
    throw new Error(`Invalid approval transition: ${from} -> ${to}`)
  }
}

export interface ApprovalCall {
  callId: string
  toolId: string
  arguments: unknown
}

/** Deterministic JSON with recursively sorted object keys. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
  return `{${entries.join(',')}}`
}

/**
 * Bind an approval to the exact ordered operations and their validated
 * arguments. Recomputing the hash detects any parameter change, so a modified
 * command always requires a new approval.
 */
export function approvalArgumentsHash(calls: readonly ApprovalCall[]): string {
  return createHash('sha256')
    .update(canonicalJson(calls.map(call => ({
      callId: call.callId,
      toolId: call.toolId,
      arguments: call.arguments
    }))))
    .digest('hex')
}

export function approvalBindingMatches(
  stored: readonly ApprovalCall[],
  incoming: readonly ApprovalCall[]
): boolean {
  return approvalArgumentsHash(stored) === approvalArgumentsHash(incoming)
}
