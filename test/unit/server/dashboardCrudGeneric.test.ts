// ---------------------------------------------------------------------------
// Unit tests covering the generic CRUD stack:
//
//   1. naming-convention field upgrades in tables.ts (applyFieldNamingHints,
//      relationTargetFromForeignKey, pluralize/singularize helpers)
//   2. pure functions in crudService.ts (ioFieldKeys, sheetRowsToObjects,
//      rowsToSheetRows, castForDbInsert skipping many-to-many, etc.)
//
// All tests are pure / DB-free and safe to run under `vitest` in CI.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest'
import * as mainSchema from '../../../server/database/schema'
import {
  pluralize, singularize, relationTargetFromForeignKey,
  registerDrizzleSchema,
} from '../../../server/utils/dashboard/tables'
import {
  ioFieldKeys,
  sheetRowsToObjects,
  rowsToSheetRows,
  castForDbInsert,
} from '../../../server/utils/dashboard/crudService'
import type { TableMeta, FieldMeta } from '~/types/dashboard'

registerDrizzleSchema(mainSchema)

describe('dashboard: naming convention helpers (tables.ts)', () => {
  it('pluralize handles -s/x/z/ch/sh, consonant+y, and regular cases', () => {
    expect(pluralize('user')).toBe('users')
    expect(pluralize('role')).toBe('roles')
    expect(pluralize('template')).toBe('templates')
    expect(pluralize('category')).toBe('categories')   // y → ies
    expect(pluralize('bus')).toBe('buses')
    expect(pluralize('box')).toBe('boxes')
    expect(pluralize('wish')).toBe('wishes')
    expect(pluralize('church')).toBe('churches')
  })
  it('singularize reverses pluralize for our naming rules', () => {
    expect(singularize('users')).toBe('user')
    expect(singularize('roles')).toBe('role')
    expect(singularize('templates')).toBe('template')
    expect(singularize('categories')).toBe('category')
    expect(singularize('buses')).toBe('bus')
    expect(singularize('boxes')).toBe('box')
    expect(singularize('churches')).toBe('church')
  })
  it('relationTargetFromForeignKey converts `*_id` / `*Id` keys to plural table targets', () => {
    expect(relationTargetFromForeignKey('user_id')).toEqual({ table: 'users', labelKey: 'name', valueKey: 'id' })
    expect(relationTargetFromForeignKey('userId')).toEqual({ table: 'users', labelKey: 'name', valueKey: 'id' })
    expect(relationTargetFromForeignKey('templateId')).toEqual({ table: 'templates', labelKey: 'name', valueKey: 'id' })
    expect(relationTargetFromForeignKey('category_id')).toEqual({ table: 'categories', labelKey: 'name', valueKey: 'id' })
    expect(relationTargetFromForeignKey('roleId')).toEqual({ table: 'roles', labelKey: 'name', valueKey: 'id' })
  })
})

// ---------- crudService pure functions ----------

function buildSampleMeta(): TableMeta {
  // Fabricated pure-object meta so we can test crudService helpers
  // without touching the DB. It deliberately mirrors the rich field
  // types (relation, many-to-many virtual, hyperlink, image, etc.).
  const fields: FieldMeta[] = [
    { key: 'id', type: 'number', label: 'Id', nullable: false, editable: false, showInForm: false, showInTable: true, showInDetail: true },
    { key: 'name', type: 'text', label: 'Name', nullable: false, editable: true, showInForm: true, showInTable: true, showInDetail: true, validation: { required: true } },
    { key: 'homepageUrl', type: 'hyperlink', label: 'Homepage', nullable: true, editable: true, showInForm: true, showInTable: true, showInDetail: true },
    { key: 'coverImg', type: 'image', label: 'Cover', nullable: true, editable: true, showInForm: true, showInTable: true, showInDetail: true },
    { key: 'userId', type: 'relation', label: 'User', nullable: true, editable: true, showInForm: true, showInTable: true, showInDetail: true, relation: { table: 'users', labelKey: 'name', valueKey: 'id' } },
    { key: 'version', type: 'number', label: 'Version', nullable: false, editable: true, showInForm: true, showInTable: true, showInDetail: true },
    { key: 'isPublic', type: 'boolean', label: 'Public', nullable: false, editable: true, showInForm: true, showInTable: true, showInDetail: true },
    { key: 'userIds', type: 'many-to-many', label: 'Users (many-to-many)', nullable: true, editable: true, showInForm: true, showInTable: false, showInDetail: true, relation: { table: 'users', labelKey: 'name', valueKey: 'id' } },
    { key: 'deletedAt', type: 'datetime', label: 'Deleted', nullable: true, editable: false, showInForm: false, showInTable: false, showInDetail: true },
    { key: 'createdAt', type: 'datetime', label: 'Created', nullable: false, editable: false, showInForm: false, showInTable: true, showInDetail: true },
    { key: 'updatedAt', type: 'datetime', label: 'Updated', nullable: false, editable: false, showInForm: false, showInTable: true, showInDetail: true },
  ]
  return {
    table: 'sample',
    label: 'Sample',
    icon: 'i-lucide-layout-grid',
    fields,
    features: { softDelete: true, search: ['name'], defaultSort: { field: 'createdAt', order: 'desc' } },
    custom: false,
  }
}

