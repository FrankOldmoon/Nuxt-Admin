import { describe, expect, it } from 'vitest'
import { describeChatComponents } from '../../../../server/core/componentCatalog'
import type { UiRegistration } from '../../../../server/core/moduleSdk'

function component(overrides: Partial<UiRegistration> = {}): UiRegistration {
  return {
    id: 'sms.student-table',
    label: '学生表格',
    version: '1.0',
    description: '学生名单',
    propsHint: 'query?: string',
    appsPath: '/dashboard/students',
    interactions: { detail: true, edit: { permission: 'sms.students.update' } },
    schema: () => true,
    render: () => ({}),
    ...overrides
  }
}

describe('chat component catalog', () => {
  it('resolves edit per interaction permission', () => {
    const [admin] = describeChatComponents([component()], ['*'])
    expect(admin).toMatchObject({
      id: 'sms.student-table',
      interactions: { detail: true, edit: true },
      editPermission: 'sms.students.update'
    })

    const [canonical] = describeChatComponents([component()], ['sms.students.update'])
    expect(canonical?.interactions.edit).toBe(true)

    const [coarse] = describeChatComponents([component()], ['sms:update'])
    expect(coarse?.interactions.edit).toBe(true)

    const [readOnly] = describeChatComponents([component()], ['sms:read', 'sms.students.read'])
    expect(readOnly?.interactions).toEqual({ detail: true, edit: false })
  })

  it('keeps components without edit interactions read-only', () => {
    const [entry] = describeChatComponents([component({ interactions: undefined })], ['*'])
    expect(entry?.interactions).toEqual({ detail: false, edit: false })
    expect(entry?.editPermission).toBeUndefined()
  })

  it('passes descriptive metadata to the client', () => {
    const [entry] = describeChatComponents([component()], [])
    expect(entry?.label).toBe('学生表格')
    expect(entry?.description).toBe('学生名单')
    expect(entry?.propsHint).toBe('query?: string')
    expect(entry?.appsPath).toBe('/dashboard/students')
    expect(entry?.version).toBe('1.0')
  })
})
