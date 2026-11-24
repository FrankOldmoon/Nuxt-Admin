import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import type { FieldMeta, TableMeta } from '~/types/dashboard'
import { useExcelExport } from '../../../app/composables/useExcelExport'

const { toastAdd, mockFetch, mockXlsx } = vi.hoisted(() => ({
  toastAdd: vi.fn(), mockFetch: vi.fn(),
  mockXlsx: { utils: { json_to_sheet: vi.fn(() => ({ '!ref': 'A1:D3' })), book_new: vi.fn(() => ({ wb: true })), book_append_sheet: vi.fn() }, writeFile: vi.fn() }
}))
vi.mock('xlsx', () => mockXlsx)

function makeField(partial: Partial<FieldMeta> & Pick<FieldMeta, 'key' | 'label' | 'type'>): FieldMeta {
  return {
    nullable: true,
    showInForm: true,
    showInTable: true,
    showInDetail: true,
    editable: true,
    ...partial
  }
}

const meta: TableMeta = {
  table: 'users',
  label: 'Users',
  icon: 'i-heroicons-users',
  custom: false,
  features: { softDelete: true, search: ['name'] },
  fields: [
    makeField({ key: 'id', label: 'ID', type: 'number' }),
    makeField({ key: 'name', label: 'Name', type: 'text' }),
    makeField({ key: 'password', label: 'Password', type: 'password', showInTable: false }), // not in the header
    makeField({ key: 'roles', label: 'Roles', type: 'many-to-many' }), // not in the header
    makeField({ key: 'createdAt', label: 'Created at', type: 'datetime' }),
    makeField({ key: 'note', label: 'Note', type: 'textarea' })
  ]
}

const HEADERS = ['ID', 'Name', 'Created at', 'Note']

const rows = [
  { id: 1, name: 'Alice', password: 'x', roles: [1], createdAt: '2026-01-02T03:04:05.000Z', note: null },
  { id: 2, name: 'Bob', password: 'y', roles: [], createdAt: null, note: 'hello' }
]

const okResponse = (items: unknown[]) => ({ ok: true, json: async () => items })

