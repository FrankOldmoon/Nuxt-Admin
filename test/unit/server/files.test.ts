import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildChain } from '../../helpers/db'

const h = vi.hoisted(() => {
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
  return { db }
})

vi.mock('../../../server/utils/db', () => ({ db: h.db, schema: {}, pool: {} }))

import {
  listFiles,
  listFilesPaged,
  findFileById,
  findFileByHashForDedup,
  findFileByPath,
  createFileRecord,
  updateFileRecord,
  deleteFileRecord,
  softDeleteFiles,
  restoreFiles,
  permanentDeleteFiles,
  toPublicFile
} from '../../../server/utils/files'

const fileRow = {
  id: 1,
  userId: 5,
  filename: 'f-abc.txt',
  originalName: 'hello.txt',
  hash: 'deadbeef',
  mimeType: 'text/plain',
  size: 12,
  path: '/data/f-abc.txt',
  storage: 'local',
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
}

// FIFO queue: each select call takes the head result
let selectResults: unknown[] = []
let insertResult: unknown[] = []
let insertValues: any[] = []
let updateResult: unknown[] = []
let updateSets: any[] = []
let deleteResult: unknown[] = []

beforeEach(() => {
  selectResults = []
  insertResult = []
  insertValues = []
  updateResult = []
  updateSets = []
  deleteResult = []
  h.db.select.mockReset().mockImplementation(() => buildChain(selectResults.shift() ?? []))
  h.db.insert.mockReset().mockImplementation(() => ({
    values: (v: any) => {
      insertValues.push(v)
      return buildChain(insertResult)
    }
  }) as any)
  h.db.update.mockReset().mockImplementation(() => ({
    set: (s: any) => {
      updateSets.push(s)
      return buildChain(updateResult)
    }
  }) as any)
  h.db.delete.mockReset().mockImplementation(() => buildChain(deleteResult))
})

describe('listFiles', () => {
  it('admin returns all file rows', async () => {
    selectResults = [[fileRow, { ...fileRow, id: 2 }]]
    const rows = await listFiles(1, true)
    expect(rows).toHaveLength(2)
    expect(h.db.select).toHaveBeenCalledTimes(1)
  })

  it('a regular user also selects rows (with a userId filter)', async () => {
    selectResults = [[fileRow]]
    const rows = await listFiles(5, false)
    expect(rows).toEqual([fileRow])
  })
})

describe('listFilesPaged', () => {
  it('returns paged rows and the total', async () => {
    selectResults = [[fileRow], [{ value: 42 }]]
    const { rows, total } = await listFilesPaged(5, false, 0, 20)
    expect(rows).toEqual([fileRow])
    expect(total).toBe(42)
  })

  it('total is 0 when the count row is missing', async () => {
    selectResults = [[], []]
    const { rows, total } = await listFilesPaged(5, false, 0, 20)
    expect(rows).toEqual([])
    expect(total).toBe(0)
  })

  it('does not throw with filter and sort params', async () => {
    selectResults = [[fileRow], [{ value: 1 }]]
    const { total } = await listFilesPaged(5, false, 0, 20, true, {
      search: 'hello',
      mimeType: 'text',
      sizeMin: '1',
      sizeMax: '100'
    }, { field: 'size', order: 'asc' })
    expect(total).toBe(1)
  })
})

describe('findFileById / findFileByHashForDedup / findFileByPath', () => {
  it('finds a row by id', async () => {
    selectResults = [[fileRow]]
    expect(await findFileById(1)).toEqual(fileRow)
  })

  it('returns null when not found by id', async () => {
    selectResults = [[]]
    expect(await findFileById(999)).toBeNull()
  })

  it('finds a row by hash, null when not found', async () => {
    selectResults = [[fileRow]]
    expect(await findFileByHashForDedup('deadbeef', 5)).toEqual(fileRow)
    selectResults = [[]]
    expect(await findFileByHashForDedup('missing', 5)).toBeNull()
  })

  it('finds a row by path, null when not found', async () => {
    selectResults = [[fileRow]]
    expect(await findFileByPath('/data/f-abc.txt')).toEqual(fileRow)
    selectResults = [[]]
    expect(await findFileByPath('/nope')).toBeNull()
  })
})

