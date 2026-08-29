import { describe, it, expect, beforeEach } from 'vitest'
import { registerFieldTransform, getFieldTransform, applyFieldGetter, applyFieldSetter } from '../../../app/composables/useFieldTransform'

describe('useFieldTransform', () => {
  beforeEach(() => {
    // Clear registry by re-registering only known transforms
    // We test in isolation by not registering anything by default
  })

  it('registerFieldTransform and getFieldTransform', () => {
    registerFieldTransform('currency', {
      getter: (v) => (typeof v === 'number' ? `¥${v.toFixed(2)}` : v),
      setter: (v) => (typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : v)
    })
    const t = getFieldTransform('currency')
    expect(t).toBeDefined()
    expect(t!.getter).toBeTypeOf('function')
    expect(t!.setter).toBeTypeOf('function')
  })

  it('getFieldTransform returns undefined for unknown key', () => {
    expect(getFieldTransform('unknown')).toBeUndefined()
  })

  it('getFieldTransform returns undefined for undefined key', () => {
    expect(getFieldTransform(undefined)).toBeUndefined()
  })

  it('applyFieldGetter transforms value', () => {
    registerFieldTransform('double', { getter: (v) => (typeof v === 'number' ? v * 2 : v) })
    expect(applyFieldGetter('double', 5)).toBe(10)
  })

  it('applyFieldGetter returns raw value when no getter registered', () => {
    expect(applyFieldGetter('nonexistent', 'hello')).toBe('hello')
  })

  it('applyFieldGetter returns raw value on getter error', () => {
    registerFieldTransform('broken', { getter: () => { throw new Error('oops') } })
    expect(applyFieldGetter('broken', 'fallback')).toBe('fallback')
  })

  it('applyFieldSetter transforms value', () => {
    registerFieldTransform('trim', { setter: (v) => (typeof v === 'string' ? v.trim() : v) })
    expect(applyFieldSetter('trim', '  hello  ')).toBe('hello')
  })

  it('applyFieldSetter returns raw value when no setter registered', () => {
    expect(applyFieldSetter('nonexistent', 'hello')).toBe('hello')
  })

  it('applyFieldSetter returns raw value on setter error', () => {
    registerFieldTransform('broken', { setter: () => { throw new Error('oops') } })
    expect(applyFieldSetter('broken', 'fallback')).toBe('fallback')
  })
})