import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { buildChain } from '../../helpers/db'
import {
  calculateHash,
  getDayNumber,
  getAbsolutePath,
  isPreviewable,
  formatContentDisposition,
  buildStoragePath,
  saveToStorage,
  fileExists,
  createStorageStream,
  getFileSize
} from '../../../server/utils/fileStorage'

const db = vi.hoisted(() => {
  const chain = (final: unknown) => new Proxy(function () {}, {
    get: (_t, prop) => prop === 'then'
      ? (res: (v: unknown) => void) => Promise.resolve(final).then(res)
      : () => chain(final),
    apply: () => chain(final)
  })
  return {
    select: vi.fn(() => chain([])),
    insert: vi.fn(() => chain([])),
    update: vi.fn(() => chain([])),
    delete: vi.fn(() => chain([]))
  }
})
vi.mock('../../../server/utils/db', () => ({ db, schema: {}, pool: {} }))

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  stat: vi.fn(),
  createReadStream: vi.fn(() => 'MOCK_STREAM')
}))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, mkdir: fsMocks.mkdir, writeFile: fsMocks.writeFile, stat: fsMocks.stat }
})
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, createReadStream: fsMocks.createReadStream }
})

describe('calculateHash', () => {
  it('returns a SHA-256 hex hash', () => {
    const h = calculateHash(Buffer.from('hello'))
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('same input yields the same hash, different input differs', () => {
    expect(calculateHash(Buffer.from('abc'))).toBe(calculateHash(Buffer.from('abc')))
    expect(calculateHash(Buffer.from('abc'))).not.toBe(calculateHash(Buffer.from('abd')))
  })
})

describe('getDayNumber', () => {
  it('2026-01-01 is day 1', () => {
    expect(getDayNumber(new Date('2026-01-01T00:00:00Z'))).toBe(1)
  })

  it('2026-01-02 is day 2', () => {
    expect(getDayNumber(new Date('2026-01-02T00:00:00Z'))).toBe(2)
  })
})

describe('getAbsolutePath', () => {
  const storageDir = resolve(process.cwd(), 'storage')

  it('prefixes a normal relative path correctly', () => {
    expect(getAbsolutePath('1/2.txt')).toBe(resolve(storageDir, '1/2.txt'))
  })

  it('blocks path traversal', () => {
    expect(() => getAbsolutePath('../../../etc/passwd')).toThrow('Invalid storage path')
    expect(() => getAbsolutePath('..')).toThrow()
  })
})

describe('isPreviewable', () => {
  it('images/video/text/PDF are previewable', () => {
    expect(isPreviewable('image/png')).toBe(true)
    expect(isPreviewable('video/mp4')).toBe(true)
    expect(isPreviewable('text/plain')).toBe(true)
    expect(isPreviewable('application/pdf')).toBe(true)
    expect(isPreviewable('application/json')).toBe(true)
  })

  it('binary and empty values are not previewable', () => {
    expect(isPreviewable('application/octet-stream')).toBe(false)
    expect(isPreviewable(null)).toBe(false)
    expect(isPreviewable('')).toBe(false)
  })
})

describe('formatContentDisposition', () => {
  it('ASCII filenames use RFC 5987 encoding', () => {
    expect(formatContentDisposition('attachment', 'a.txt'))
      .toBe('attachment; filename="a.txt"; filename*=UTF-8\'\'a.txt')
  })

  it('non-ASCII filenames are replaced and encoded', () => {
    expect(formatContentDisposition('inline', '中文文件.png'))
      .toContain('filename="____.png"')
      .toContain("filename*=UTF-8''%E4%B8%AD%E6%96%87%E6%96%87%E4%BB%B6.png")
  })
})

describe('buildStoragePath', () => {
  it('uses the content hash as the file name', async () => {
    const p = await buildStoragePath('photo.jpg', 'abc123')
    expect(p).toBe(`${getDayNumber()}/abc123.jpg`)
  })
})

describe('saveToStorage', () => {
  const storageDir = resolve(process.cwd(), 'storage')

  beforeEach(() => {
    fsMocks.mkdir.mockClear()
    fsMocks.writeFile.mockClear()
  })

  it('recursively creates the dir then writes the buffer to the absolute path', async () => {
    const buf = Buffer.from('file-content')
    await saveToStorage(buf, '3/7.png')
    expect(fsMocks.mkdir).toHaveBeenCalledWith(resolve(storageDir, '3'), { recursive: true })
    expect(fsMocks.writeFile).toHaveBeenCalledWith(resolve(storageDir, '3/7.png'), buf)
  })

  it('writes directly for files at the root', async () => {
    const buf = Buffer.from('x')
    await saveToStorage(buf, 'a.txt')
    expect(fsMocks.writeFile).toHaveBeenCalledWith(resolve(storageDir, 'a.txt'), buf)
  })
})

describe('fileExists', () => {
  beforeEach(() => fsMocks.stat.mockReset())

  it('returns true when stat succeeds', async () => {
    fsMocks.stat.mockResolvedValue({ size: 10 })
    expect(await fileExists('1/2.txt')).toBe(true)
    expect(fsMocks.stat).toHaveBeenCalledWith(resolve(resolve(process.cwd(), 'storage'), '1/2.txt'))
  })

  it('returns false when stat throws (file missing)', async () => {
    fsMocks.stat.mockImplementationOnce(() => { throw new Error('ENOENT') })
    expect(await fileExists('1/missing.txt')).toBe(false)
  })
})

describe('createStorageStream', () => {
  it('creates a read stream at the absolute path and returns its result', () => {
    const abs = resolve(resolve(process.cwd(), 'storage'), '2/5.pdf')
    const stream = createStorageStream('2/5.pdf')
    expect(fsMocks.createReadStream).toHaveBeenCalledWith(abs)
    expect(stream).toBe('MOCK_STREAM')
  })
})

describe('getFileSize', () => {
  beforeEach(() => fsMocks.stat.mockReset())

  it('returns the size field from stat', async () => {
    fsMocks.stat.mockResolvedValue({ size: 2048 })
    expect(await getFileSize('4/8.bin')).toBe(2048)
  })

  it('rethrows the error when stat fails', async () => {
    fsMocks.stat.mockImplementationOnce(() => { throw new Error('ENOENT') })
    await expect(getFileSize('4/missing.bin')).rejects.toThrow('ENOENT')
  })
})