describe('createFileRecord', () => {
  it('uses defaults for omitted fields (mimeType null, size 0, storage local)', async () => {
    insertResult = [fileRow]
    const row = await createFileRecord(5, {
      filename: 'f-abc.txt',
      originalName: 'hello.txt',
      hash: 'deadbeef',
      path: '/data/f-abc.txt'
    })
    expect(row).toEqual(fileRow)
    expect(insertValues[0]).toMatchObject({
      userId: 5,
      filename: 'f-abc.txt',
      originalName: 'hello.txt',
      hash: 'deadbeef',
      mimeType: null,
      size: 0,
      path: '/data/f-abc.txt',
      storage: 'local'
    })
  })

  it('passes through all explicit fields', async () => {
    insertResult = [fileRow]
    await createFileRecord(7, {
      filename: 'a.bin',
      originalName: 'a.bin',
      hash: 'h1',
      mimeType: 'application/octet-stream',
      size: 99,
      path: '/x/a.bin',
      storage: 's3'
    })
    expect(insertValues[0]).toMatchObject({
      userId: 7,
      mimeType: 'application/octet-stream',
      size: 99,
      storage: 's3'
    })
  })

  it('throws when insert returns no row', async () => {
    insertResult = []
    await expect(createFileRecord(5, {
      filename: 'a', originalName: 'a', hash: 'h', path: '/a'
    })).rejects.toThrow('Failed to create file record')
  })
})

describe('updateFileRecord', () => {
  it('skips update for empty input and re-queries the existing row', async () => {
    selectResults = [[fileRow]]
    const row = await updateFileRecord(1, {})
    expect(row).toEqual(fileRow)
    expect(h.db.update).not.toHaveBeenCalled()
    expect(h.db.select).toHaveBeenCalledTimes(1)
  })

  it('updates some fields and stamps updatedAt', async () => {
    updateResult = [{ ...fileRow, filename: 'renamed.txt' }]
    const row = await updateFileRecord(1, { filename: 'renamed.txt' })
    expect(row).toMatchObject({ filename: 'renamed.txt' })
    expect(updateSets[0].filename).toBe('renamed.txt')
    expect(updateSets[0].updatedAt).toBeInstanceOf(Date)
  })

  it('returns null when no row matches', async () => {
    updateResult = []
    expect(await updateFileRecord(999, { size: 1 })).toBeNull()
  })
})

describe('deleteFileRecord', () => {
  it('deletes successfully and returns true', async () => {
    deleteResult = [{ id: 1 }]
    expect(await deleteFileRecord(1)).toBe(true)
  })

  it('returns false when the record does not exist', async () => {
    deleteResult = []
    expect(await deleteFileRecord(999)).toBe(false)
  })
})

describe('softDeleteFiles', () => {
  it('returns 0 for an empty array without accessing the database', async () => {
    expect(await softDeleteFiles([])).toBe(0)
    expect(h.db.update).not.toHaveBeenCalled()
  })

  it('bulk soft-delete returns the affected row count and sets timestamps', async () => {
    updateResult = [{ id: 1 }, { id: 2 }]
    expect(await softDeleteFiles([1, 2])).toBe(2)
    expect(updateSets[0].deletedAt).toBeInstanceOf(Date)
    expect(updateSets[0].updatedAt).toBeInstanceOf(Date)
  })
})

describe('restoreFiles', () => {
  it('returns 0 for an empty array', async () => {
    expect(await restoreFiles([])).toBe(0)
    expect(h.db.update).not.toHaveBeenCalled()
  })

  it('bulk restore clears deletedAt and returns the row count', async () => {
    updateResult = [{ id: 3 }]
    expect(await restoreFiles([3])).toBe(1)
    expect(updateSets[0].deletedAt).toBeNull()
  })
})

describe('permanentDeleteFiles', () => {
  it('returns 0 for an empty array', async () => {
    expect(await permanentDeleteFiles([])).toBe(0)
    expect(h.db.delete).not.toHaveBeenCalled()
  })

  it('bulk permanent delete returns the row count', async () => {
    deleteResult = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(await permanentDeleteFiles([1, 2, 3])).toBe(3)
  })
})

describe('toPublicFile', () => {
  it('maps all public fields', () => {
    const pub = toPublicFile(fileRow)
    expect(pub).toEqual({
      id: 1,
      userId: 5,
      filename: 'f-abc.txt',
      originalName: 'hello.txt',
      hash: 'deadbeef',
      mimeType: 'text/plain',
      size: 12,
      path: '/data/f-abc.txt',
      storage: 'local',
      deletedAt: null,
      createdAt: fileRow.createdAt,
      updatedAt: fileRow.updatedAt
    })
  })
})
