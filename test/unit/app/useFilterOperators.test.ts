import { describe, it, expect } from 'vitest'
import { useFilterOperators } from '../../../app/composables/useFilterOperators'
import type { FieldType, FilterOperatorMeta } from '../../../app/types/dashboard'

const { getOperatorsForType, isFilterable, FIELD_TYPE_OPERATORS } = useFilterOperators()

const opsOf = (type: FieldType) => getOperatorsForType(type).map(m => m.op)
const byOp = (ops: FilterOperatorMeta[]) =>
  Object.fromEntries(ops.map(m => [m.op, m])) as Record<string, FilterOperatorMeta>

describe('useFilterOperators', () => {
  it('text-like field types share the same text operator set', () => {
    for (const type of ['text', 'textarea', 'hyperlink', 'image'] as FieldType[]) {
      expect(opsOf(type)).toEqual([
        'contains', 'notContains', 'eq', 'neq', 'startsWith', 'endsWith',
        'isEmpty', 'isNotEmpty', 'isNull', 'isNotNull',
      ])
    }
    // text / textarea / hyperlink / image reuse the same reference to avoid duplicate definitions
    expect(getOperatorsForType('text')).toBe(getOperatorsForType('textarea'))
    expect(getOperatorsForType('hyperlink')).toBe(getOperatorsForType('image'))
  })

  it('text operators expose the correct needsValue / valueKind metadata', () => {
    const map = byOp(getOperatorsForType('text'))
    expect(map.contains).toEqual({ op: 'contains', label: 'Contains', needsValue: true, valueKind: 'text' })
    expect(map.eq.needsValue).toBe(true)
    expect(map.startsWith.valueKind).toBe('text')
    // operators that need no value carry no valueKind
    expect(map.isEmpty.needsValue).toBe(false)
    expect(map.isEmpty.valueKind).toBeUndefined()
    expect(map.isNull.needsValue).toBe(false)
  })

  it('number provides comparison and range operators (numeric input)', () => {
    const map = byOp(getOperatorsForType('number'))
    expect(opsOf('number')).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'isNull', 'isNotNull'])
    expect(map.gt.valueKind).toBe('number')
    expect(map.between.valueKind).toBe('between')
    expect(map.isNull.needsValue).toBe(false)
  })

  it('relation and select render as dropdown select inputs', () => {
    for (const type of ['relation', 'select'] as FieldType[]) {
      expect(opsOf(type)).toEqual(['eq', 'neq', 'isNull', 'isNotNull'])
      expect(byOp(getOperatorsForType(type)).eq.valueKind).toBe('select')
    }
  })

  it('boolean only offers equals/not-equals (boolean input)', () => {
    const ops = getOperatorsForType('boolean')
    expect(opsOf('boolean')).toEqual(['eq', 'neq'])
    expect(ops.every(m => m.valueKind === 'boolean')).toBe(true)
  })

  it('date uses a date input and between is a range input', () => {
    const map = byOp(getOperatorsForType('date'))
    expect(opsOf('date')).toEqual(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'isNull', 'isNotNull'])
    expect(map.eq.valueKind).toBe('date')
    expect(map.between.valueKind).toBe('between')
    expect(map.isNull.valueKind).toBeUndefined()
  })

  it('datetime keeps the date operators but swaps in datetime input', () => {
    const map = byOp(getOperatorsForType('datetime'))
    expect(opsOf('datetime')).toEqual(opsOf('date'))
    expect(map.eq.valueKind).toBe('datetime')
    expect(map.lt.valueKind).toBe('datetime')
    expect(map.between.valueKind).toBe('between')
    expect(map.isNull.needsValue).toBe(false)
  })

  it('tags use "Contains tag / Does not contain tag" labels', () => {
    const map = byOp(getOperatorsForType('tags'))
    expect(map.contains.label).toBe('Contains tag')
    expect(map.notContains.label).toBe('Does not contain tag')
    expect(opsOf('tags')).toEqual(['contains', 'notContains', 'isEmpty', 'isNotEmpty'])
  })

  it('json supports text contains plus null/empty checks', () => {
    expect(opsOf('json')).toEqual(['contains', 'notContains', 'isEmpty', 'isNotEmpty', 'isNull', 'isNotNull'])
  })

  it('password keeps only contains/equals/not-equals and exposes no column state', () => {
    expect(opsOf('password')).toEqual(['contains', 'eq', 'neq'])
  })

  it('many-to-many exposes no operators and is not filterable', () => {
    expect(getOperatorsForType('many-to-many')).toEqual([])
    expect(isFilterable('many-to-many')).toBe(false)
  })

  it('unknown types fall back to text operators', () => {
    expect(getOperatorsForType('unknown-type' as FieldType)).toEqual(getOperatorsForType('text'))
  })

  it('isFilterable returns true for all remaining regular types', () => {
    const filterable: FieldType[] = [
      'text', 'textarea', 'password', 'hyperlink', 'image', 'number',
      'relation', 'boolean', 'date', 'datetime', 'select', 'tags', 'json',
    ]
    for (const t of filterable) expect(isFilterable(t)).toBe(true)
  })

  it('FIELD_TYPE_OPERATORS covers every FieldType with complete, duplicate-free metadata', () => {
    const allTypes: FieldType[] = [
      'text', 'textarea', 'number', 'boolean', 'date', 'datetime', 'select',
      'image', 'hyperlink', 'tags', 'password', 'relation', 'json', 'many-to-many',
    ]
    for (const t of allTypes) expect(FIELD_TYPE_OPERATORS[t]).toBeDefined()

    for (const [type, ops] of Object.entries(FIELD_TYPE_OPERATORS)) {
      for (const m of ops) {
        expect(m.label, `${type}/${m.op} should have a label`).toBeTruthy()
        expect(typeof m.needsValue).toBe('boolean')
      }
      expect(new Set(ops.map(m => m.op)).size).toBe(ops.length)
    }
  })
})
