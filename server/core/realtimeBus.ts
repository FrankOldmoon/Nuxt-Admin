import { randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'

/**
 * Cross-instance realtime envelope. `user` events target one user, `all`
 * events broadcast to every connected user, and `presence` events only update
 * the receiver's remote-presence bookkeeping (never sent to browsers).
 */
export interface RealtimeEnvelope {
  kind: 'user' | 'all' | 'presence'
  instanceId: string
  userId?: number
  data?: unknown
}

export type RealtimeHandler = (event: RealtimeEnvelope) => void

export interface RealtimeBus {
  /** Publish an event to every application instance. */
  publish(event: Omit<RealtimeEnvelope, 'instanceId'>): Promise<void>
  /** Subscribe; returns an unsubscribe function. */
  subscribe(handler: RealtimeHandler): Promise<() => void>
  close(): Promise<void>
}

/** Single-process bus used in development and single-instance deployments. */
export class InMemoryRealtimeBus implements RealtimeBus {
  private readonly handlers = new Set<RealtimeHandler>()
  private readonly instanceId = randomUUID()

  async publish(event: Omit<RealtimeEnvelope, 'instanceId'>): Promise<void> {
    const envelope: RealtimeEnvelope = { ...event, instanceId: this.instanceId }
    for (const handler of this.handlers) {
      try {
        handler(envelope)
      } catch {
        // A broken subscriber must not break other subscribers.
      }
    }
  }

  async subscribe(handler: RealtimeHandler): Promise<() => void> {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  async close(): Promise<void> {
    this.handlers.clear()
  }
}

const CHANNEL_PATTERN = /^[a-z_][a-z0-9_]*$/
/** PostgreSQL NOTIFY payload limit is 8000 bytes; keep headroom. */
const MAX_PAYLOAD_BYTES = 7000

/**
 * Multi-instance bus built on PostgreSQL LISTEN/NOTIFY. No extra service is
 * required (the app already depends on PostgreSQL); the payload is JSON and
 * intentionally small (presence + notification identifiers).
 */
export class PostgresRealtimeBus implements RealtimeBus {
  private readonly instanceId = randomUUID()
  private listener: PoolClient | null = null
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly pool: Pool,
    private readonly channel = 'app_realtime'
  ) {
    if (!CHANNEL_PATTERN.test(channel)) {
      throw new Error(`Invalid realtime channel: ${channel}`)
    }
  }

  async publish(event: Omit<RealtimeEnvelope, 'instanceId'>): Promise<void> {
    const payload = JSON.stringify({ ...event, instanceId: this.instanceId })
    if (Buffer.byteLength(payload, 'utf8') > MAX_PAYLOAD_BYTES) {
      throw new Error(`Realtime payload exceeds ${MAX_PAYLOAD_BYTES} bytes`)
    }
    await this.pool.query('SELECT pg_notify($1, $2)', [this.channel, payload])
  }

  async subscribe(handler: RealtimeHandler): Promise<() => void> {
    if (this.listener) return this.unsubscribe ?? (() => {})
    const client = await this.pool.connect()
    this.listener = client
    client.on('notification', (message) => {
      if (message.channel !== this.channel || !message.payload) return
      try {
        handler(JSON.parse(message.payload) as RealtimeEnvelope)
      } catch {
        // Ignore malformed payloads from other producers.
      }
    })
    client.on('error', () => {
      // The pool will discard the broken connection; callers can re-subscribe.
      this.listener = null
      this.unsubscribe = null
    })
    await client.query(`LISTEN "${this.channel}"`)
    this.unsubscribe = () => {
      void client.query(`UNLISTEN "${this.channel}"`).catch(() => {})
      client.release()
      this.listener = null
      this.unsubscribe = null
    }
    return this.unsubscribe
  }

  async close(): Promise<void> {
    this.unsubscribe?.()
  }
}

export interface RealtimeBusOptions {
  driver?: string
  pool?: Pool
  channel?: string
}

/**
 * Select the realtime bus from configuration. `postgres` scales across
 * instances; `memory` (default) keeps local development dependency-free.
 */
export function createRealtimeBus(options: RealtimeBusOptions): RealtimeBus {
  const driver = (options.driver ?? 'memory').toLowerCase()
  if (driver === 'memory') return new InMemoryRealtimeBus()
  if (driver === 'postgres') {
    if (!options.pool) throw new Error('Postgres realtime bus requires a database pool')
    return new PostgresRealtimeBus(options.pool, options.channel)
  }
  throw new Error(`Unsupported realtime driver: ${driver}`)
}
