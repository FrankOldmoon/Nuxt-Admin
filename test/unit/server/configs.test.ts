import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildChain } from '../../helpers/db'

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

import { getAllConfigs, getConfig, getConfigValue, upsertConfig } from '../../../server/utils/configs'

const rows = [
  { id: 1, key: 'site.title', value: 'Nuxt AI', type: 'string', description: null, updatedAt: new Date() },
  { id: 2, key: 'site.allowRegistration', value: 'true', type: 'boolean', description: null, updatedAt: new Date() },
  { id: 3, key: 'security.sessionTtlDays', value: '7', type: 'number', description: null, updatedAt: new Date() }
]

describe('configs', () => {
  // db.select always returns the same data, ensuring re-queries after cache invalidation see the same result
  beforeEach(() => {
    db.select.mockReset()
    db.select.mockImplementation(() => buildChain(rows))
  })

  it('getAllConfigs returns all configs', async () => {
    const all = await getAllConfigs()
    expect(all).toHaveLength(3)
    expect(all.map(c => c.key)).toEqual(['site.title', 'site.allowRegistration', 'security.sessionTtlDays'])
  })

  it('getConfig finds a config by key', async () => {
    expect(await getConfig('site.title')).toMatchObject({ value: 'Nuxt AI' })
  })

  it('getConfig returns null when not found', async () => {
    expect(await getConfig('missing')).toBeNull()
  })

  it('getConfigValue parses a string', async () => {
    expect(await getConfigValue('site.title', 'fallback')).toBe('Nuxt AI')
  })

  it('getConfigValue parses a boolean', async () => {
    expect(await getConfigValue('site.allowRegistration', false)).toBe(true)
  })

  it('getConfigValue parses a number', async () => {
    expect(await getConfigValue('security.sessionTtlDays', 1)).toBe(7)
  })

  it('getConfigValue returns the fallback when missing', async () => {
    expect(await getConfigValue('nope', 'default')).toBe('default')
  })

  it('upsertConfig calls insert and returns the new row', async () => {
    const newRow = { id: 9, key: 'x.y', value: 'v', type: 'string', description: null, updatedAt: new Date() }
    db.insert.mockImplementation(() => buildChain([newRow]))
    const result = await upsertConfig({ key: 'x.y', value: 'v' })
    expect(result).toMatchObject({ value: 'v' })
    expect(db.insert).toHaveBeenCalled()
    // after a write the cache is invalidated, so the next read re-queries
    db.select.mockClear()
    await getAllConfigs()
    expect(db.select).toHaveBeenCalled()
  })
})