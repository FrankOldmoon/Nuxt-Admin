import { afterAll, describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import {
  InMemoryRealtimeBus,
  PostgresRealtimeBus,
  createRealtimeBus,
  type RealtimeEnvelope
} from '../../../../server/core/realtimeBus'

describe('InMemoryRealtimeBus', () => {
  it('delivers to every subscriber until unsubscribed', async () => {
    const bus = new InMemoryRealtimeBus()
    const received: RealtimeEnvelope[] = []
    const unsubscribe = await bus.subscribe(event => received.push(event))

    await bus.publish({ kind: 'user', userId: 7, data: { type: 'x' } })
    await bus.publish({ kind: 'all', data: { type: 'y' } })
    expect(received.map(event => event.kind)).toEqual(['user', 'all'])
    expect(received[0]?.userId).toBe(7)

    unsubscribe()
    await bus.publish({ kind: 'all', data: { type: 'z' } })
    expect(received).toHaveLength(2)
    await bus.close()
  })

  it('isolates subscriber failures', async () => {
    const bus = new InMemoryRealtimeBus()
    const received: string[] = []
    await bus.subscribe(() => {
      throw new Error('boom')
    })
    await bus.subscribe(event => received.push(event.kind))
    await bus.publish({ kind: 'all', data: {} })
    expect(received).toEqual(['all'])
  })
})

describe('createRealtimeBus', () => {
  it('defaults to memory and validates configuration', () => {
    expect(createRealtimeBus({})).toBeInstanceOf(InMemoryRealtimeBus)
    expect(createRealtimeBus({ driver: 'MEMORY' })).toBeInstanceOf(InMemoryRealtimeBus)
    expect(() => createRealtimeBus({ driver: 'postgres' })).toThrow('requires a database pool')
    expect(() => createRealtimeBus({ driver: 'redis' })).toThrow('Unsupported realtime driver: redis')
  })
})

describe('PostgresRealtimeBus (LISTEN/NOTIFY)', () => {
  const channel = `app_realtime_test_${Math.random().toString(36).slice(2, 8)}`
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/nuxt_ai',
    max: 3
  })
  const bus = new PostgresRealtimeBus(pool, channel)
  let unsubscribe: (() => void) | null = null

  afterAll(async () => {
    unsubscribe?.()
    await bus.close()
    await pool.end()
  })

  it('delivers events across independent connections', async () => {
    const received: RealtimeEnvelope[] = []
    unsubscribe = await bus.subscribe(event => received.push(event))

    await bus.publish({ kind: 'user', userId: 42, data: { type: 'message:new' } })

    const deadline = Date.now() + 3000
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ kind: 'user', userId: 42 })

    await expect(bus.publish({ kind: 'all', data: { payload: 'x'.repeat(8000) } }))
      .rejects.toThrow('Realtime payload exceeds')
  })
})
