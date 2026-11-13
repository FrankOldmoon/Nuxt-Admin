import { describe, expect, it } from 'vitest'
import {
  approvalArgumentsHash,
  approvalBindingMatches,
  assertApprovalTransition,
  canTransitionApproval
} from '../../../../server/core/agentApproval'

describe('approval lifecycle', () => {
  it('allows the documented paths and rejects shortcuts', () => {
    expect(canTransitionApproval('pending', 'approved')).toBe(true)
    expect(canTransitionApproval('approved', 'executing')).toBe(true)
    expect(canTransitionApproval('executing', 'completed')).toBe(true)
    expect(canTransitionApproval('pending', 'executing')).toBe(false)
    expect(canTransitionApproval('completed', 'pending')).toBe(false)
    expect(() => assertApprovalTransition('pending', 'completed'))
      .toThrow('Invalid approval transition: pending -> completed')
  })
})

describe('approval binding', () => {
  const calls = [
    { callId: 'c1', toolId: 'sis.enroll', arguments: { studentId: 1, meta: { b: 2, a: 1 } } }
  ]

  it('hashes arguments deterministically regardless of key order', () => {
    const reordered = [
      { callId: 'c1', toolId: 'sis.enroll', arguments: { meta: { a: 1, b: 2 }, studentId: 1 } }
    ]
    expect(approvalArgumentsHash(calls)).toBe(approvalArgumentsHash(reordered))
    expect(approvalArgumentsHash(calls)).toHaveLength(64)
  })

  it('detects changed parameters and changed operations', () => {
    const changedArgs = [
      { callId: 'c1', toolId: 'sis.enroll', arguments: { studentId: 2, meta: { b: 2, a: 1 } } }
    ]
    expect(approvalBindingMatches(calls, changedArgs)).toBe(false)
    expect(approvalBindingMatches(calls, [{ ...calls[0]!, callId: 'c2' }])).toBe(false)
    expect(approvalBindingMatches(calls, [{ ...calls[0]!, toolId: 'sis.withdraw' }])).toBe(false)
    expect(approvalBindingMatches(calls, calls)).toBe(true)
  })
})
