// ---------------------------------------------------------------------------
// Tests for the templates showcase additions:
//   1. tags round-trip — `coerceTags` normalises array / JSON-string /
//      comma-separated values into a real array, so a single "new,hot" tag
//      can never be stored or rendered.
//   2. `castForDbInsert` coerces a `tags` field to an array (not a string),
//      `date`/`datetime` to Date, and `time` to a string.
//   3. the table list-override registry auto-loads `./tableOverrides/*.ts`
//      and maps a table name → its override (templates included).
// All pure / DB-free. ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest'
import {
  coerceTags,
  castForDbInsert,
} from '../../../server/utils/dashboard/crudService'
import {
  getTableListOverride,
} from '../../../server/utils/dashboard/tableOverrides'
import type { TableMeta, FieldMeta } from '~/types/dashboard'

describe('templates: tags coercion (coerceTags)', () => {
  it('keeps arrays as-is (stringified)', () => {
    expect(coerceTags(['new', 'hot'])).toEqual(['new', 'hot'])
    expect(coerceTags([])).toEqual([])
  })

  it('parses a JSON-array string into two tags', () => {
    expect(coerceTags('["new","hot"]')).toEqual(['new', 'hot'])
  })

  it('splits a comma/space separated string instead of returning one tag', () => {
    expect(coerceTags('new,hot')).toEqual(['new', 'hot'])
    expect(coerceTags('new hot sale')).toEqual(['new', 'hot', 'sale'])
    expect(coerceTags('new，hot')).toEqual(['new', 'hot']) // full-width comma
  })

  it('handles empty / junk input gracefully', () => {
    expect(coerceTags('')).toEqual([])
    expect(coerceTags(null)).toEqual([])
    expect(coerceTags(undefined)).toEqual([])
    expect(coerceTags(42)).toEqual([])
  })
})

describe('templates: castForDbInsert coercion', () => {
  function meta(): TableMeta {
    const fields: FieldMeta[] = [
      { key: 'name', type: 'text', label: 'Name', nullable: false, editable: true, showInForm: true, showInTable: true, showInDetail: true, validation: { required: true } },
      { key: 'tags', type: 'tags', label: 'Tags', nullable: false, editable: true, showInForm: true, showInTable: true, showInDetail: true },
      { key: 'releasedAt', type: 'datetime', label: 'Released At', nullable: true, editable: true, showInForm: true, showInTable: true, showInDetail: true },
      { key: 'launchDate', type: 'date', label: 'Launch Date', nullable: true, editable: true, showInForm: true, showInTable: true, showInDetail: true },
      { key: 'openingTime', type: 'time', label: 'Opening Time', nullable: true, editable: true, showInForm: true, showInTable: true, showInDetail: true },
    ]
    return {
      table: 'templates',
      label: 'Templates',
      icon: 'i-lucide-file-text',
      fields,
      features: { softDelete: false, search: ['name'] },
      custom: false,
    }
  }

  it('stores a tags array as an array, not a "new,hot" string', () => {
    const out = castForDbInsert(meta(), { tags: ['new', 'hot'] }, new Date())
    expect(out.tags).toEqual(['new', 'hot'])
    expect(typeof out.tags).toBe('object')
  })

  it('normalises a comma string payload before insert', () => {
    const out = castForDbInsert(meta(), { tags: 'new,hot' }, new Date())
    expect(out.tags).toEqual(['new', 'hot'])
  })

  it('coerces date/datetime to Date objects and time to a string', () => {
    const out = castForDbInsert(meta(), {
      releasedAt: '2026-08-01T12:00:00.000Z',
      launchDate: '2026-08-01',
      openingTime: '14:30:00',
    }, new Date())
    expect(out.releasedAt).toBeInstanceOf(Date)
    expect(out.launchDate).toBeInstanceOf(Date)
    expect(out.openingTime).toBe('14:30:00')
  })

  it('round-trips a real array from the form (update path)', () => {
    const out = castForDbInsert(meta(), { tags: ['new', 'hot', 'sale'] }, new Date())
    expect(out.tags).toEqual(['new', 'hot', 'sale'])
  })
})

describe('templates: table list-override registry', () => {
  it('registers the templates override via the folder glob', () => {
    expect(getTableListOverride('templates')).toBeDefined()
    expect(getTableListOverride('templates')?.table).toBe('templates')
    expect(typeof getTableListOverride('templates')?.list).toBe('function')
  })

  it('returns undefined for unregistered tables', () => {
    expect(getTableListOverride('does-not-exist')).toBeUndefined()
  })
})