describe('useExcelExport', () => {
  beforeEach(() => {
    toastAdd.mockReset()
    mockFetch.mockReset()
    mockXlsx.utils.json_to_sheet.mockClear()
    mockXlsx.utils.book_new.mockClear()
    mockXlsx.utils.book_append_sheet.mockClear()
    mockXlsx.writeFile.mockClear()
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('useToast', () => ({ add: toastAdd }))
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    vi.stubGlobal('extractErrorMessage', (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback)
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exports successfully: fetches all data, maps by showInTable fields, writes xlsx and shows a success toast', async () => {
    mockFetch.mockResolvedValue(okResponse(rows))
    const { exporting, exportTableExcel } = useExcelExport()

    await exportTableExcel(meta, '/api/dashboard/data/users')

    // Use the authorized export endpoint, not a capped list request.
    expect(mockFetch).toHaveBeenCalledWith('/api/dashboard/data/users/export?format=json', { credentials: 'include' })

    // mapped result: datetime -> toLocaleString, null -> empty string, only showInTable and non-many-to-many fields
    const expected = [
      { 'ID': 1, 'Name': 'Alice', 'Created at': new Date('2026-01-02T03:04:05.000Z').toLocaleString(), 'Note': '' },
      { 'ID': 2, 'Name': 'Bob', 'Created at': '', 'Note': 'hello' }
    ]
    expect(mockXlsx.utils.json_to_sheet).toHaveBeenCalledWith(expected, { header: HEADERS })
    expect(mockXlsx.utils.book_append_sheet).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Users')
    expect(mockXlsx.writeFile).toHaveBeenCalledWith(expect.anything(), `users-${new Date().toISOString().slice(0, 10)}.xlsx`)
    expect(toastAdd).toHaveBeenCalledWith({ title: 'dashboard.excel.exportOk', color: 'success' })
    expect(exporting.value).toBe(false)
  })

  it('appends filter and trash params to the query string, ignoring empty filters', async () => {
    mockFetch.mockResolvedValue(okResponse([]))
    const { exportTableExcel } = useExcelExport()

    await exportTableExcel(meta, '/api/dashboard/data/users', { q: 'admin', role: '' }, true)

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/dashboard/data/users/export?format=json&trashed=true&q=admin',
      { credentials: 'include' }
    )
  })

  it('uses a custom row mapping when mapRow is provided', async () => {
    mockFetch.mockResolvedValue(okResponse(rows))
    const { exportTableExcel } = useExcelExport()
    const mapRow = vi.fn((row: Record<string, unknown>) => ({ username: row.name }))

    await exportTableExcel(meta, '/api/dashboard/data/users', {}, false, mapRow)

    expect(mapRow).toHaveBeenCalledTimes(2)
    expect(mockXlsx.utils.json_to_sheet).toHaveBeenCalledWith(
      [{ username: 'Alice' }, { username: 'Bob' }],
      { header: HEADERS } // the header still comes from meta.fields
    )
  })

  it('preserves advanced filters and sort order in the export request', async () => {
    mockFetch.mockResolvedValue(okResponse([]))
    const { exportTableExcel } = useExcelExport()
    const conditions = [{ logic: 'AND' as const, field: 'name', op: 'contains' as const, value: 'Alice' }]
    await exportTableExcel(meta, '/api/dashboard/data/users', {}, false, undefined, conditions, { field: 'id', order: 'desc' })
    const url = new URL(mockFetch.mock.calls[0]![0], 'http://local')
    expect(url.searchParams.get('conditions')).toBe(JSON.stringify(conditions))
    expect(url.searchParams.get('sort')).toBe('id')
    expect(url.searchParams.get('order')).toBe('desc')
  })

  it('maps relation IDs to the same labels shown by the table', async () => {
    mockFetch.mockResolvedValue(okResponse([{ classId: 2 }]))
    const { exportTableExcel } = useExcelExport()
    await exportTableExcel({ ...meta, fields: [makeField({ key: 'classId', label: 'Class', type: 'relation' })], relationOptions: { classId: [{ value: 2, label: '1A' }] } }, '/api/dashboard/data/students')
    expect(mockXlsx.utils.json_to_sheet).toHaveBeenCalledWith([{ Class: '1A' }], { header: ['Class'] })
  })

  it('on a non-2xx API response, uses the response text as the error toast', async () => {
    mockFetch.mockResolvedValue({ ok: false, statusText: 'Internal Server Error', text: async () => 'Backend unavailable' })
    const { exporting, exportTableExcel } = useExcelExport()

    await exportTableExcel(meta, '/api/dashboard/data/users')

    expect(toastAdd).toHaveBeenCalledWith({ title: 'Backend unavailable', color: 'error' })
    expect(mockXlsx.writeFile).not.toHaveBeenCalled()
    expect(exporting.value).toBe(false)
  })

  it('exporting is true during export and resets afterwards', async () => {
    let resolveFetch!: (v: unknown) => void
    mockFetch.mockImplementation(() => new Promise((r) => {
      resolveFetch = r
    }))
    const { exporting, exportTableExcel } = useExcelExport()

    const pending = exportTableExcel(meta, '/api/dashboard/data/users')
    await new Promise(r => setTimeout(r, 0))
    expect(exporting.value).toBe(true)

    resolveFetch(okResponse([]))
    await pending
    expect(exporting.value).toBe(false)
  })

  it('truncates an over-long sheet name to 31 chars and falls back to the table name when label is empty', async () => {
    mockFetch.mockResolvedValue(okResponse(rows))
    const { exportTableExcel } = useExcelExport()

    const longLabel = 'VeryLongSheetNameForTruncationTest'.repeat(2)
    await exportTableExcel({ ...meta, label: longLabel }, '/api/dashboard/data/users')
    expect(mockXlsx.utils.book_append_sheet).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), longLabel.slice(0, 31))

    await exportTableExcel({ ...meta, label: '' }, '/api/dashboard/data/users')
    expect(mockXlsx.utils.book_append_sheet).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 'users')
  })
})
