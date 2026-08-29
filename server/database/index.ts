import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from 'process'
import * as schema from './schema'

const connectionString = env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Please configure it in your .env file.')
}

// Pool tuning (override via env in production):
//   DB_POOL_MAX            - max connections (default 10)
//   DB_POOL_IDLE_TIMEOUT   - idle close timeout in ms (default 30000)
//   DB_POOL_CONNECT_TIMEOUT - connection acquire timeout in ms (default 2000)
function readInt(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

const pool = new Pool({
  connectionString,
  max: readInt(env.DB_POOL_MAX, 10),
  idleTimeoutMillis: readInt(env.DB_POOL_IDLE_TIMEOUT, 30_000),
  connectionTimeoutMillis: readInt(env.DB_POOL_CONNECT_TIMEOUT, 2_000)
})

// Per pg docs, always register `pool.on('error')` — otherwise a network
// error that brings down the pool can crash the Node process via uncaught
// exception on idle clients in the pool.
pool.on('error', (err) => {
  console.error('[database] unexpected error on idle client', err)
})

export const db = drizzle(pool, { schema })

export type Database = typeof db

export { schema, pool }
