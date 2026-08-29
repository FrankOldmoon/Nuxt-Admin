import { describe, it, expect } from 'vitest'
import { validateForm } from '../../../app/composables/useFormValidation'
import type { TableMetaWithOptions } from '../../../app/types/dashboard'

const meta: TableMetaWithOptions = {
  table: 'test',
  label: 'Test',
  fields: [
    { key: 'name', label: 'Name', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 50 } },
    { key: 'age', label: 'Age', type: 'number', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, min: 0, max: 150 } },
    { key: 'email', label: 'Email', type: 'text', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { pattern: '^[^@]+@[^@]+\\.[^@]+$' } },
    { key: 'bio', label: 'Bio', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, validation: { minLength: 10, maxLength: 500 } },
    { key: 'optional', label: 'Optional', type: 'text', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true }
  ]
} as TableMetaWithOptions

describe('validateForm', () => {
  it('returns empty errors for valid create form', () => {
    const errors = validateForm(meta, { name: 'John', age: 25, email: 'john@example.com', bio: 'A long enough bio text' })
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('returns required error for missing required fields', () => {
    const errors = validateForm(meta, { name: '', age: null })
    expect(errors.name).toBe('Required')
    expect(errors.age).toBe('Required')
  })

  it('returns maxLength error for too-long string', () => {
    const errors = validateForm(meta, { name: 'A'.repeat(51), age: 25 })
    expect(errors.name).toBe('Max 50 characters')
  })

  it('returns minLength error for too-short string', () => {
    const errors = validateForm(meta, { name: 'John', age: 25, bio: 'short' })
    expect(errors.bio).toBe('Min 10 characters')
  })

  it('returns pattern error for invalid email', () => {
    const errors = validateForm(meta, { name: 'John', age: 25, email: 'not-an-email' })
    expect(errors.email).toBe('Invalid format')
  })

  it('returns min/max errors for number fields', () => {
    const errors = validateForm(meta, { name: 'John', age: -1 })
    expect(errors.age).toBe('Must be >= 0')
    const errors2 = validateForm(meta, { name: 'John', age: 200 })
    expect(errors2.age).toBe('Must be <= 150')
  })

  it('skips missing keys in update mode', () => {
    const errors = validateForm(meta, { name: 'John' }, 'update')
    expect(Object.keys(errors)).toHaveLength(0) // age not in form, skipped
  })

  it('allows empty values for non-required fields', () => {
    const errors = validateForm(meta, { name: 'John', age: 25, optional: '' })
    expect(errors.optional).toBeUndefined()
  })
})