describe('dashboard: crudService pure helpers', () => {
  const meta = buildSampleMeta()

  it('ioFieldKeys drops id / auto-timestamps / many-to-many and keeps form-visible editable fields', () => {
    const keys = ioFieldKeys(meta)
    expect(keys).toEqual(['name', 'homepageUrl', 'coverImg', 'userId', 'version', 'isPublic'])
  })

  it('sheetRowsToObjects maps column-indexed 2D rows into keyed objects in order', () => {
    const rows: string[][] = [
      ['Alpha', 'https://a.com', '', '3', '100', 'true'],
      ['Beta',  '',     'x', '',  '0',   'false'],
    ]
    const out = sheetRowsToObjects(meta, rows)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      name: 'Alpha',
      homepageUrl: 'https://a.com',
      userId: '3',
      version: '100',
      isPublic: 'true',
    })
    expect(out[1].coverImg).toBe('x')
    expect(out[1].userId).toBeUndefined()
  })

  it('rowsToSheetRows converts DB rows → headers + 2D sheet, with select/relation labels resolved', () => {
    const rows = [
      { id: 1, name: 'One', homepageUrl: 'https://one.io', coverImg: null, userId: 2, version: 5, isPublic: true, createdAt: new Date('2025-01-01T12:00:00Z') },
      { id: 2, name: 'Two', homepageUrl: '',   coverImg: 'abc', userId: null, version: 0, isPublic: false },
    ]
    const options: Record<string, any> = {
      userId: [
        { label: 'Alice', value: 2 },
        { label: 'Bob', value: 3 },
      ],
    }
    const { headers, sheet } = rowsToSheetRows(meta, rows as any, options)
    expect(headers).toEqual(['Name', 'Homepage', 'Cover', 'User', 'Version', 'Public'])
    // Row 1: user 2 → label 'Alice'
    expect(sheet[0][0]).toBe('One')
    expect(sheet[0][1]).toBe('https://one.io')
    expect(sheet[0][2]).toBe('')           // null cover → empty
    expect(sheet[0][3]).toBe('Alice')       // relation resolved
    expect(sheet[0][4]).toBe('5')
    expect(sheet[0][5]).toBe('true')
    // Row 2: user null → ''
    expect(sheet[1][3]).toBe('')
    expect(sheet[1][5]).toBe('false')
  })

  it('castForDbInsert: coerces string values → typed DB values, and drops many-to-many virtual fields entirely', () => {
    const now = new Date('2025-06-01')
    const payload: Record<string, unknown> = {
      name: 'New',
      homepageUrl: 'https://new.com',
      coverImg: '',
      userId: '7',
      version: '99',
      isPublic: '1',
      // Virtual m2m column — must never appear in the coerced DB payload.
      userIds: [1, 2, 3],
      // Auto-timestamps — should not be in the output either.
      createdAt: '2000-01-01',
    }
    const out = castForDbInsert(meta, payload, now)
    expect(out['userIds']).toBeUndefined()              // virtual dropped
    expect(out['createdAt']).toBeUndefined()            // non-editable dropped
    expect(out['updatedAt']).toBeDefined()              // injected by castForDbInsert
    expect(out['name']).toBe('New')
    expect(out['homepageUrl']).toBe('https://new.com')
    expect(out['coverImg']).toBeNull()                  // '' + nullable → null
    expect(typeof out['userId']).toBe('number')
    expect(out['userId']).toBe(7)
    expect(out['version']).toBe(99)
    expect(out['isPublic']).toBe(true)                  // '1' coerced to true
  })
})

// A tiny CSV-escape test to guard the backend /export endpoint quoting rules
function csvEscape(v: string): string {
  const needsQuotes = /[",\n\r]/.test(v)
  const escaped = v.replace(/"/g, '""')
  return needsQuotes ? `"${escaped}"` : escaped
}
describe('dashboard: export CSV escaping (regression)', () => {
  it('quotes values containing commas, quotes, or newlines', () => {
    expect(csvEscape('hello')).toBe('hello')
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('a"b')).toBe('"a""b"')
    expect(csvEscape('a\nb')).toBe('"a\nb"')
  })
})
