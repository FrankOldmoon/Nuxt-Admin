import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({
  db: { __mockDb: true },
  schema: { __mockSchema: true },
  pool: { __mockPool: true }
}))

vi.mock('../../../server/database', () => ({
  db: h.db,
  schema: h.schema,
  pool: h.pool
}))

import * as dbModule from '../../../server/utils/db'

describe('server/utils/db', () => {
  it('re-exports db from the database module as the same reference', () => {
    expect(dbModule.db).toBe(h.db)
    expect(dbModule.db).toMatchObject({ __mockDb: true })
  })

  it('re-exports schema from the database module as the same reference', () => {
    expect(dbModule.schema).toBe(h.schema)
  })

  it('re-exports pool from the database module as the same reference', () => {
    expect(dbModule.pool).toBe(h.pool)
  })

  it('exports exactly db / schema / pool', () => {
    expect(Object.keys(dbModule).sort()).toEqual(['db', 'pool', 'schema'])
  })
})
