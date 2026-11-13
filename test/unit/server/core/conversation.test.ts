import { describe, expect, it } from 'vitest'
import {
  asChatUi,
  asToolCallCards,
  assertDraftTransition,
  canTransitionDraft,
  conversationTitleFrom
} from '../../../../server/core/conversation'

describe('conversation domain', () => {
  it('builds a title from the first user message', () => {
    expect(conversationTitleFrom('  把张三   加到 A 班 ')).toBe('把张三 加到 A 班')
    expect(conversationTitleFrom('')).toBe('新对话')
    expect(conversationTitleFrom('x'.repeat(80))).toHaveLength(61)
  })

  it('allows one-way draft transitions', () => {
    expect(canTransitionDraft('draft', 'submitted')).toBe(true)
    expect(canTransitionDraft('draft', 'cancelled')).toBe(true)
    expect(canTransitionDraft('submitted', 'draft')).toBe(false)
    expect(canTransitionDraft('cancelled', 'submitted')).toBe(false)
    expect(() => assertDraftTransition('submitted', 'draft')).toThrow(/Invalid draft transition/)
  })

  it('validates stored UI payloads', () => {
    const form = {
      kind: 'form',
      capabilityId: 'sms.students.create',
      title: '新增学生',
      draftId: 1,
      form: { fields: [] }
    }
    expect(asChatUi(form)).toEqual(form)
    expect(asChatUi({ kind: 'unknown' })).toBeNull()
    expect(asChatUi(null)).toBeNull()
  })

  it('keeps tool card arrays only when they are arrays', () => {
    const cards = [{ id: '1', name: 'sms.students.search', title: 'Search', status: 'success' }]
    expect(asToolCallCards(cards)).toEqual(cards)
    expect(asToolCallCards({})).toBeNull()
  })
})
