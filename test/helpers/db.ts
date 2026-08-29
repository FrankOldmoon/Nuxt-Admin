import { vi } from 'vitest'

/**
 * Build an awaitable drizzle chain query object.
 * A drizzle query looks like `await db.select().from().where().limit()`; each method
 * returns itself and the whole thing can be awaited. This uses a Proxy so that any
 * method call returns the same awaitable chain.
 */
export function buildChain<T>(final: T) {
  const chain: any = new Proxy(function () {}, {
    get: (_target, prop) => {
      if (prop === 'then') {
        // make `await chain` resolve to final
        return (resolve: (v: T) => void) => Promise.resolve(final).then(resolve)
      }
      // other properties (returning / values / set / where / limit / offset ...) keep returning the chain
      return () => chain
    },
    apply: () => chain
  })
  return chain
}

export interface DbMethodResults {
  select?: unknown
  insert?: unknown
  update?: unknown
  delete?: unknown
}

/**
 * Create a drizzle mock db object whose results can be configured per top-level method.
 * Usage:
 *   const db = createDbMock({ select: [{ id: 1 }] })
 *   const { db: mockedDb } = vi.mockedModule('../…/db', () => ({ db, schema: {}, pool: {} }))
 */
export function createDbMock(results: DbMethodResults = {}) {
  return {
    select: vi.fn(() => buildChain(results.select)),
    insert: vi.fn(() => buildChain(results.insert)),
    update: vi.fn(() => buildChain(results.update)),
    delete: vi.fn(() => buildChain(results.delete))
  }
}

/** Convenience: configure a top-level db method to return different results in call order. */
export function mockDbCalls(db: ReturnType<typeof createDbMock>, method: 'select' | 'insert' | 'update' | 'delete', results: unknown[]) {
  db[method]
    .mockReset()
    .mockImplementation(() => buildChain(results.shift()))
}